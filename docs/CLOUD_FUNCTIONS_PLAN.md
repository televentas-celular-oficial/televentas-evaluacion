# Cloud Functions Plan — Valquirias TLV

> **Requiere plan Blaze** de Firebase (pay-as-you-go). El plan Spark
> gratuito no permite Cloud Functions con dependencias externas ni
> llamadas de red salientes. Costo esperado con < 100 usuarios: casi $0
> (dentro del free tier de Blaze).
>
> **Runtime:** Node.js 20, Firebase Functions v2 (`onCall`, `onRequest`,
> `beforeUserSignedIn` / `beforeUserCreated` blocking triggers).

---

## 0. Setup inicial (una sola vez)

```bash
cd /Users/luis/televentas-evaluacion
firebase login
firebase init functions
# Selecciona: JavaScript, Node 20, No a ESLint (por ahora)
cd functions
npm install firebase-admin firebase-functions
```

Estructura esperada:

```
functions/
├── package.json
├── index.js         ← exporta las funciones
└── lib/
    ├── crearVendedora.js
    ├── revocarVendedora.js
    ├── logAcceso.js
    └── enviarMagicLink.js
```

En `functions/index.js`:

```js
const { crearVendedora }    = require('./lib/crearVendedora');
const { revocarVendedora }  = require('./lib/revocarVendedora');
const { logAcceso }         = require('./lib/logAcceso');
const { enviarMagicLink }   = require('./lib/enviarMagicLink');

exports.crearVendedora   = crearVendedora;
exports.revocarVendedora = revocarVendedora;
exports.logAcceso        = logAcceso;
exports.enviarMagicLink  = enviarMagicLink;
```

---

## 1. `crearVendedora({ nombre, email, ciudad, rol })`

Crea usuario en Firebase Auth, le asigna custom claims, agrega a whitelist
y actualiza el roster en Firestore. **Solo admin puede invocarla.**

**Archivo:** `functions/lib/crearVendedora.js`

```js
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp();

const EMAIL_ADMIN = 'luisponce.tv@gmail.com';

exports.crearVendedora = onCall(
  { region: 'us-central1', enforceAppCheck: false },
  async (request) => {
    // 1. Solo admin puede llamar
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }
    if (request.auth.token.email !== EMAIL_ADMIN
        && request.auth.token.rol !== 'admin') {
      throw new HttpsError('permission-denied', 'Solo admin puede crear vendedoras.');
    }

    // 2. Validar payload
    const { nombre, email, ciudad, rol } = request.data || {};
    if (!nombre || !email || !ciudad || !rol) {
      throw new HttpsError('invalid-argument', 'Faltan campos.');
    }
    if (!['MED', 'BOG'].includes(ciudad)) {
      throw new HttpsError('invalid-argument', "ciudad debe ser 'MED' o 'BOG'.");
    }
    if (!['vendedora', 'oficina', 'admin'].includes(rol)) {
      throw new HttpsError('invalid-argument', "rol inválido.");
    }

    const emailNorm = email.trim().toLowerCase();

    // 3. Crear usuario en Auth (o recuperar si ya existe)
    let userRecord;
    try {
      userRecord = await admin.auth().createUser({
        email: emailNorm,
        displayName: nombre,
        emailVerified: true,
      });
    } catch (err) {
      if (err.code === 'auth/email-already-exists') {
        userRecord = await admin.auth().getUserByEmail(emailNorm);
      } else {
        throw new HttpsError('internal', err.message);
      }
    }

    // 4. Asignar custom claims
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      ciudad,
      rol,
      activa: true,
    });

    // 5. Agregar a whitelist
    const db = admin.firestore();
    await db.collection('whitelist').doc(emailNorm).set({
      email: emailNorm,
      ciudad,
      rol,
      activa: true,
      agregadoPor: request.auth.uid,
      agregadoEn: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 6. Actualizar roster en televentas/vendedoras
    const rosterRef = db.collection('televentas').doc('vendedoras');
    const snap = await rosterRef.get();
    const data = snap.exists ? JSON.parse(snap.data().data || '[]') : [];
    const idx = data.findIndex(v => (v.email || '').toLowerCase() === emailNorm);
    const nueva = {
      uid: userRecord.uid,
      nombre,
      email: emailNorm,
      ciudad,
      rol,
      activa: true,
    };
    if (idx >= 0) data[idx] = { ...data[idx], ...nueva };
    else data.push(nueva);
    await rosterRef.set({ data: JSON.stringify(data) }, { merge: true });

    return { ok: true, uid: userRecord.uid };
  }
);
```

