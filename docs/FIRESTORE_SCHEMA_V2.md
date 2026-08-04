# Firestore Schema v2 — Valquirias TLV

> Versión: **v2 (rediseño Valquirias TLV)** — reemplaza el esquema v1 donde
> todo era lectura pública y la seguridad dependía de esconder la URL.
>
> **Regla de oro:** el piso de $15.000.000 SOLO existe en MED. BOG nunca
> debe siquiera saber que existe ese campo. Toda la separación se hace
> con **custom claims** de Firebase Auth + reglas de Firestore (ver
> `firestore.rules`).

---

## 1. Auth: quién es quién

Todos entran por **Firebase Auth con Magic Link** (email link sign-in).
Al crear el usuario (vía Cloud Function `crearVendedora`) se le asignan
tres **custom claims** que viajan en el ID token:

| Claim     | Valores permitidos                     | Significado |
|-----------|----------------------------------------|-------------|
| `ciudad`  | `'MED'` \| `'BOG'`                     | Ciudad donde trabaja. Determina qué config puede leer. |
| `rol`     | `'vendedora'` \| `'oficina'` \| `'admin'` | Nivel de permisos. |
| `activa`  | `true` \| `false`                      | Si es `false` → todas las reglas la rechazan. Único switch de revocación. |

### Ejemplos de claims por usuario

**Vendedora MED (ej. Lorena Castrillon):**
```json
{
  "ciudad": "MED",
  "rol": "vendedora",
  "activa": true
}
```

**Vendedora BOG:**
```json
{
  "ciudad": "BOG",
  "rol": "vendedora",
  "activa": true
}
```

**Oficina (Carolina) — trabaja en Medellín pero opera ambas ciudades:**
```json
{
  "ciudad": "MED",
  "rol": "oficina",
  "activa": true
}
```
> Nota: Carolina como `oficina` puede escribir en `registros`, `vendidas` y
> `metas` de ambas ciudades. Pero solo puede LEER `config-med` (no
> `config-bog`) porque su `ciudad` es MED. Si en algún momento necesita
> leer datos de BOG específicos, se le expone vía `config-comun` o se le
> crea un rol nuevo. Hoy no lo necesita.

**Admin (Luis):**
```json
{
  "ciudad": "MED",
  "rol": "admin",
  "activa": true
}
```
> Admin también respeta la partición de ciudad para LECTURA (por si
> algún día se contrata un admin BOG). Si Luis necesita ver `config-bog`
> desde la UI, usa el Firebase Console o un script con Admin SDK — no la
> app cliente.

**Vendedora dada de baja:**
```json
{
  "ciudad": "MED",
  "rol": "vendedora",
  "activa": false
}
```
> Con `activa: false`, la función `autenticadoActivo()` de las reglas
> devuelve `false` y todas las lecturas/escrituras quedan denegadas —
> aunque el usuario aún tenga el link mágico o un token viejo.

---

## 2. Colecciones y documentos

### 2.1 Colección `televentas` (single-collection legacy, conservada)

Cada doc guarda un JSON stringificado en su campo `data`. Los `docId`
válidos son:

| docId          | Contenido                                 | Read                        | Write            |
|----------------|-------------------------------------------|-----------------------------|------------------|
| `config-med`   | **Piso $15M**, metas MED, parámetros MED  | Solo `ciudad == 'MED'` y activa | admin            |
| `config-bog`   | Metas BOG, parámetros BOG                 | Solo `ciudad == 'BOG'` y activa | admin            |
| `config-comun` | Fecha corte V2, versión app, feriados     | Cualquier autenticado activo    | admin            |
| `vendedoras`   | Roster (id, nombre, email, ciudad, activa)| Cualquier autenticado activo    | admin            |
| `vendidas`     | Ventas diarias/mensuales                  | Cualquier autenticado activo    | oficina o admin  |
| `registros`    | Registros diarios crudos                  | Cualquier autenticado activo    | oficina o admin  |
| `metas`        | Metas mensuales por ciudad                | Cualquier autenticado activo    | oficina o admin  |
| `snapshots`    | Cierres históricos                        | Cualquier autenticado activo    | admin            |

#### Separación MED / BOG en la práctica

- **`config-med`** contiene el campo `pisoVentasMED: 15000000`. BOG jamás
  puede leer este doc → jamás sabe que existe el piso.
