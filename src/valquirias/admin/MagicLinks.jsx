// Admin > Magic Links
// Gestiona whitelist de emails y envío de links de acceso a las vendedoras.
//
// Estado en Firestore config:
// - whitelistActiva: bool (por default false) — si false, nadie puede entrar aunque tenga el link
// - whitelist: { "email": { vendedoraId, nombre, ciudad, rolTienda } }
//
// Flujo típico:
// 1. Luis pega los emails en la app o los cargo yo directo en Firestore
// 2. Verifica todo (whitelistActiva=false → nadie entra)
// 3. Toca "Activar acceso general" → whitelistActiva=true
// 4. Toca "Enviar todos los links" → llega correo a cada una

import { useState, useMemo } from "react";
import { sendSignInLinkToEmail } from "firebase/auth";
import { auth } from "../../firebase.js";
import { useDatos } from "../data/DatosContext.jsx";
import { primerNombre } from "../lib/helpers.js";

const actionCodeSettings = {
  url: typeof window !== "undefined" ? window.location.origin + "?v=tlv" : "https://televentas-evaluacion.netlify.app/?v=tlv",
  handleCodeInApp: true,
};

export default function MagicLinks({ onVolver }) {
  const datos = useDatos();
  const config = datos.config || {};
  const whitelist = config.whitelist || {};
  const activa = !!config.whitelistActiva;

  const [msg, setMsg] = useState(null);
  const [enviando, setEnviando] = useState({});
  const [confirmarActivar, setConfirmarActivar] = useState(false);

  function flash(txt, tipo = "ok") {
    setMsg({ txt, tipo });
    setTimeout(() => setMsg(null), 3500);
  }

  // Cruzar vendedoras con whitelist
  const filas = useMemo(() => {
    const activas = (datos.vendedoras || []).filter(v => v.activa !== false);
    return activas.map(v => {
      const emailEnWL = Object.entries(whitelist).find(([, w]) => w.vendedoraId === v.id);
      return {
        v,
        email: emailEnWL?.[0] || v.email || null,
        enWhitelist: !!emailEnWL,
      };
    });
  }, [datos.vendedoras, whitelist]);

  const conEmail = filas.filter(f => f.email);
  const sinEmail = filas.filter(f => !f.email);

  async function enviarUno(email, nombre) {
    setEnviando(s => ({ ...s, [email]: true }));
    try {
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      flash(`✅ Link enviado a ${primerNombre(nombre)}`);
    } catch (e) {
      console.error(e);
      flash(`❌ Error enviando a ${email}: ${e.code}`, "err");
    } finally {
      setEnviando(s => ({ ...s, [email]: false }));
    }
  }

  async function enviarATodas() {
    if (!activa) {
      flash("⚠️ Activa primero el acceso general antes de enviar", "err");
      return;
    }
    for (const f of conEmail) {
      try {
        await sendSignInLinkToEmail(auth, f.email, actionCodeSettings);
      } catch (e) {
        console.error("Error enviando", f.email, e);
      }
    }
    flash(`✅ ${conEmail.length} links enviados`);
  }

  async function toggleActivar() {
    if (!activa) {
      setConfirmarActivar(true);
      return;
    }
    const nuevo = { ...config, whitelistActiva: false };
    await datos.saveConfig(nuevo);
    flash("🔒 Acceso general DESACTIVADO");
  }

  async function confirmarActivarSi() {
    const nuevo = { ...config, whitelistActiva: true };
    await datos.saveConfig(nuevo);
    setConfirmarActivar(false);
    flash("🚀 Acceso general ACTIVADO — las vendedoras ya pueden entrar");
  }

  return (
    <div className="v-app">
      <div className="v-header-detalle">
        <button className="v-back-btn" onClick={onVolver}>‹ Volver</button>
        <div className="v-header-title">📧 Magic Links</div>
        <div style={{ width: 60 }} />
      </div>

      {msg && (
        <div style={{
          padding: "10px 14px",
          borderRadius: 10,
          marginBottom: 10,
          fontSize: 12,
          fontWeight: 800,
          background: msg.tipo === "err" ? "#fee2e2" : "#d1fae5",
          color: msg.tipo === "err" ? "#991b1b" : "#065f46",
        }}>{msg.txt}</div>
      )}

      {/* Toggle global grande */}
      <div style={{
        background: activa
          ? "linear-gradient(135deg, #10b981, #059669)"
          : "linear-gradient(135deg, #64748b, #475569)",
        color: "#fff",
        padding: "18px 20px",
        borderRadius: 18,
        marginBottom: 12,
        boxShadow: activa
          ? "0 8px 24px rgba(16, 185, 129, 0.35)"
          : "0 4px 12px rgba(100, 116, 139, 0.25)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1.5, opacity: 0.9, marginBottom: 3 }}>
              {activa ? "🚀 Acceso general" : "🔒 Acceso general"}
            </div>
            <div style={{ fontSize: 17, fontWeight: 900 }}>
              {activa ? "ACTIVADO" : "DESACTIVADO"}
            </div>
            <div style={{ fontSize: 11, opacity: 0.9, fontWeight: 700, marginTop: 3 }}>
              {activa
                ? "Vendedoras con email pueden entrar"
                : "Nadie puede entrar aunque tenga el link"}
            </div>
          </div>
          <button
            onClick={toggleActivar}
            style={{
              width: 60,
              height: 32,
              borderRadius: 16,
              border: "none",
              cursor: "pointer",
              background: activa ? "#fff" : "rgba(255,255,255,0.3)",
              position: "relative",
              padding: 0,
              flexShrink: 0,
            }}
          >
            <div style={{
              position: "absolute",
              top: 3,
              left: activa ? 31 : 3,
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: activa ? "#10b981" : "#fff",
              boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
              transition: "left 0.2s",
            }} />
          </button>
        </div>
      </div>

      {/* Info importante */}
      <div style={{ padding: "10px 12px", background: "rgba(168, 85, 247, 0.08)", borderLeft: "3px solid #a855f7", borderRadius: 10, fontSize: 11, color: "#5b21b6", fontWeight: 700, marginBottom: 10, lineHeight: 1.55 }}>
        💡 Los emails de las vendedoras vienen desde <strong>systemlap</strong> (sync automático).
        Cuando activas el acceso, cada vendedora recibe su link mágico. El link solo funciona
        para el email al que llegó — nadie más puede loguearse con él.
      </div>

      {/* Botón enviar a todas */}
      {conEmail.length > 0 && (
        <button
          onClick={enviarATodas}
          disabled={!activa}
          style={{
            width: "100%",
            padding: "14px",
            background: activa
              ? "linear-gradient(135deg, #7c3aed, #ec4899)"
              : "#e2e8f0",
            color: activa ? "#fff" : "#94a3b8",
            border: "none",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 900,
            cursor: activa ? "pointer" : "not-allowed",
            marginBottom: 12,
            boxShadow: activa ? "0 4px 12px rgba(124, 58, 237, 0.3)" : "none",
          }}
        >
          📧 Enviar Magic Link a las {conEmail.length}
          {!activa && <div style={{ fontSize: 10, fontWeight: 700, marginTop: 3 }}>Primero activa el acceso general</div>}
        </button>
      )}

      {/* Lista con email */}
      {conEmail.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 900, color: "#047857", padding: "6px 10px", background: "linear-gradient(90deg, #ecfdf5, transparent)", borderRadius: 6, marginBottom: 6 }}>
            ✅ CON EMAIL ({conEmail.length})
          </div>
          {conEmail.map(f => (
            <FilaWhitelist
              key={f.v.id}
              vendedora={f.v}
              email={f.email}
              onEnviar={() => enviarUno(f.email, f.v.nombre)}
              enviando={!!enviando[f.email]}
              activa={activa}
            />
          ))}
        </>
      )}

      {/* Sin email */}
      {sinEmail.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 900, color: "#b45309", padding: "6px 10px", background: "linear-gradient(90deg, #fef3c7, transparent)", borderRadius: 6, marginBottom: 6, marginTop: 12 }}>
            ⚠️ SIN EMAIL — pendiente de systemlap ({sinEmail.length})
          </div>
          {sinEmail.map(f => (
            <FilaWhitelist
              key={f.v.id}
              vendedora={f.v}
              email={null}
              onEnviar={() => {}}
              enviando={false}
              activa={activa}
            />
          ))}
        </>
      )}

      {conEmail.length === 0 && sinEmail.length === 0 && (
        <div className="v-loading">Sin vendedoras cargadas todavía</div>
      )}

      {/* Modal confirmar activar */}
      {confirmarActivar && (
        <div style={modalBackdrop} onClick={() => setConfirmarActivar(false)}>
          <div style={modalCard} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>🚀</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: "#1e1b4b", marginBottom: 6 }}>
              ¿Activar acceso general?
            </div>
            <div style={{ fontSize: 13, color: "#475569", marginBottom: 14, lineHeight: 1.5 }}>
              A partir de ahora las <strong>{conEmail.length} vendedoras con email</strong> podrán
              entrar a la app con su Magic Link. Podrás desactivarlo en cualquier momento.
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => setConfirmarActivar(false)}
                style={{ flex: 1, padding: "10px", background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 8, fontWeight: 800, cursor: "pointer" }}
              >Cancelar</button>
              <button
                onClick={confirmarActivarSi}
                style={{ flex: 1, padding: "10px", background: "linear-gradient(135deg, #10b981, #059669)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 800, cursor: "pointer" }}
              >Sí, activar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilaWhitelist({ vendedora, email, onEnviar, enviando, activa }) {
  const esBog = vendedora.ciudad === "BOG";
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      padding: "10px 12px",
      background: "#fff",
      borderRadius: 12,
      marginBottom: 4,
      boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      borderLeft: `3px solid ${esBog ? "#f59e0b" : "#10b981"}`,
      gap: 10,
    }}>
      <div style={{
        width: 32, height: 32,
        borderRadius: "50%",
        background: esBog ? "#f59e0b" : "#10b981",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fff", fontWeight: 900, fontSize: 14,
        flexShrink: 0,
      }}>{vendedora.nombre[0]}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: "#1e1b4b" }}>{vendedora.nombre}</div>
        <div style={{ fontSize: 10, color: email ? "#64748b" : "#b45309", fontWeight: 700, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {email || "⚠️ Sin email en systemlap"}
        </div>
      </div>

      {email && (
        <button
          onClick={onEnviar}
          disabled={enviando || !activa}
          title={!activa ? "Activa primero el acceso general" : "Enviar Magic Link"}
          style={{
            padding: "6px 10px",
            fontSize: 11,
            fontWeight: 800,
            background: activa
              ? (enviando ? "#cbd5e1" : "linear-gradient(135deg, #a855f7, #7c3aed)")
              : "#f1f5f9",
            color: activa ? "#fff" : "#94a3b8",
            border: "none",
            borderRadius: 8,
            cursor: (enviando || !activa) ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {enviando ? "⏳" : "📧 Enviar"}
        </button>
      )}
    </div>
  );
}

const modalBackdrop = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: 20, zIndex: 300,
};
const modalCard = {
  background: "#fff", borderRadius: 16, padding: 20,
  maxWidth: 340, width: "100%",
  boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
};
