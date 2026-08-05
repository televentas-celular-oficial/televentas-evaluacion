// Detalle Trimestre — se abre al tocar el chip "💎 Trimestre" en Tab Hoy
// HERO nota trimestral + simulador + desglose por mes + premios + historial

import { useEffect } from "react";
import { formatoPesos } from "../lib/helpers.js";

export default function DetalleTrimestre({
  trimestre,       // { q: 'Q3', año: 2026, notaActual, meta: 4.5 }
  mesesTrim,       // [{ nombre, peso, nota, estado: 'completo'|'progreso'|'pendiente' }]
  simulador,       // { notaObjetivo, notaProyectada, premio }
  premios,         // [{ emoji, nombre, condicion }]
  historial,       // [{ q: 'Q1 2026', nota, premio, activo }]
  ganadoras,       // solo su ciudad — [{ nombre, razon, monto }]
  ciudad,
  onVolver,
}) {
  // Scroll al top al abrir — evita que el detalle se abra mostrando el final
  useEffect(() => { window.scrollTo(0, 0); }, []);

  const pct = Math.min(100, ((trimestre?.notaActual || 0) / (trimestre?.meta || 4.5)) * 100);
  const falta = Math.max(0, (trimestre?.meta || 4.5) - (trimestre?.notaActual || 0));

  return (
    <>
      <div className="v-header-detalle">
        <button className="v-back-btn" onClick={onVolver}>‹ Volver</button>
        <div className="v-header-title">💎 Trimestre {trimestre?.q} · {trimestre?.año}</div>
        <div style={{ width: 60 }} />
      </div>

      <div className="v-trim-hero">
        <div className="label">Tu nota trimestral</div>
        <div className="valor">{(trimestre?.notaActual || 0).toFixed(2)}</div>
        <div className="meta">Meta: {(trimestre?.meta || 4.5).toFixed(2)} · faltan <strong>{falta.toFixed(2)}</strong></div>
        <div className="v-trim-hero-progress">
          <div className="v-trim-hero-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {simulador && (
        <div className="v-card v-sim">
          <div className="v-card-title">🎯 Simulador · qué necesitas</div>
          <div className="v-sim-msg">
            Sacando <strong style={{ color: "#059669", fontSize: 16 }}>{simulador.notaObjetivo?.toFixed(2)}</strong> este mes,
            cierras el trimestre en <strong>{simulador.notaProyectada?.toFixed(2)}</strong>
            {simulador.premio && <> y ganas el premio de <strong style={{ color: "#059669" }}>{formatoPesos(simulador.premio)}</strong> 🏆</>}
          </div>
        </div>
      )}

      {mesesTrim && mesesTrim.length > 0 && (
        <div className="v-card">
          <div className="v-card-title">📊 Desglose por mes</div>
          {mesesTrim.map((m, i) => (
            <div key={i} className="v-mes-row">
              <div>
                <div className="v-mes-nombre">{m.nombre}</div>
                <div className="v-mes-peso">Peso: {m.peso}%{m.estado === "progreso" && " · en curso"}{m.estado === "pendiente" && " · pendiente"}</div>
              </div>
              <div className={"v-mes-row-nota " + m.estado}>
                {m.estado === "pendiente" ? "—" : m.nota?.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      )}

      {premios && premios.length > 0 && (
        <div className="v-card" style={{ background: "linear-gradient(135deg, #fef3c7, #fed7aa)", borderLeft: "4px solid #f97316", border: "1px solid rgba(249, 115, 22, 0.2)" }}>
          <div className="v-card-title" style={{ color: "#7c2d12" }}>🏆 Premios en juego · {trimestre?.q}</div>
          {premios.map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", borderBottom: i < premios.length - 1 ? "1px dashed rgba(249, 115, 22, 0.2)" : "none" }}>
              <div style={{ fontSize: 32, width: 44, textAlign: "center" }}>{p.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: "#7c2d12" }}>{p.nombre}</div>
                <div style={{ fontSize: 12, color: "#9a3412", fontWeight: 600, marginTop: 2 }}>{p.condicion}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {ganadoras && ganadoras.length > 0 && (
        <div className="v-card">
          <div className="v-card-title">🏆 Ganadoras del {trimestre?.q} en {ciudad === "BOG" ? "Bogotá" : "Medellín"}</div>
          {ganadoras.map((g, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < ganadoras.length - 1 ? "1px dashed rgba(168, 85, 247, 0.15)" : "none" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 900, color: "#1e1b4b" }}>{g.nombre}</div>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>{g.razon}</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 900, color: "#047857" }}>{formatoPesos(g.monto)}</div>
            </div>
          ))}
        </div>
      )}

      {historial && historial.length > 0 && (
        <div className="v-card">
          <div className="v-card-title">📅 Historial de trimestres</div>
          {historial.map((h, i) => (
            <div key={i} style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 10px",
              background: h.activo ? "linear-gradient(90deg, #fef3c7, #fde68a)" : "rgba(168, 85, 247, 0.04)",
              border: h.activo ? "1.5px solid #fbbf24" : "none",
              borderRadius: 10,
              marginBottom: 4,
              fontSize: 12,
              fontWeight: 700,
              color: h.activo ? "#78350f" : "#475569",
            }}>
              <span style={{ width: 70, fontWeight: 900 }}>{h.q}</span>
              <span style={{ fontSize: 15, fontWeight: 900, color: h.activo ? "#78350f" : "#1e1b4b", width: 60, textAlign: "center" }}>{h.nota?.toFixed(2)}</span>
              <span style={{ flex: 1, textAlign: "right", fontSize: 11 }}>{h.premio}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
