// MI CONTRASEÑA — ponerse o cambiarse la clave DESDE ADENTRO, sin correo.
// ============================================================================
// Esta pantalla es la que salva a quien YA tiene cuenta sin contraseña: quien
// entró alguna vez con link mágico existe en Firebase Auth sin clave, así que
// `createUserWithEmailAndPassword` le responde email-already-in-use y
// `signInWithEmailAndPassword` le responde invalid-credential. Está atrapada.
//
// Con la sesión abierta, `updatePassword` le pone la contraseña SIN mandar
// ningún correo. Es el camino garantizado del dueño y del operador, que están
// dentro de la app ahora mismo.
//
// Único tropiezo posible: Firebase exige "login reciente" para cambiar la
// contraseña. Si la sesión es vieja, devuelve auth/requires-recent-login y aquí
// se le ofrece el correo de recuperación (cuota del plan gratuito: 150/día,
// contra 5/día del link mágico).
// ============================================================================

import { useState } from "react";
import { updatePassword, sendPasswordResetEmail, signOut } from "firebase/auth";
import { auth } from "../../firebase.js";
import CampoClave from "./CampoClave.jsx";
import { CLAVE_MINIMA, normalizaEmail, mensajeDeError } from "./acceso.js";

const linkTxt = {
  background: "none", border: "none", font: "inherit", fontSize: 12.5,
  fontWeight: 700, color: "#7c3aed", cursor: "pointer",
  textDecoration: "underline", padding: 0,
};

export default function MiClave({ user, onCerrar }) {
  const [clave, setClave] = useState("");
  const [ver, setVer] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [msg, setMsg] = useState(null);
  const [tipo, setTipo] = useState("ok");
  const [ofrecerCorreo, setOfrecerCorreo] = useState(false);
  const [listo, setListo] = useState(false);

  const correo = normalizaEmail(user?.email);

  async function guardar() {
    if (clave.length < CLAVE_MINIMA) {
      setTipo("err");
      setMsg(`Tu contraseña necesita mínimo ${CLAVE_MINIMA} caracteres.`);
      return;
    }
    setCargando(true);
    setMsg(null);
    setOfrecerCorreo(false);
    try {
      await updatePassword(auth.currentUser, clave);
      setTipo("ok");
      setListo(true);
      setMsg("✅ Listo. De aquí en adelante entras con tu correo y esta contraseña. Tu sesión sigue abierta, no tienes que volver a entrar ahora.");
      setClave("");
      setVer(false);
    } catch (err) {
      const code = err?.code || "";
      console.error("updatePassword error:", code, err);
      setTipo("err");
      if (code === "auth/requires-recent-login") {
        setMsg("Por seguridad, para cambiar la contraseña hay que haber entrado hace poco. Te mandamos un correo y la cambias desde ahí.");
        setOfrecerCorreo(true);
      } else {
        setMsg(mensajeDeError(code, "cambiar"));
      }
    } finally {
      setCargando(false);
    }
  }

  async function mandarCorreo() {
    if (!correo) {
      setTipo("err");
      setMsg("No pudimos leer tu correo de la sesión. Cierra sesión y vuelve a entrar.");
      return;
    }
    setCargando(true);
    try {
      await sendPasswordResetEmail(auth, correo);
      setTipo("ok");
      setOfrecerCorreo(false);
      setMsg(`📧 Te mandamos un correo a ${correo}. Ábrelo, escribe tu contraseña nueva y queda lista.`);
    } catch (err) {
      const code = err?.code || "";
      console.error("sendPasswordResetEmail error:", code, err);
      setTipo("err");
      setMsg(mensajeDeError(code, "reset"));
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="v-app">
      <div className="v-login-wrap">
        <div className="v-login-card">
          <div className="v-login-hero">🔑 Mi contraseña</div>
          <div className="v-login-sub">{correo || "—"}</div>

          <div style={{
            fontSize: 12.5, color: "#475569", fontWeight: 600, lineHeight: 1.6,
            textAlign: "left", background: "#f8fafc", borderRadius: 10,
            padding: "11px 13px", marginBottom: 16,
          }}>
            Escribe aquí la contraseña con la que quieres entrar de ahora en adelante.
            <strong> No se manda ningún correo</strong>: se guarda de una vez.
          </div>

          <form onSubmit={(e) => { e.preventDefault(); guardar(); }}>
            <CampoClave
              valor={clave}
              onCambia={setClave}
              visible={ver}
              onVisible={setVer}
              autoComplete="new-password"
              placeholder={`Contraseña nueva (mín. ${CLAVE_MINIMA})`}
              name="new-password"
              autoFocus
            />
            <button className="v-login-btn" type="submit" disabled={cargando}>
              {cargando ? "Guardando..." : "Guardar mi contraseña"}
            </button>
          </form>

          {msg && (
            <div className={"v-login-msg " + tipo}>
              {msg}
              {ofrecerCorreo && (
                <button
                  onClick={mandarCorreo}
                  disabled={cargando}
                  style={{ ...linkTxt, display: "block", marginTop: 10, color: "inherit" }}
                >
                  📧 Mándame el correo para cambiarla
                </button>
              )}
            </div>
          )}

          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
            <button style={linkTxt} onClick={onCerrar}>
              {listo ? "← Volver a la app" : "← Volver sin cambiar nada"}
            </button>
            <button
              style={{ ...linkTxt, color: "#94a3b8", fontSize: 11.5 }}
              onClick={() => signOut(auth)}
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