---

## 2. `revocarVendedora({ email })`

Desactiva los claims, marca inactiva en whitelist y roster, revoca tokens.

**Archivo:** `functions/lib/revocarVendedora.js`

```js
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp();

const EMAIL_ADMIN = 'luisponce.tv@gmail.com';

exports.revocarVendedora = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }
    if (request.auth.token.email !== EMAIL_ADMIN
        && request.auth.token.rol !== 'admin') {
      throw new HttpsError('permission-denied', 'Solo admin puede revocar.');
    }

    const { email } = request.data || {};
    if (!email) throw new HttpsError('invalid-argument', 'Falta email.');
    const emailNorm = email.trim().toLowerCase();

    const user = await admin.auth().getUserByEmail(emailNorm);
    const claimsActuales = user.customClaims || {};

    // 1. Marcar activa:false en claims (conservamos ciudad/rol para auditoría)
    await admin.auth().setCustomUserClaims(user.uid, {
      ...claimsActuales,
      activa: false,
    });

    // 2. Revocar refresh tokens (invalida sesiones viejas en ~1h max)
    await admin.auth().revokeRefreshTokens(user.uid);

    // 3. Whitelist
    const db = admin.firestore();
    await db.collection('whitelist').doc(emailNorm).set(
      { activa: false, revocadaEn: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    // 4. Roster
    const rosterRef = db.collection('televentas').doc('vendedoras');
    const snap = await rosterRef.get();
    if (snap.exists) {
      const data = JSON.parse(snap.data().data || '[]');
      const idx = data.findIndex(v => (v.email || '').toLowerCase() === emailNorm);
      if (idx >= 0) {
        data[idx].activa = false;
        await rosterRef.set({ data: JSON.stringify(data) }, { merge: true });
      }
    }

    return { ok: true };
  }
);
```

---

## 3. `logAcceso` (trigger blocking en sign-in)

Registra cada login en `accesos_log`. Además rechaza si `activa != true`
(doble defensa además de las Firestore rules).

**Archivo:** `functions/lib/logAcceso.js`

```js
const { beforeUserSignedIn } = require('firebase-functions/v2/identity');
const { HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp();

exports.logAcceso = beforeUserSignedIn(
  { region: 'us-central1' },
  async (event) => {
    const user = event.data;
    const claims = user.customClaims || {};

    // 1. Bloquear si no está activa
    if (claims.activa !== true) {
      throw new HttpsError('permission-denied', 'Usuaria desactivada.');
    }

    // 2. Log en Firestore (best-effort, no bloqueante)
    try {
      await admin.firestore().collection('accesos_log').add({
        uid: user.uid,
        email: user.email || null,
        ciudad: claims.ciudad || null,
        rol: claims.rol || null,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        ip: event.ipAddress || null,
        userAgent: event.userAgent || null,
      });
    } catch (err) {
      console.error('Fallo al escribir accesos_log:', err);
      // no throw — no queremos bloquear el login por un log fallido
    }

    // 3. Devolver claims (sin modificar). Se pueden refrescar aquí si quisiéramos.
    return {};
  }
);
```

> **Nota:** `beforeUserSignedIn` requiere activar Identity Platform
> (viene con Blaze). Si prefieres no bloquear, cambia a
> `functions.auth.user().onCreate` para solo loggear creación, y el
> chequeo de `activa` déjalo solo en las Firestore rules.

---

## 4. `enviarMagicLink({ email })`

Emite un email link Sign-In **solo si el email está en whitelist y
activa**. Se llama desde la pantalla de login antes de que el usuario
autentique — por eso es `onCall` sin auth requerida, pero valida por
whitelist.

**Archivo:** `functions/lib/enviarMagicLink.js`

