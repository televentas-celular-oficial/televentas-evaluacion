// INGRESO CON CORREO Y CONTRASEÑA — la única puerta que ella ve.
// ============================================================================
// UN SOLO BOTÓN. Ella escribe su correo y la contraseña que quiera, toca
// "Entrar", y entra. Por dentro pasan dos cosas, pero ella nunca se entera:
//
//   1) signInWithEmailAndPassword  → si ya tenía cuenta, entra y listo.
//   2) si eso falla por credencial inválida, createUserWithEmailAndPassword
//      con ESA MISMA contraseña → si el correo no tenía cuenta, se le crea
//      ahora mismo con la clave que ella acaba de elegir.
//
// Consecuencia buscada: NUNCA existe una contraseña temporal que el dueño
// conozca. La primera clave de cada quien la elige ella, en su teléfono.
//
// POR QUÉ ESE ORDEN Y NO OTRO — protección de enumeración de correos
// ---------------------------------------------------------------------------
// Este proyecto tiene ENCENDIDA la "email enumeration protection" de Firebase.
// Con ella, signInWithEmailAndPassword responde auth/invalid-credential tanto
// si la cuenta no existe como si la contraseña está mal: es imposible saber
// cuál de los dos es. Pero la documentación de Identity Platform dice, textual,
// que el alta SÍ conserva su error específico:
//
//     "Invalid sign-up cases continue to return EMAIL_EXISTS errors"
//     cloud.google.com/identity-platform/docs/admin/email-enumeration-protection
//
// Por eso el que desempata es el FALLO DEL CREATE, no el del sign-in:
//   · create → auth/email-already-in-use  ⇒ la cuenta SÍ existía
//                                           ⇒ la contraseña estaba mal
//                                           (o nunca puso una: entró por link)
//   · create → auth/weak-password         ⇒ le quedó de menos de 6
//   · create → ok                         ⇒ era nueva, y ya está adentro
//
// Intentar el sign-in PRIMERO es obligatorio: al revés, cada ingreso normal
// arrancaría creando una cuenta que ya existe.
//
// ORDEN OBLIGADO — autenticar → verificar roster → signOut (o borrar) si no está.
// Las reglas de Firestore exigen sesión para leer el doc `vendedoras`, así que
// no hay forma de consultar el roster ANTES. Ver acceso.js.
//
// Dos pantallas, un solo archivo:
//   "entrar" → correo + contraseña          (esta es la que ve todo el mundo)
//   "olvide" → correo de recuperación       (esto SÍ manda correo)
//
// El link mágico ya NO se ofrece aquí. Sigue vivo y alcanzable, pero solo por
// un camino que hay que conocer: abrir la app con ?acceso=link (ver Login.jsx).
// En iPhone el link abre en Safari y no en la app instalada, así que ofrecerlo
// en pantalla solo dejaba gente atascada.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  deleteUser,
  signOut,
} from "firebase/auth";
import { auth } from "../../firebase.js";
import CampoClave from "./CampoClave.jsx";
import {
  LAST_EMAIL_KEY, MOTIVO_KEY, CLAVE_MINIMA,
  lee, guarda, borra,
  normalizaEmail, pareceEmail,
  asegurarPersistencia, verificarAcceso, mensajeDeError,
} from "./acceso.js";

// Códigos con los que el sign-in NO prueba nada: con la protección de
// enumeración encendida, cualquiera de estos puede significar "no tienes
// cuenta". Solo ante uno de ellos se intenta crear la cuenta.
const PUEDE_SER_CUENTA_NUEVA = new Set([
  "auth/invalid-credential",
  "auth/invalid-login-credentials",
  "auth/user-not-found",
]);

const linkTxt = {
  background: "none", border: "none", font: "inherit", fontSize: 12.5,
  fontWeight: 700, color: "#7c3aed", cursor: "pointer",
  textDecoration: "underline", padding: 0,
};

const cajaNota = {
  fontSize: 12.5, color: "#475569", fontWeight: 600, lineHeight: 1.6,
  textAlign: "left", background: "#f8fafc", borderRadius: 10,
  padding: "11px 13px", marginBottom: 16,
};

