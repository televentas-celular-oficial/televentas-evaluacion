// Login con Firebase Magic Link (email link)
// La vendedora escribe su email, le llega un link, tap y entra.
// El link se valida contra una whitelist de emails autorizados (config-comun/whitelist).

import { useEffect, useState } from "react";
import {
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
} from "firebase/auth";
import { auth } from "../../firebase.js";

const STORAGE_KEY = "valquirias_pending_email";

const actionCodeSettings = {
  // La app abre este link al hacer tap en el correo
  url: typeof window !== "undefined" ? window.location.origin : "https://televentas-evaluacion.netlify.app",
  handleCodeInApp: true,
};

export default function LoginMagicLink({ onLoggedIn }) {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState(null);
  const [msgTipo, setMsgTipo] = useState("ok");

  // Al montar, si el URL trae un magic link, completar login
  useEffect(() => {
    if (isSignInWithEmailLink(auth, window.location.href)) {
      let email = window.localStorage.getItem(STORAGE_KEY);
      if (!email) {
        email = window.prompt("Confirma tu email para completar el login:");
      }
      if (email) {
        signInWithEmailLink(auth, email, window.location.href)
          .then((cred) => {
            window.localStorage.removeItem(STORAGE_KEY);
            // Limpiar la URL (quita el token)
            window.history.replaceState({}, document.title, window.location.pathname);
            onLoggedIn?.(cred.user);
          })
          .catch((err) => {
            setMsg("El link expiró o no es válido. Pide uno nuevo.");
            setMsgTipo("err");
            console.error(err);
          });
      }
    }
  }, [onLoggedIn]);

  async function enviar() {
    if (!email || !email.includes("@")) {
      setMsg("Ingresa un email válido");
      setMsgTipo("err");
      return;
    }
    setEnviando(true);
    setMsg(null);
    try {
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      window.localStorage.setItem(STORAGE_KEY, email);
      setMsg("¡Listo! Revisa tu correo y toca el link que te enviamos.");
      setMsgTipo("ok");
    } catch (err) {
      setMsg("No pudimos enviar el link. Escríbele a Luis.");
      setMsgTipo("err");
      console.error(err);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="v-app">
      <div className="v-login-wrap">
        <div className="v-login-card">
          <div className="v-login-hero">⚡ Valquirias TLV</div>
          <div className="v-login-sub">Ingresa con tu email · te enviamos un link mágico</div>
          <input
            type="email"
            className="v-login-input"
            placeholder="tu.email@televentas.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && enviar()}
            autoComplete="email"
          />
          <button
            className="v-login-btn"
            onClick={enviar}
            disabled={enviando}
          >
            {enviando ? "Enviando..." : "Enviar link mágico"}
          </button>
          {msg && (
            <div className={"v-login-msg " + msgTipo}>{msg}</div>
          )}
          <div style={{ marginTop: 20, fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>
            💬 ¿No tienes email de acceso? Escríbele a Luis.
          </div>
        </div>
      </div>
    </div>
  );
}