```js
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const { defineSecret } = require('firebase-functions/params');

if (!admin.apps.length) admin.initializeApp();

// Secrets: configúralos con `firebase functions:secrets:set SMTP_USER`
const SMTP_USER = defineSecret('SMTP_USER');
const SMTP_PASS = defineSecret('SMTP_PASS');

const APP_URL = 'https://televentas-evaluacion.netlify.app/finishSignIn';

exports.enviarMagicLink = onCall(
  { region: 'us-central1', secrets: [SMTP_USER, SMTP_PASS] },
  async (request) => {
    const { email } = request.data || {};
    if (!email) throw new HttpsError('invalid-argument', 'Falta email.');
    const emailNorm = email.trim().toLowerCase();

    // 1. Chequeo silencioso: si NO está en whitelist o inactiva → OK vacío
    //    (no filtramos si el email existe o no)
    const wl = await admin.firestore().collection('whitelist').doc(emailNorm).get();
    if (!wl.exists || wl.data().activa !== true) {
      return { ok: true }; // respuesta idéntica al caso válido
    }

    // 2. Generar link mágico con Firebase Auth
    const actionCodeSettings = {
      url: APP_URL,
      handleCodeInApp: true,
    };
    const link = await admin.auth().generateSignInWithEmailLink(
      emailNorm,
      actionCodeSettings
    );

    // 3. Enviar por SMTP (ejemplo con Gmail + app password; ajustar al proveedor real)
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: SMTP_USER.value(),
        pass: SMTP_PASS.value(),
      },
    });

    await transporter.sendMail({
      from: `"Valquirias TLV" <${SMTP_USER.value()}>`,
      to: emailNorm,
      subject: 'Tu acceso a Valquirias TLV',
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: auto;">
          <h2>Hola,</h2>
          <p>Este es tu enlace de acceso a Valquirias TLV. Es válido por
             <strong>1 hora</strong> y solo se puede usar <strong>una vez</strong>.</p>
          <p style="margin: 24px 0;">
            <a href="${link}"
               style="background:#7c3aed;color:#fff;padding:12px 20px;
                      text-decoration:none;border-radius:8px;font-weight:600;">
              Entrar
            </a>
          </p>
          <p style="color:#666;font-size:13px;">
            Si tú no pediste este enlace, ignora este correo.
          </p>
        </div>
      `,
    });

    return { ok: true };
  }
);
```

`functions/package.json` debe incluir:

```json
{
  "dependencies": {
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^5.0.0",
    "nodemailer": "^6.9.0"
  },
  "engines": { "node": "20" }
}
```

---

## 5. Deploy paso a paso

1. **Activar Blaze:**
   Firebase Console → Upgrade → seleccionar Blaze → agregar tarjeta.
   Recomiendo poner **presupuesto con alerta** en $5 USD/mes (más que
   suficiente margen para esta app).

2. **Instalar Firebase CLI (si no está):**
   ```bash
   npm install -g firebase-tools
   firebase login
   ```

3. **Inicializar funciones en el repo:**
   ```bash
   cd /Users/luis/televentas-evaluacion
   firebase init functions
   ```

4. **Instalar deps:**
   ```bash
   cd functions
   npm install firebase-admin firebase-functions nodemailer
   ```

5. **Configurar secrets (para el SMTP):**
   ```bash
   firebase functions:secrets:set SMTP_USER
   # (te pide el valor; pega el email)
   firebase functions:secrets:set SMTP_PASS
   # (app password de Gmail — NO tu password normal)
   ```

6. **Deploy solo funciones:**
   ```bash
   firebase deploy --only functions
   ```

7. **Deploy de reglas Firestore actualizadas:**
   ```bash
   firebase deploy --only firestore:rules
   ```

8. **Migración inicial de usuarios existentes:**
   Ejecutar UNA vez un script Node local (Admin SDK) que:
   - Recorre la lista actual de vendedoras del doc `televentas/vendedoras`.
   - Para cada una: llama `admin.auth().createUser` (o get) y
     `setCustomUserClaims({ ciudad, rol: 'vendedora', activa: true })`.
   - Agrega a `whitelist`.
   Script sugerido: `functions/scripts/migrar-vendedoras.js` (correr con
   `GOOGLE_APPLICATION_CREDENTIALS=serviceAccount.json node scripts/migrar-vendedoras.js`).

9. **Verificación post-deploy:**
   - Loggear como vendedora BOG y en DevTools tratar de leer
     `config-med` → debe dar `permission-denied`.
   - Loggear como vendedora con `activa:false` → todas las lecturas
     deben fallar.
   - Ver que `accesos_log` se llene con cada sign-in.

---

## 6. Costos estimados (Blaze, < 100 usuarios activos)

| Recurso                       | Uso esperado         | Costo    |
|-------------------------------|----------------------|----------|
| Cloud Functions invocations   | ~2k / mes            | $0 (free tier: 2M) |
| Firestore reads               | ~50k / mes           | $0 (free tier: 50k/día) |
| Firestore writes              | ~5k / mes            | $0 (free tier: 20k/día) |
| Outbound email (SMTP Gmail)   | ~500 / mes           | $0 (usa cuenta propia) |
| Identity Platform (blocking)  | < 1k logins / mes    | $0 (free tier: 50k MAU) |

**Total esperado: $0 – $1 USD/mes.**
