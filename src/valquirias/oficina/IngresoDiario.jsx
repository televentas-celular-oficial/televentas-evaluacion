// Panel Carolina (rol oficina) — Ingreso diario de indicadores
// Portado de PantallaIngreso vieja (App.jsx:1067-1250)
//
// Flujo:
// 1. Elige fecha (por defecto hoy)
// 2. Marca quién descansó — esas no llenan indicadores
// 3. Por cada vendedora que trabajó:
//    - Min tarde (0-150, con -/+)
//    - Reseñas (0-50, con -/+)
//    - Tienda: orden / uniforme / depósito (bien/mal cada uno)
//    - Planilla: bien/mal
//    - Actitud: bien/regular/mal → si regular/mal, obligatorio "qué pasó"
// 4. Guardar día

import { useState, useMemo } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase.js";
import { primerNombre, hoyColombia } from "../lib/helpers.js";
import { VENDEDORAS_DEFAULT } from "../../lib/constantes.js";

function diaVacio() {
  return {
    minutos: 0,
    resenas: 0,
    tienda_orden: "bien",
    tienda_uniforme: "bien",
    tienda_deposito: "bien",
    planilla: "bien",
    actitud: "bien",
    actitud_nota: "",
    descanso: false,
  };
}

export default function IngresoDiario({ vendedoras = VENDEDORAS_DEFAULT, onGuardar }) {
  const hoy = hoyColombia();
  const [fecha, setFecha] = useState(hoy.iso);
  const [filas, setFilas] = useState({});
  const [guardado, setGuardado] = useState(false);
  const [erroresFalt, setErroresFalt] = useState([]);

  function setFila(vid, campo, valor) {
    setFilas(f => ({ ...f, [vid]: { ...(f[vid] || diaVacio()), [campo]: valor } }));
    if (guardado) setGuardado(false);
  }

  const activas = useMemo(() => vendedoras.filter(v => v.activa), [vendedoras]);
  const trabajan = activas.filter(v => !filas[v.id]?.descanso);

  const activasMed = activas.filter(v => v.ciudad === "MED");
  const activasBog = activas.filter(v => v.ciudad === "BOG");

  function guardarDia() {
    // Validar actitud regular/mal con motivo
    const faltantes = trabajan.filter(v => {
      const f = filas[v.id];
      if (!f) return false;
      const necesita = f.actitud === "regular" || f.actitud === "mal";
      const tiene = (f.actitud_nota || "").trim().length > 0;
      return necesita && !tiene;
    }).map(v => v.id);

    if (faltantes.length > 0) {
      setErroresFalt(faltantes);
      // Scroll a la primera con error
      setTimeout(() => {
        const el = document.querySelector(`[data-actitud-vid="${faltantes[0]}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
      return;
    }

    setErroresFalt([]);
    onGuardar?.({ fecha, filas });
    setGuardado(true);
  }

  const progresoLlenado = trabajan.filter(v => filas[v.id]).length;

  return (
    <div className="v-app">
      <div className="v-header">
        <div className="v-brand">Indicadores TLV</div>
        <button
          onClick={() => signOut(auth)}
          style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", background: "transparent", border: "1px solid #e2e8f0", padding: "6px 10px", borderRadius: 8, cursor: "pointer" }}
        >Salir</button>
      </div>

      <div className="v-greeting">
        Hola <strong>Carolina</strong> <span className="v-role-mini oficina">Oficina</span>
        <div style={{ marginTop: 4, fontSize: 12, color: "#0891b2", fontWeight: 900 }}>📝 Ingreso diario de indicadores</div>
      </div>

      {/* Selector de fecha */}
      <div className="v-card" style={{ background: "linear-gradient(135deg, #ecfeff, #f0f9ff)", borderLeft: "4px solid #06b6d4", border: "1px solid rgba(6, 182, 212, 0.2)" }}>
        <label style={{ fontSize: 11, fontWeight: 900, color: "#0e7490", textTransform: "uppercase", letterSpacing: 1.2, display: "block", marginBottom: 6 }}>📆 Fecha del día a llenar</label>
        <input
          type="date"
          value={fecha}
          max={hoy.iso}
          onChange={e => { setFecha(e.target.value); setFilas({}); setGuardado(false); }}
          style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #06b6d4", borderRadius: 10, fontSize: 15, fontFamily: "inherit", fontWeight: 700, color: "#164e63", background: "#fff" }}
        />
        {guardado && (
          <div style={{ marginTop: 10, padding: "8px 12px", background: "#ecfdf5", color: "#047857", borderRadius: 8, fontSize: 13, fontWeight: 800, textAlign: "center" }}>
            ✅ Día {fecha} guardado
          </div>
        )}
      </div>

      {/* Progreso */}
      <div style={{ background: "linear-gradient(135deg, #f3e8ff, #fdf4ff)", borderLeft: "4px solid #a855f7", padding: "10px 12px", borderRadius: 12, marginBottom: 10, border: "1px solid rgba(168, 85, 247, 0.2)" }}>
        <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 900, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4 }}>Progreso del día</div>
        <div style={{ fontSize: 18, fontWeight: 900, color: "#4c1d95" }}>
          {progresoLlenado} <span style={{ fontSize: 13, color: "#64748b", fontWeight: 700 }}>de {trabajan.length} llenadas</span>
        </div>
        <div style={{ background: "rgba(168, 85, 247, 0.15)", height: 6, borderRadius: 3, marginTop: 6, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(progresoLlenado / Math.max(1, trabajan.length)) * 100}%`, background: "linear-gradient(90deg, #a855f7, #7c3aed)", borderRadius: 3, transition: "width 0.3s" }} />
        </div>
        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginTop: 6 }}>
          ✅ {trabajan.length} trabajan · 😴 {activas.length - trabajan.length} descansan
        </div>
      </div>

      {/* Bloque 1: ¿Quién descansó? */}
      <div className="v-card">
        <div className="v-card-title" style={{ color: "#ea580c" }}>1️⃣ ¿Quién descansó hoy?</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {activas.map(v => {
            const desc = filas[v.id]?.descanso;
            const esBog = v.ciudad === "BOG";
            return (
              <button
                key={v.id}
                onClick={() => setFila(v.id, "descanso", !desc)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 20,
                  border: "2px solid " + (desc ? "#fca5a5" : esBog ? "rgba(245, 158, 11, 0.4)" : "rgba(16, 185, 129, 0.4)"),
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 800,
                  background: desc ? "#fee2e2" : "#fff",
                  color: desc ? "#dc2626" : esBog ? "#b45309" : "#047857",
                  textDecoration: desc ? "line-through" : "none",
                }}
              >
                {desc && "😴 "}{primerNombre(v.nombre)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bloque 2: Novedades por vendedora */}
      <div style={{ fontSize: 12, fontWeight: 900, color: "#ea580c", textTransform: "uppercase", letterSpacing: 1.5, margin: "16px 4px 8px" }}>
        2️⃣ Novedades del día
        <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, marginTop: 2, textTransform: "none", letterSpacing: 0 }}>
          Todo empieza en "bien" · marca solo lo que NO fue perfecto
        </div>
      </div>

      {/* Sección MED */}
      {activasMed.filter(v => !filas[v.id]?.descanso).length > 0 && (
        <div style={{ fontSize: 11, fontWeight: 900, color: "#047857", padding: "6px 10px", background: "linear-gradient(90deg, #ecfdf5, transparent)", borderRadius: 6, marginBottom: 6 }}>
          🟢 Team Valquirias Medellín
        </div>
      )}
      {activasMed.filter(v => !filas[v.id]?.descanso).map(v => (
        <FilaVendedora
          key={v.id}
          v={v}
          f={filas[v.id] || diaVacio()}
          onCambio={(campo, valor) => setFila(v.id, campo, valor)}
          enError={erroresFalt.includes(v.id)}
        />
      ))}

      {/* Sección BOG */}
      {activasBog.filter(v => !filas[v.id]?.descanso).length > 0 && (
        <div style={{ fontSize: 11, fontWeight: 900, color: "#b45309", padding: "6px 10px", background: "linear-gradient(90deg, #fef3c7, transparent)", borderRadius: 6, marginBottom: 6, marginTop: 10 }}>
          🟡 Team Valquirias Bogotá
        </div>
      )}
      {activasBog.filter(v => !filas[v.id]?.descanso).map(v => (
        <FilaVendedora
          key={v.id}
          v={v}
          f={filas[v.id] || diaVacio()}
          onCambio={(campo, valor) => setFila(v.id, campo, valor)}
          enError={erroresFalt.includes(v.id)}
        />
      ))}

      {/* Error de faltantes */}
      {erroresFalt.length > 0 && (
        <div style={{ background: "#fee2e2", border: "2px solid #fca5a5", borderRadius: 10, padding: "10px 14px", marginTop: 8, fontSize: 12, fontWeight: 800, color: "#991b1b" }}>
          ⚠️ Faltan {erroresFalt.length} vendedora{erroresFalt.length !== 1 ? "s" : ""} con actitud Regular/Mal sin describir qué pasó.
        </div>
      )}

      {/* Botón guardar */}
      <button
        onClick={guardarDia}
        style={{
          width: "100%",
          background: "linear-gradient(135deg, #10b981, #059669)",
          color: "#fff",
          border: "none",
          padding: "14px",
          borderRadius: 14,
          fontSize: 15,
          fontWeight: 900,
          marginTop: 12,
          boxShadow: "0 4px 12px rgba(16, 185, 129, 0.35)",
          cursor: "pointer",
        }}
      >
        💾 Guardar día
      </button>
    </div>
  );
}

// Componente definido FUERA de IngresoDiario para evitar remount que pierde foco
// (Bug histórico #8 del actitud_nota — App.jsx:1192-1220)
function FilaVendedora({ v, f, onCambio, enError }) {
  const hayNov =
    f.minutos > 0 ||
    f.resenas > 0 ||
    f.tienda_orden === "mal" ||
    f.tienda_uniforme === "mal" ||
    f.tienda_deposito === "mal" ||
    f.planilla === "mal" ||
    f.actitud === "regular" ||
    f.actitud === "mal";

  const esBog = v.ciudad === "BOG";

  return (
    <div className="v-card" style={{ borderLeft: `4px solid ${hayNov ? "#ea580c" : (esBog ? "#f59e0b" : "#10b981")}`, marginBottom: 8 }}>
      <div style={{ fontWeight: 900, fontSize: 14, color: "#1e1b4b", marginBottom: 10 }}>
        {v.nombre}
      </div>

      {/* Minutos + Reseñas con contadores */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        <ContadorNumerico
          label="⏰ Min tarde"
          valor={f.minutos}
          onCambio={v => onCambio("minutos", v)}
          max={150}
        />
        <ContadorNumerico
          label="⭐ Reseñas"
          valor={f.resenas}
          onCambio={v => onCambio("resenas", v)}
          max={50}
        />
      </div>

      {/* TIENDA - 3 checkboxes */}
      <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", marginBottom: 5 }}>🏪 Tienda</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
        {[["tienda_orden", "Orden"], ["tienda_uniforme", "Uniforme"], ["tienda_deposito", "Depósito"]].map(([campo, etiq]) => {
          const ok = f[campo] === "bien" || f[campo] === undefined;
          return (
            <button
              key={campo}
              onClick={() => onCambio(campo, ok ? "mal" : "bien")}
              style={{
                padding: "8px 4px",
                borderRadius: 8,
                border: "2px solid " + (ok ? "#86efac" : "#fca5a5"),
                background: ok ? "#f0fdf4" : "#fee2e2",
                color: ok ? "#059669" : "#dc2626",
                fontSize: 11,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {ok ? "✅" : "❌"} {etiq}
            </button>
          );
        })}
      </div>

      {/* PLANILLA */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", marginBottom: 5 }}>📋 Planilla</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            {[["bien", "✅ Bien"], ["mal", "❌ Mal"]].map(([val, lab]) => {
              const sel = (f.planilla || "bien") === val;
              const ok = val === "bien";
              return (
                <button
                  key={val}
                  onClick={() => onCambio("planilla", val)}
                  style={{
                    padding: "8px 4px",
                    borderRadius: 8,
                    border: "2px solid " + (sel ? (ok ? "#86efac" : "#fca5a5") : "#e2e8f0"),
                    background: sel ? (ok ? "#f0fdf4" : "#fee2e2") : "#fff",
                    color: sel ? (ok ? "#059669" : "#dc2626") : "#94a3b8",
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >{lab}</button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ACTITUD */}
      <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", marginBottom: 5 }}>💪 Actitud</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
        {[
          ["bien", "✅ Bien", "#86efac", "#f0fdf4", "#059669"],
          ["regular", "⚠️ Regular", "#fcd34d", "#fffbeb", "#d97706"],
          ["mal", "❌ Mal", "#fca5a5", "#fee2e2", "#dc2626"],
        ].map(([val, lab, b, bg, c]) => {
          const sel = (f.actitud || "bien") === val;
          return (
            <button
              key={val}
              onClick={() => onCambio("actitud", val)}
              style={{
                padding: "8px 4px",
                borderRadius: 8,
                border: `2px solid ${sel ? b : "#e2e8f0"}`,
                background: sel ? bg : "#fff",
                color: sel ? c : "#94a3b8",
                fontSize: 11,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >{lab}</button>
          );
        })}
      </div>

      {/* Motivo actitud (defaultValue + onBlur para no perder foco) */}
      {(f.actitud === "regular" || f.actitud === "mal") && (
        <div data-actitud-vid={v.id} style={{ marginTop: 8 }}>
          <input
            type="text"
            key={`actitud-nota-${v.id}`}
            placeholder={enError ? "⚠️ Obligatorio: ¿qué pasó?" : "¿Qué pasó? (obligatorio)"}
            defaultValue={f.actitud_nota || ""}
            onBlur={e => onCambio("actitud_nota", e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 12,
              fontFamily: "inherit",
              border: enError ? "2px solid #dc2626" : "1.5px solid #fbbf24",
              background: enError ? "#fee2e2" : "#fffbeb",
              borderRadius: 10,
            }}
          />
          {enError && (
            <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4, fontWeight: 700 }}>
              ⚠️ Escribe qué pasó para poder guardar
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ContadorNumerico({ label, valor, onCambio, max = 100 }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", marginBottom: 5 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button
          disabled={valor <= 0}
          onClick={() => onCambio(Math.max(0, valor - 1))}
          style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid #e2e8f0", background: "#f1f5f9", fontSize: 18, fontWeight: 900, cursor: "pointer", flexShrink: 0, color: "#475569", opacity: valor <= 0 ? 0.4 : 1 }}
        >−</button>
        <div style={{ flex: 1, textAlign: "center", fontWeight: 800, fontSize: 16, padding: "6px 0", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
          {valor}
        </div>
        <button
          disabled={valor >= max}
          onClick={() => onCambio(Math.min(max, valor + 1))}
          style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid #e2e8f0", background: "#f1f5f9", fontSize: 18, fontWeight: 900, cursor: "pointer", flexShrink: 0, color: "#475569", opacity: valor >= max ? 0.4 : 1 }}
        >+</button>
      </div>
    </div>
  );
}
