// Login con Firebase Magic Link (email link)
// La vendedora escribe su email, le llega un link, tap y entra.
// El link se valida contra una whitelist de emails autorizados (doc vendedoras).
//
// Reglas que se respetan aquí:
// - Un link NO se gasta por culpa de un email mal escrito. Si el correo que ella
//   escribe no coincide, se le dice y REINTENTA con el mismo link.
// - "El link expiró" sólo se dice cuando el link expiró de verdad. Antes se decía
//   también cuando el email no coincidía — mentira que la hacía pedir otro link y
//   quemar cuota de correos.
// - Nada de window.prompt: pantalla propia de la app, con logo y explicación.
// - Un rechazo (whitelist) no puede perderse: se guarda en sessionStorage porque
//   el componente se DESMONTA entre el signIn y el signOut (ver MOTIVO_KEY).

import { useEffect, useRef, useState } from "react";
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
const LAST_EMAIL_KEY = "valquirias_last_email";

// Por qué se le negó el paso. Vive FUERA del componente a propósito:
// signInWithEmailLink dispara onAuthStateChanged con el usuario, el padre
// (ValquiriasApp) deja de renderizar este componente, y cuando el signOut del
// rechazo lo vuelve a montar, todo su useState se perdió. Ese era el "rechazo
// mudo": ella quedaba en el login limpio, sin saber qué pasó. sessionStorage
// sobrevive ese desmonte y se limpia sola al cerrar la pestaña.
const MOTIVO_KEY = "valquirias_motivo_acceso";

// Safari en modo privado tira excepción al tocar storage: nunca debe tumbar el login.
const lee = (store, k) => { try { return window[store].getItem(k); } catch { return null; } };
const guarda = (store, k, v) => { try { window[store].setItem(k, v); } catch { /* sin storage */ } };
const borra = (store, k) => { try { window[store].removeItem(k); } catch { /* sin storage */ } };

// Lo que ella escribe en el teléfono trae espacio al final (autocompletado) y
// mayúscula inicial (autocapitalize de iOS). Firebase compara el string exacto
// contra el email del link, así que "Ana@X.com " ≠ "ana@x.com" y el login falla
// con un link perfectamente bueno.
const normalizaEmail = (v) => (v || "").trim().toLowerCase();
const pareceEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

const actionCodeSettings = {
  // La app abre este link al hacer tap en el correo
  url: typeof window !== "undefined" ? window.location.origin : "https://televentas-evaluacion.netlify.app",
  handleCodeInApp: true,
};