- **`config-bog`** NO tiene campo `pisoVentas` (BOG no tiene piso).
- La app cliente, al iniciar, lee `config-comun` + `config-<ciudad>` según
  el claim del usuario. Nunca intenta leer la ciudad ajena.
- Los docs `vendedoras` / `vendidas` / `registros` sí son compartidos —
  contienen datos de ambas ciudades y la app los filtra por `ciudad` en
  el cliente para armar ranking/boletín. Esto es aceptable porque:
  1. Saber los nombres del roster no es sensible.
  2. Las cifras de ventas de la otra ciudad tampoco son sensibles.
  3. Lo único sensible es el PISO $15M y el hecho de que existe → ese vive
     aislado en `config-med`.

### 2.2 Colección `accesos_log`

Trigger `logAcceso` de Cloud Functions escribe aquí en cada sign-in:

```
accesos_log/{eventoId}
  ├─ uid            : string
  ├─ email          : string
  ├─ ciudad         : 'MED' | 'BOG'
  ├─ rol            : 'vendedora' | 'oficina' | 'admin'
  ├─ timestamp      : serverTimestamp
  ├─ ip             : string (best-effort)
  └─ userAgent      : string
```

- **Read:** solo admin.
- **Write:** nadie desde el cliente. Solo Cloud Functions (Admin SDK
  bypassea reglas).

### 2.3 Colección `whitelist`

Lista blanca de emails autorizados a recibir Magic Link. Sin esto, un
atacante podría pedir link a cualquier correo.

```
whitelist/{emailNormalizado}     // emailNormalizado = email en minúsculas, sin espacios
  ├─ email      : string
  ├─ ciudad     : 'MED' | 'BOG'
  ├─ rol        : 'vendedora' | 'oficina' | 'admin'
  ├─ activa     : bool
  ├─ agregadoPor: string (uid del admin)
  └─ agregadoEn : serverTimestamp
```

- **Read/Write:** solo admin.
- La Cloud Function `enviarMagicLink({ email })` consulta este doc antes
  de emitir el link. Si el email no está o `activa == false` → rechaza.

---

## 3. Diagrama de flujo de acceso

```
Vendedora abre app
      │
      ▼
Pide link mágico a su email
      │
      ▼  (Cloud Function enviarMagicLink)
¿email en whitelist Y activa?  ── no ──> silencioso: "si existe, te llegará"
      │ sí
      ▼
Firebase Auth envía link
      │
      ▼
Vendedora clickea link → obtiene ID token con custom claims
      │
      ▼
App lee claim.ciudad → decide qué config-* pedir
      │
      ▼
Firestore rules verifican:
  - autenticada
  - activa == true
  - ciudad correcta
      │
      ▼
Devuelve solo los docs permitidos.
Ningún dato de MED (piso $15M) llega a BOG.
```

---

## 4. Rotación / revocación

Para desactivar a una vendedora (ejemplo: renuncia):

1. Admin llama `revocarVendedora({ email })` (Cloud Function).
2. Función marca `activa: false` en:
   - custom claim del usuario en Auth
   - doc `whitelist/{emailNormalizado}`
   - doc `televentas/vendedoras` (marca la fila como inactiva)
3. Función llama `admin.auth().revokeRefreshTokens(uid)` → invalida
   tokens viejos.
4. La próxima llamada a Firestore desde la vendedora devolverá
   `permission-denied`, aunque tenga el link mágico guardado.

---

## 5. Checklist de blindaje (para verificar antes de deploy)

- [ ] `firestore.rules` publicado en Firebase (via `firebase deploy --only firestore:rules`).
- [ ] Cloud Function `crearVendedora` desplegada (requiere plan Blaze).
- [ ] Todos los usuarios existentes migrados con custom claims correctos.
- [ ] Whitelist poblada.
- [ ] Doc `config-med` creado con `pisoVentasMED: 15000000`.
- [ ] Doc `config-bog` creado SIN `pisoVentas`.
- [ ] Doc `config-comun` con `fechaCorteV2`, `versionApp`.
- [ ] Test manual: usuario BOG intenta leer `config-med` → debe fallar
      con `permission-denied` (no `not-found`).
- [ ] Test manual: usuario con `activa: false` intenta leer cualquier
      cosa → todo falla.
