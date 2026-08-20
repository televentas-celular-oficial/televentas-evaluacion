// Reglas de acceso compartidas por los DOS caminos de ingreso.
// ============================================================================
// Puerta principal  → correo y contraseña   (IngresoClave.jsx)
// Salida de emergencia → link mágico al correo (LoginMagicLink.jsx)
//
// Todo lo que decide QUIÉN entra vive aquí, en un solo lugar, para que los dos
// caminos no se separen con el tiempo. Si mañana cambia la whitelist, cambia
// una sola función y los dos caminos quedan iguales.
//
// IMPORTANTE — el roster NO se puede consultar antes de autenticar. Las reglas
// de Firestore (`allow read: if autenticado()`) exigen sesión para leer el doc
// `vendedoras`. Por eso el orden real es siempre:
//   1) autenticar contra Firebase   2) verificar roster   3) signOut si no está.
// Es el mismo orden que ya usaba el link mágico desde el primer día.
// ============================================================================

import { doc, getDoc } from "firebase/firestore";
import {
  setPersistence,
  indexedDBLocalPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import { auth, db } from "../../firebase.js";
import { EMAIL_ADMIN, EMAIL_OFICINA } from "../../lib/constantes.js";

// Email pendiente de canjear un link mágico (lo escribe quien pide el link)
export const STORAGE_KEY = "valquirias_pending_email";
// Último correo con el que se entró: pre-rellena el campo la próxima vez
export const LAST_EMAIL_KEY = "valquirias_last_email";

// Por qué se le negó el paso. Vive en sessionStorage a propósito:
// signIn* dispara onAuthStateChanged con el usuario, el padre (ValquiriasApp)
// deja de renderizar la pantalla de ingreso, y cuando el signOut del rechazo la
// vuelve a montar, todo su useState se perdió. Ese era el "rechazo mudo": ella
// quedaba en el login limpio, sin saber qué pasó. sessionStorage sobrevive ese
// desmonte y se limpia sola al cerrar la pestaña.
// Aplica IGUAL al ingreso con contraseña: el desmonte ocurre exactamente igual.
export const MOTIVO_KEY = "valquirias_motivo_acceso";

// Safari en modo privado tira excepción al tocar storage: nunca debe tumbar el login.
export const lee = (store, k) => { try { return window[store].getItem(k); } catch { return null; } };
export const guarda = (store, k, v) => { try { window[store].setItem(k, v); } catch { /* sin storage */ } };
export const borra = (store, k) => { try { window[store].removeItem(k); } catch { /* sin storage */ } };

// Lo que ella escribe en el teléfono trae espacio al final (autocompletado) y
// mayúscula inicial (autocapitalize de iOS). "Ana@X.com " ≠ "ana@x.com".
export const normalizaEmail = (v) => (v || "").trim().toLowerCase();
export const pareceEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// Firebase exige 6. No pedimos más: son 13 personas entrando de noche desde el
// celular. Una regla larga de mayúsculas y símbolos deja gente afuera esta noche.
export const CLAVE_MINIMA = 6;

// LA SESIÓN TIENE QUE QUEDAR GUARDADA — es la queja original ("el ícono me pide
// entrar cada vez"). firebase.js ya fija la persistencia al arrancar, pero esa
// llamada es asíncrona y no se espera. Si el login corriera antes de que
// resuelva, la sesión podría quedar con la persistencia por defecto. Aquí se
// espera de verdad, justo antes de cada signIn/createUser: cuesta milisegundos
// y garantiza que la sesión sobreviva al cierre de la app.
//   · indexedDBLocalPersistence → aguanta el PWA instalado en iOS/Android.
//   · browserLocalPersistence   → respaldo si no hay IndexedDB.
export async function asegurarPersistencia() {
  try {
    await setPersistence(auth, indexedDBLocalPersistence);
  } catch {
    try { await setPersistence(auth, browserLocalPersistence); } catch { /* queda la de por defecto */ }
  }
}

export function esCuentaDeLaCasa(emailBajo) {
  return emailBajo === normalizaEmail(EMAIL_ADMIN) || emailBajo === normalizaEmail(EMAIL_OFICINA);
}

// ---------------------------------------------------------------------------
// ¿Este correo autenticado puede entrar?
//
// Devuelve SIEMPRE un objeto (nunca lanza), con:
//   { ok: true }
//   { ok: false, causa: "app-cerrada"      , motivo }  ← el acceso general está apagado
//   { ok: false, causa: "fuera-del-roster" , motivo }  ← no es vendedora activa
//   { ok: false, causa: "error"            , motivo }  ← no se pudo verificar (red/reglas)
//
// La CAUSA importa: quien crea contraseña por primera vez y queda "fuera del
// roster" pierde la cuenta recién creada (se borra), pero con "app-cerrada" o
// "error" la cuenta se conserva — sería criminal borrarle la cuenta a una
// vendedora de verdad porque se cayó el internet en mitad de la verificación.
// ---------------------------------------------------------------------------
export async function verificarAcceso(emailBajo, { via = "clave" } = {}) {
  // Luis y Carolina no pasan por el roster: no son vendedoras, y son justo
  // quienes tienen que poder entrar a arreglar las cosas.
  if (esCuentaDeLaCasa(emailBajo)) return { ok: true };

  try {
    // Gate global de acceso (config.whitelistActiva)
    const cfgSnap = await getDoc(doc(db, "televentas", "config"));
    const cfg = cfgSnap.exists() ? JSON.parse(cfgSnap.data().data || "{}") : {};
    if (!cfg.whitelistActiva) {
      return {
        ok: false,
        causa: "app-cerrada",
        motivo: via === "link"
          ? "🔒 La app todavía no está abierta. Tu link funcionó bien y tu correo quedó registrado: te avisamos apenas la habilitemos. No necesitas pedir otro link."
          : "🔒 La app todavía no está abierta. Tu contraseña quedó guardada: cuando la habilitemos entras con ella. No tienes que hacer nada más.",
      };
    }

    // Whitelist = doc vendedoras (el email vive ahí, no duplicado)
    const vendSnap = await getDoc(doc(db, "televentas", "vendedoras"));
    const vends = vendSnap.exists() ? JSON.parse(vendSnap.data().data || "[]") : [];
    const enWL = vends.some(v =>
      v.activa !== false && !v.eventual && normalizaEmail(v.email) === emailBajo
    );
    if (!enWL) {
      return {
        ok: false,
        causa: "fuera-del-roster",
        motivo: via === "link"
          ? `⚠️ El correo ${emailBajo} no está en la lista de acceso. Tu link estaba bien — lo que falta es que el administrador registre este correo. Escríbele y dile con cuál correo estás entrando.`
          : `⚠️ El correo ${emailBajo} no está en la lista de acceso. Escríbele al administrador y dile con cuál correo estás entrando. Apenas lo registre, vuelves aquí y entras con ese correo y la contraseña que tú quieras.`,
      };
    }

    return { ok: true };
  } catch (e) {
    console.error("Error validando acceso:", e);
    return {
      ok: false,
      causa: "error",
      motivo: "No pudimos verificar tu acceso en este momento. Vuelve a intentar en un minuto o escríbele al administrador.",
    };
  }
}

// ---------------------------------------------------------------------------
// Un mensaje por código de error. Nada de un genérico que las deje sin saber
// qué hacer: cada texto dice qué pasó Y qué hacer ahora.
//
// Reglas de redacción, porque son 13 mujeres entrando por primera vez, de
// noche, desde el celular y sin nadie al lado:
//   · cada texto termina en una acción concreta,
//   · si el problema es del sistema, se dice que no es culpa de ella,
//   · nada de "crear tu contraseña" como paso aparte: ese paso ya no existe,
//     el botón Entrar lo hace solo (ver IngresoClave.jsx).
//
// `contexto` cambia el consejo, no el diagnóstico:
//   "entrar" | "reset" | "cambiar"
// ---------------------------------------------------------------------------
export function mensajeDeError(code, contexto = "entrar") {
  switch (code) {
    // Firebase con "email enumeration protection" (ENCENDIDA en este proyecto)
    // devuelve invalid-credential tanto para contraseña equivocada como para
    // cuenta inexistente. En el ingreso ese caso ya no llega hasta aquí:
    // IngresoClave lo resuelve intentando crear la cuenta y mirando cómo falla.
    // Este texto queda para el resto de los caminos.
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-login-credentials":
      return "Esa contraseña no es la de tu cuenta. Revisa que no te haya quedado un espacio al final y toca el ojito 👁️ para verla mientras la escribes. Si no la recuerdas, usa «Olvidé mi contraseña» aquí abajo.";

    case "auth/invalid-email":
      return "Ese correo no se ve completo. Debe ser algo como nombre@correo.com.";

    case "auth/missing-password":
      return "Te faltó escribir la contraseña.";

    case "auth/weak-password":
    case "auth/password-does-not-meet-requirements":
      return `Esa contraseña quedó corta: necesita mínimo ${CLAVE_MINIMA} letras o números. Escribe una un poco más larga y vuelve a intentar.`;

    case "auth/email-already-in-use":
      return "Ese correo ya tiene cuenta. Entra con la contraseña que pusiste, o usa «Olvidé mi contraseña» aquí abajo.";

    case "auth/user-disabled":
      return "🔒 Tu acceso está desactivado. Escríbele al administrador para que te lo active.";

    case "auth/too-many-requests":
      return "Muchos intentos seguidos. Espera unos 5 minutos y vuelve a intentar — no pasó nada malo con tu cuenta.";

    case "auth/network-request-failed":
      return "No hay internet o está muy lento. Revisa tus datos o el wifi y vuelve a intentar.";

    case "auth/requires-recent-login":
      return "Por seguridad, para cambiar la contraseña hay que haber entrado hace poco. Cierra sesión, vuelve a entrar y cámbiala enseguida.";

    // El administrador no encendió el proveedor "Correo/Contraseña" en Firebase.
    // Sin este mensaje, 13 personas chocarían contra una pared sin explicación.
    case "auth/operation-not-allowed":
      return "El ingreso con contraseña todavía no está habilitado. No es nada que hayas hecho mal: escríbele al administrador y muéstrale este mensaje — falta encender Correo/Contraseña en Firebase (Authentication → Sign-in method).";

    // El proyecto tiene bloqueada la creación de cuentas nuevas. Como ahora el
    // botón Entrar crea la cuenta la primera vez, esto dejaría afuera a todas
    // las que aún no han entrado. Es un problema del sistema, no de ella.
    case "auth/admin-restricted-operation":
      return "Tu cuenta todavía no se puede abrir desde aquí. No es nada que hayas hecho mal: escríbele al administrador y muéstrale este mensaje — falta permitir cuentas nuevas en Firebase (Authentication → Settings → User actions).";

    default:
      if (contexto === "reset") return `No pudimos enviar el mensaje (${code || "error desconocido"}). Revisa tu internet y vuelve a intentar; si sigue igual, escríbele al administrador.`;
      if (contexto === "cambiar") return `No pudimos guardar tu contraseña (${code || "error desconocido"}). Vuelve a intentar en un minuto; si sigue igual, escríbele al administrador.`;
      return `No pudimos entrar en este momento (${code || "error desconocido"}). Vuelve a intentar en un minuto; si sigue igual, escríbele al administrador y muéstrale este mensaje.`;
  }
}