export default function LoginMagicLink({ onLoggedIn }) {
  // Pre-rellenar con el último email logueado (si existe en localStorage)
  const [email, setEmail] = useState(() => lee("localStorage", LAST_EMAIL_KEY) || "");
  // Campo de la pantalla "confirma tu email" (la que reemplaza al window.prompt)
  const [emailLink, setEmailLink] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Motivo persistido de un rechazo anterior (whitelist), si lo hubo.
  const [msg, setMsg] = useState(() => lee("sessionStorage", MOTIVO_KEY) || null);
  const [msgTipo, setMsgTipo] = useState(() => (lee("sessionStorage", MOTIVO_KEY) ? "err" : "ok"));

  // "form"        → login normal (pedir link)
  // "confirmar"   → el URL trae un link válido pero no sabemos a qué email
  // "verificando" → validando contra Firebase / whitelist
  const [fase, setFase] = useState("form");

  // onLoggedIn puede cambiar de identidad en cada render del padre; guardarlo en
  // ref permite que el efecto de abajo corra UNA sola vez. Correrlo dos veces
  // significaría intentar canjear el mismo link dos veces.
  const cbRef = useRef(onLoggedIn);
  useEffect(() => { cbRef.current = onLoggedIn; }, [onLoggedIn]);

  const yaArranco = useRef(false);

  // Al montar, si el URL trae un magic link, completar login
  useEffect(() => {
    if (yaArranco.current) return;
    yaArranco.current = true;

    let hayLink = false;
    try { hayLink = isSignInWithEmailLink(auth, window.location.href); } catch { hayLink = false; }
    if (!hayLink) return;

    const guardado = lee("localStorage", STORAGE_KEY);
    if (guardado) {
      completarLogin(guardado);
    } else {
      // Safari: el correo abre en otro navegador/pestaña y el email no quedó
      // guardado. Antes salía un window.prompt gris del sistema, sin contexto.
      setFase("confirmar");
      setEmailLink(lee("localStorage", LAST_EMAIL_KEY) || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rechazo que debe sobrevivir al desmonte del componente.
  function rechazar(texto) {
    guarda("sessionStorage", MOTIVO_KEY, texto);
    setMsg(texto);
    setMsgTipo("err");
    setFase("form");
  }

  // Error que NO gasta el link: ella puede reintentar aquí mismo. Se le devuelve
  // escrito lo que intentó, para que CORRIJA la letra mala en vez de retriplicar
  // el correo completo en un teclado de teléfono.
  function errorReintentable(texto, prefill) {
    borra("sessionStorage", MOTIVO_KEY);
    if (prefill !== undefined) setEmailLink(prefill);
    setMsg(texto);
    setMsgTipo("err");
    setFase("confirmar");
  }

  // Error que sí obliga a pedir link nuevo.
  function errorLinkMuerto(texto) {
    borra("sessionStorage", MOTIVO_KEY);
    setMsg(texto);
    setMsgTipo("err");
    setFase("form");
  }

  async function completarLogin(emailCrudo) {
    const correo = normalizaEmail(emailCrudo);

    // Ni siquiera se intenta con algo que no es un email: gastar el viaje a
    // Firebase sólo sirve para devolver un error confuso.
    if (!pareceEmail(correo)) {
      errorReintentable(
        "Ese correo no se ve completo. Revísalo y vuelve a intentar — tu link sigue sirviendo, no necesitas pedir otro.",
        correo || String(emailCrudo || "")
      );
      return;
    }

    setFase("verificando");
    setMsg(null);

    let cred;
    try {
      cred = await signInWithEmailLink(auth, correo, window.location.href);
    } catch (err) {
      const code = err?.code || "";
      console.error("signInWithEmailLink error:", code, err);

      // ── El email no coincide (o está mal escrito) ────────────────────────
      // El link NO se gastó: Firebase falla antes de canjearlo. El URL sigue
      // intacto (sólo se limpia al entrar bien), así que puede reintentar las
      // veces que necesite sin quemar otro correo.
      if (code === "auth/invalid-email" || code === "auth/user-mismatch" || code === "auth/invalid-credential") {
        errorReintentable(
          `El correo ${correo} no es el mismo al que le enviamos este link. Revisa que esté igualito al que recibió el mensaje y vuelve a intentar — este link todavía sirve.`,
          correo
        );
        return;
      }

      // ── El link sí venció de verdad ───────────────────────────────────────
      if (code === "auth/expired-action-code") {
        errorLinkMuerto("Este link ya venció. Pide uno nuevo aquí abajo y te llega al correo.");
        return;
      }

      // ── El link ya se usó, o viene cortado ────────────────────────────────
      if (code === "auth/invalid-action-code") {
        errorLinkMuerto(
          "Este link ya se usó o llegó incompleto. Pide uno nuevo aquí abajo — a veces el correo lo parte en dos líneas."
        );
        return;
      }

      if (code === "auth/user-disabled") {
        rechazar("🔒 Tu acceso está desactivado. Escríbele al administrador.");
        return;
      }

      errorLinkMuerto(`No pudimos completar el ingreso (${code || "error desconocido"}). Escríbele al administrador.`);
      return;
    }

    // ── Link canjeado. Desde aquí ya hay sesión de Firebase abierta. ─────────
    try {
      borra("localStorage", STORAGE_KEY);
      borra("sessionStorage", MOTIVO_KEY);
      window.history.replaceState({}, document.title, window.location.pathname);

      const emailBajo = normalizaEmail(cred.user.email);
      const esAdmin = emailBajo === normalizaEmail(EMAIL_ADMIN);
      const esOficina = emailBajo === normalizaEmail(EMAIL_OFICINA);

      // Guardar email para pre-rellenar próxima vez que el usuario abra la app
      guarda("localStorage", LAST_EMAIL_KEY, emailBajo);

      if (esAdmin || esOficina) {
        cbRef.current?.(cred.user);
        return;
      }

      // Gate global de acceso (config.whitelistActiva)
      const cfgSnap = await getDoc(doc(db, "televentas", "config"));
      const cfg = cfgSnap.exists() ? JSON.parse(cfgSnap.data().data || "{}") : {};
      if (!cfg.whitelistActiva) {
        await signOut(auth);
        rechazar(
          "🔒 La app todavía no está abierta. Tu link funcionó bien y tu correo quedó registrado: te avisamos apenas la habilitemos. No necesitas pedir otro link."
        );
        return;
      }

      // Whitelist = doc vendedoras (email vive ahí, no duplicado)
      const vendSnap = await getDoc(doc(db, "televentas", "vendedoras"));
      const vends = vendSnap.exists() ? JSON.parse(vendSnap.data().data || "[]") : [];
      const enWL = vends.some(v =>
        v.activa !== false && !v.eventual && normalizaEmail(v.email) === emailBajo
      );
      if (!enWL) {
        await signOut(auth);
        rechazar(
          `⚠️ El correo ${emailBajo} no está en la lista de acceso. Tu link estaba bien — lo que falta es que el administrador registre este correo. Escríbele y dile con cuál correo estás entrando.`
        );
        return;
      }

      cbRef.current?.(cred.user);
    } catch (e) {
      console.error("Error validando whitelist:", e);
      try { await signOut(auth); } catch { /* ya sin sesión */ }
      rechazar("No pudimos verificar tu acceso en este momento. Vuelve a intentar en un minuto o escríbele al administrador.");
    }
  }

  async function enviar() {
    const correo = normalizaEmail(email);
    if (!pareceEmail(correo)) {
      setMsg("Escribe tu correo completo, por ejemplo: nombre@correo.com");
      setMsgTipo("err");
      return;
    }
    setEmail(correo);          // que vea exactamente lo que se va a enviar
    setEnviando(true);
    setMsg(null);
    borra("sessionStorage", MOTIVO_KEY);
    try {
      await sendSignInLinkToEmail(auth, correo, actionCodeSettings);
      guarda("localStorage", STORAGE_KEY, correo);
      setMsg("¡Listo! Revisa tu correo y toca el link que te enviamos.");
      setMsgTipo("ok");
    } catch (err) {
      const code = err?.code || "unknown";
      setMsg(`Error: ${code}. Escríbele al administrador.`);
      setMsgTipo("err");
      console.error("sendSignInLinkToEmail error:", err);
    } finally {
      setEnviando(false);
    }
  }

  const linkTxt = {
    background: "none", border: "none", font: "inherit", fontSize: 12.5,
    fontWeight: 700, color: "#7c3aed", cursor: "pointer", marginTop: 14,
    textDecoration: "underline", padding: 0,
  };

  // ── Validando ─────────────────────────────────────────────────────────────
  if (fase === "verificando") {
    return (
      <div className="v-app">
        <div className="v-login-wrap">
          <div className="v-login-card">
            <div className="v-login-hero">⚡ Valquirias TLV</div>
            <div className="v-login-sub">Entrando...</div>
            <div style={{ fontSize: 30, margin: "10px 0" }}>⏳</div>
          </div>
        </div>
      </div>
    );
  }

  // ── Confirmar email (reemplaza al window.prompt) ───────────────────────────
  if (fase === "confirmar") {
    return (
      <div className="v-app">
        <div className="v-login-wrap">
          <div className="v-login-card">
            <div className="v-login-hero">⚡ Valquirias TLV</div>
            <div className="v-login-sub">Confirma tu correo para entrar</div>
            <div style={{
              fontSize: 12.5, color: "#475569", fontWeight: 600, lineHeight: 1.6,
              textAlign: "left", background: "#f8fafc", borderRadius: 10,
              padding: "11px 13px", marginBottom: 16,
            }}>
              Tu link es correcto ✅ Como lo abriste en otro navegador, necesitamos que
              escribas el <strong>mismo correo</strong> al que te llegó el mensaje. Es sólo
              para confirmar que eres tú.
            </div>
            <input
              type="email"
              className="v-login-input"
              placeholder="tucorreo@ejemplo.com"
              value={emailLink}
              onChange={(e) => setEmailLink(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && completarLogin(emailLink)}
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              inputMode="email"
              autoFocus
            />
            <button className="v-login-btn" onClick={() => completarLogin(emailLink)}>
              Entrar
            </button>
            {msg && <div className={"v-login-msg " + msgTipo}>{msg}</div>}
            <div style={{ fontSize: 11.5, color: "#94a3b8", fontWeight: 700, marginTop: 14, lineHeight: 1.5 }}>
              Puedes intentar las veces que necesites: <strong>este link no se gasta</strong>.
            </div>
            <button style={linkTxt} onClick={() => { setMsg(null); setFase("form"); }}>
              Prefiero pedir un link nuevo
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Login normal ───────────────────────────────────────────────────────────
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
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
            inputMode="email"
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
