// Login con Firebase Magic Link (email link)
// La vendedora escribe su email, le llega un link, tap y entra.
// El link se valida contra una whitelist de emails autorizados (config-comun/whitelist).

import { useEffect, useState } from "react";
import {
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../firebase.js";
import { EMAIL_ADMIN, EMAIL_OFICINA } from "../../lib/constantes.js";

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
          .then(async (cred) => {
            window.localStorage.removeItem(STORAGE_KEY);
            window.history.replaceState({}, document.title, window.location.pathname);

            // Validar contra whitelist (a menos que sea admin u oficina — esos siempre entran)
            const emailBajo = (cred.user.email || "").toLowerCase();
            const esAdmin = emailBajo === EMAIL_ADMIN.toLowerCase();
            const esOficina = emailBajo === EMAIL_OFICINA.toLowerCase();

            if (esAdmin || esOficina) {
              onLoggedIn?.(cred.user);
              return;
            }

            try {
              const cfgSnap = await getDoc(doc(db, "televentas", "config"));
              const cfg = cfgSnap.exists() ? JSON.parse(cfgSnap.data().data || "{}") : {};
              const activa = !!cfg.whitelistActiva;
              const enWL = cfg.whitelist && cfg.whitelist[emailBajo];

              if (!activa) {
                await signOut(auth);
                setMsg("🔒 El acceso a la app aún no está habilitado. Te avisamos cuando esté listo.");
                setMsgTipo("err");
                return;
              }
              if (!enWL) {
                await signOut(auth);
                setMsg("⚠️ Este email no está autorizado. Escríbele al administrador.");
                setMsgTipo("err");
                return;
              }
              onLoggedIn?.(cred.user);
            } catch (e) {
              console.error("Error validando whitelist:", e);
              await signOut(auth);
              setMsg("Error validando acceso. Escríbele al administrador.");
              setMsgTipo("err");
            }
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
      setMsg("No pudimos enviar el link. Escríbele al administrador.");
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
            placeholder="Ingresa tu email"
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
            💬 ¿No tienes email de acceso? Escríbele al administrador.
          </div>
        </div>
      </div>
    </div>
  );
}
