// Admin > Ver como vendedora
// Lista de todas las vendedoras activas. Toca una → abre nueva pestaña con la app en modo simular.
// El modo simular usa datos REALES de esa vendedora específica.

import { useState, useMemo } from "react";
import { useDatos } from "../data/DatosContext.jsx";
import { primerNombre } from "../lib/helpers.js";

export default function VerComoVendedora({ onVolver }) {
  const datos = useDatos();
  const [buscar, setBuscar] = useState("");

  const activas = useMemo(() => {
    const lista = (datos.vendedoras || []).filter(v => v.activa !== false && !v.eventual);
    if (!buscar.trim()) return lista;
    const q = buscar.toLowerCase();
    return lista.filter(v => v.nombre.toLowerCase().includes(q));
  }, [datos.vendedoras, buscar]);

  const med = activas.filter(v => v.ciudad === "MED");
  const bog = activas.filter(v => v.ciudad === "BOG");

  function verComo(v) {
    // Abre la app en modo simular con el id de la vendedora
    // El main.jsx / ValquiriasApp lee ?simular=<id> y renderiza como esa vendedora
    const url = `/?simular=${v.id}`;
    window.open(url, "_blank");
  }

  return (
    <div className="v-app">
      <div className="v-header-detalle">
        <button className="v-back-btn" onClick={onVolver}>‹ Volver</button>
        <div className="v-header-title">👁️ Ver como vendedora</div>
        <div style={{ width: 60 }} />
      </div>

      <div style={{ padding: "10px 12px", background: "rgba(168, 85, 247, 0.08)", borderLeft: "3px solid #a855f7", borderRadius: 10, fontSize: 12, color: "#5b21b6", fontWeight: 700, marginBottom: 10, lineHeight: 1.55 }}>
        💡 Elige una vendedora para abrir su vista en una pestaña nueva (con sus datos reales — ventas, comisión, ranking, comportamiento).
      </div>

      <input
        type="text"
        value={buscar}
        onChange={e => setBuscar(e.target.value)}
        placeholder="🔍 Buscar por nombre..."
        style={{
          width: "100%", padding: "10px 12px", fontSize: 14,
          fontFamily: "inherit", border: "1.5px solid #e2e8f0",
          borderRadius: 10, marginBottom: 10, background: "#fff",
          boxSizing: "border-box",
        }}
      />

      {med.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#047857", padding: "8px 10px", background: "linear-gradient(90deg, #ecfdf5, transparent)", borderRadius: 6, marginBottom: 6 }}>
            🟢 Team Valquirias Medellín ({med.length})
          </div>
          {med.map(v => <FilaVer key={v.id} v={v} onClick={() => verComo(v)} />)}
        </>
      )}

      {bog.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#b45309", padding: "8px 10px", background: "linear-gradient(90deg, #fef3c7, transparent)", borderRadius: 6, marginBottom: 6, marginTop: 12 }}>
            🟡 Team Valquirias Bogotá ({bog.length})
          </div>
          {bog.map(v => <FilaVer key={v.id} v={v} onClick={() => verComo(v)} />)}
        </>
      )}

      {activas.length === 0 && (
        <div className="v-loading">Sin vendedoras cargadas</div>
      )}
    </div>
  );
}

function FilaVer({ v, onClick }) {
  const esBog = v.ciudad === "BOG";
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 10,
      width: "100%", padding: "12px 14px", background: "#fff",
      borderRadius: 12, marginBottom: 4,
      boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      borderLeft: `3px solid ${esBog ? "#f59e0b" : "#10b981"}`,
      cursor: "pointer", fontFamily: "inherit", textAlign: "left",
      border: "none",
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: "50%",
        background: esBog ? "#f59e0b" : "#10b981",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fff", fontWeight: 900, fontSize: 16, flexShrink: 0,
      }}>{v.nombre[0]}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: "#1e1b4b" }}>
          {v.nombre}
        </div>
        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginTop: 2 }}>
          {v.rolTienda === "admin" ? "Administradora" : "Asesora"}
        </div>
      </div>

      <div style={{ fontSize: 20, color: "#a855f7", fontWeight: 900 }}>›</div>
    </button>
  );
}