export default function IngresoClave({ onLoggedIn }) {
  const [vista, setVista] = useState("entrar");        // entrar | olvide

  const [email, setEmail] = useState(() => lee("localStorage", LAST_EMAIL_KEY) || "");
  const [clave, setClave] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [cargando, setCargando] = useState(false);

  // Motivo persistido de un rechazo anterior (roster / acceso apagado), si lo hubo.
  const [msg, setMsg] = useState(() => lee("sessionStorage", MOTIVO_KEY) || null);
  const [msgTipo, setMsgTipo] = useState(() => (lee("sessionStorage", MOTIVO_KEY) ? "err" : "ok"));
  // Botón extra que acompaña a un mensaje (ej: "mándame el correo para ponerla")
  const [accion, setAccion] = useState(null);

  // onLoggedIn cambia de identidad en cada render del padre; guardarlo en ref
  // evita re-suscripciones inútiles.
  const cbRef = useRef(onLoggedIn);
  useEffect(() => { cbRef.current = onLoggedIn; }, [onLoggedIn]);

  function limpiar() {
    setMsg(null);
    setAccion(null);
    borra("sessionStorage", MOTIVO_KEY);
  }
  function error(txt, extra = null) {
    setMsg(txt); setMsgTipo("err"); setAccion(extra);
  }
  function aviso(txt) {
    setMsg(txt); setMsgTipo("ok"); setAccion(null);
  }
  // Rechazo que debe sobrevivir al desmonte del componente (ver MOTIVO_KEY).
  function rechazar(txt) {
    guarda("sessionStorage", MOTIVO_KEY, txt);
    setMsg(txt); setMsgTipo("err"); setAccion(null);
    setVista("entrar");
  }

  function cambiarVista(v) {
    limpiar();
    setClave("");
    setVerClave(false);
    setVista(v);
  }

  // ── ENTRAR (y crear la cuenta si hace falta) ──────────────────────────────
  // Un solo intento desde el punto de vista de ella.
  async function entrar() {
    const correo = normalizaEmail(email);
    if (!pareceEmail(correo)) return error("Escribe tu correo completo, por ejemplo: nombre@correo.com");
    if (!clave) return error("Te faltó escribir la contraseña.");

    setEmail(correo);
    setCargando(true);
    limpiar();

    let cred = null;
    let cuentaReciénCreada = false;

    // ── Paso 1: intentar entrar con lo que escribió ─────────────────────────
    try {
      await asegurarPersistencia();
      cred = await signInWithEmailAndPassword(auth, correo, clave);
    } catch (err) {
      const code = err?.code || "";
      console.error("signInWithEmailAndPassword error:", code, err);

      // Errores que hablan por sí solos (sin internet, acceso desactivado,
      // demasiados intentos, proveedor apagado...). No se intenta crear nada.
      if (!PUEDE_SER_CUENTA_NUEVA.has(code)) {
        error(mensajeDeError(code, "entrar"));
        setCargando(false);
        return;
      }

      // ── Paso 2: quizá no tiene cuenta. Se le crea con ESTA contraseña. ────
      try {
        cred = await createUserWithEmailAndPassword(auth, correo, clave);
        cuentaReciénCreada = true;
      } catch (err2) {
        const code2 = err2?.code || "";
        console.error("createUserWithEmailAndPassword error:", code2, err2);

        // El create falló porque el correo YA tiene cuenta ⇒ el problema del
        // paso 1 era la contraseña. Dos casos caben aquí y el texto cubre los
        // dos: se le olvidó, o nunca puso una porque entró por link mágico
        // (existe en Firebase Auth sin clave). Como la cuenta existe de
        // verdad, el correo de recuperación SÍ le va a llegar.
        if (code2 === "auth/email-already-in-use") {
          error(
            "Esa contraseña no es la de tu cuenta. Revisa que no te haya quedado un espacio al final y toca el ojito 👁️ para verla mientras la escribes. Si nunca alcanzaste a ponerle contraseña a este correo, pide el mensaje aquí abajo y la pones en un minuto.",
            {
              label: "📧 Mándame un correo para poner mi contraseña",
              onClick: () => enviarReset(correo, { cuentaConfirmada: true }),
            }
          );
          setCargando(false);
          return;
        }

        // Ninguna cuenta que ya exista puede tener una clave de menos de 6:
        // Firebase no lo permite. Así que esto es siempre alguien nuevo cuya
        // contraseña quedó corta. Se dice sin dramatizar y sin culpar.
        if (code2 === "auth/weak-password" || code2 === "auth/password-does-not-meet-requirements") {
          error(`Esa contraseña quedó corta: necesita mínimo ${CLAVE_MINIMA} letras o números. Escribe una un poco más larga y toca Entrar otra vez.`);
          setCargando(false);
          return;
        }

        error(mensajeDeError(code2, "entrar"));
        setCargando(false);
        return;
      }
    }

    // ── Paso 3: ya hay sesión. Recién ahora se puede leer el roster. ─────────
    try {
      const emailBajo = normalizaEmail(cred.user.email);
      guarda("localStorage", LAST_EMAIL_KEY, emailBajo);

      const r = await verificarAcceso(emailBajo, { via: "clave" });
      if (!r.ok) {
        if (cuentaReciénCreada && r.causa === "fuera-del-roster") {
          // NADIE QUE NO ESTÉ EN EL ROSTER SE QUEDA CON CUENTA. Se borra la que
          // se acaba de crear (el login es recientísimo, deleteUser no pide
          // reautenticar). Si el borrado falla, al menos se cierra la sesión.
          try { await deleteUser(cred.user); }
          catch (e) {
            console.error("No se pudo borrar la cuenta fuera de roster:", e);
            try { await signOut(auth); } catch { /* ya sin sesión */ }
          }
        } else {
          // Tres casos que NO borran cuenta:
          //   · la cuenta ya existía de antes (no la creamos nosotros ahora),
          //   · "app-cerrada" → la app todavía no está encendida,
          //   · "error" → se cayó el internet en mitad de la verificación.
          // Borrarle la cuenta a una vendedora de verdad por cualquiera de
          // estas sería el peor final posible.
          try { await signOut(auth); } catch { /* ya sin sesión */ }
        }
        rechazar(r.motivo);
        return;
      }

      borra("sessionStorage", MOTIVO_KEY);
      cbRef.current?.(cred.user);
    } finally {
      setCargando(false);
    }
  }

  // ── Olvidé mi contraseña ──────────────────────────────────────────────────
  // Esto SÍ manda un correo. Cuota del plan gratuito: 150 correos de
  // recuperación por día (contra 5 del link mágico), así que aguanta de sobra
  // a las 13.
  //
  // HONESTIDAD OBLIGADA: con la protección de enumeración encendida,
  // sendPasswordResetEmail sobre un correo SIN cuenta responde "todo bien" y
  // no manda nada — la documentación lo dice: "a verification email is sent
  // only if the email address exists ... there are no specific error messages
  // indicating when emails aren't sent". Por eso el texto no promete un correo
  // que quizá no llegue... salvo cuando venimos del email-already-in-use, que
  // es la única vez en que sabemos con certeza que la cuenta existe
  // (`cuentaConfirmada`).
  async function enviarReset(correoCrudo, { cuentaConfirmada = false } = {}) {
    const correo = normalizaEmail(correoCrudo ?? email);
    if (!pareceEmail(correo)) return error("Escribe tu correo completo para poder mandarte el mensaje.");

    setCargando(true);
    limpiar();
    try {
      await sendPasswordResetEmail(auth, correo);
      aviso(
        cuentaConfirmada
          ? `📧 Te mandamos un correo a ${correo}. Ábrelo y escribe la contraseña que quieras. Si no aparece en 5 minutos, mira la carpeta de spam. Cuando la tengas lista, vuelve aquí y entra con ella.`
          : `📧 Mensaje enviado a ${correo}. Te llega solo si ese correo ya tiene cuenta en la app; ábrelo y escribe la contraseña que quieras. Si no aparece en 5 minutos, mira la carpeta de spam y revisa que sea el mismo correo del trabajo. Si aun así no llega, escríbele al administrador con el correo que estás usando.`
      );
    } catch (err) {
      const code = err?.code || "";
      console.error("sendPasswordResetEmail error:", code, err);
      error(mensajeDeError(code, "reset"));
    } finally {
      setCargando(false);
    }
  }

  const campoCorreo = (
    <input
      type="email"
      className="v-login-input"
      placeholder="tucorreo@ejemplo.com"
      value={email}
      name="username"
      onChange={(e) => setEmail(e.target.value)}
      autoComplete="username"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck="false"
      inputMode="email"
    />
  );

  const bloqueMsg = msg ? (
    <div className={"v-login-msg " + msgTipo}>
      {msg}
      {accion && (
        <button
          onClick={accion.onClick}
          disabled={cargando}
          style={{ ...linkTxt, display: "block", marginTop: 10, color: "inherit" }}
        >
          {accion.label}
        </button>
      )}
    </div>
  ) : null;

  // ── Olvidé mi contraseña ──────────────────────────────────────────────────
  if (vista === "olvide") {
    return (
      <div className="v-app">
        <div className="v-login-wrap">
          <div className="v-login-card">
            <div className="v-login-hero">⚡ Valkyrias</div>
            <div className="v-login-sub">Recuperar tu contraseña</div>
            <div style={cajaNota}>
              Escribe tu correo y te mandamos un mensaje para poner una contraseña
              nueva. <strong>Solo llega si ese correo ya tiene cuenta en la app</strong>,
              así que revisa que sea el mismo del trabajo.
            </div>
            <form onSubmit={(e) => { e.preventDefault(); enviarReset(); }}>
              {campoCorreo}
              <button className="v-login-btn" type="submit" disabled={cargando}>
                {cargando ? "Enviando..." : "Enviarme el mensaje"}
              </button>
            </form>
            {bloqueMsg}
            <div style={{ marginTop: 16 }}>
              <button style={linkTxt} onClick={() => cambiarVista("entrar")}>
                ← Volver a entrar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Entrar (pantalla principal) ───────────────────────────────────────────
  // Dos campos, un botón, y abajo — pequeño y gris — "Olvidé mi contraseña".
  // Nada más. Cada error que salga ya dice qué hacer.
  return (
    <div className="v-app">
      <div className="v-login-wrap">
        <div className="v-login-card">
          <div className="v-login-hero">⚡ Valkyrias</div>
          <div className="v-login-sub">Entra con tu correo y tu contraseña</div>

          <form onSubmit={(e) => { e.preventDefault(); entrar(); }}>
            {campoCorreo}
            <CampoClave
              valor={clave}
              onCambia={setClave}
              visible={verClave}
              onVisible={setVerClave}
              autoComplete="current-password"
              placeholder="Tu contraseña"
              name="password"
            />
            <button className="v-login-btn" type="submit" disabled={cargando}>
              {cargando ? "Entrando..." : "Entrar"}
            </button>
          </form>

          {bloqueMsg}

          {/* Sin esta línea, quien todavía no tiene contraseña se queda mirando
              el campo sin saber qué escribir, y termina pidiendo un correo de
              recuperación que nunca le va a llegar (no tiene cuenta). No es un
              camino aparte: es la instrucción del mismo botón Entrar. */}
          {!msg && (
            <div style={{ marginTop: 14, fontSize: 12, color: "#64748b", fontWeight: 600, lineHeight: 1.55 }}>
              ¿Todavía no tienes contraseña? Escribe la que quieras: esa te queda.
            </div>
          )}

          <div style={{ marginTop: 20 }}>
            <button
              style={{ ...linkTxt, color: "#94a3b8", fontSize: 11.5 }}
              onClick={() => cambiarVista("olvide")}
            >
              Olvidé mi contraseña
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
