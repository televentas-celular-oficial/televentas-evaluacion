// Detalle Comportamiento — el 40% de la nota que hoy es invisible
// HERO morado + 5 indicadores con detalle operativo + tip motivacional

import { useEffect } from "react";

export default function DetalleComportamiento({
  notaComportamiento,   // sobre 5
  aporteNota,           // sobre nota final (5)
  indicadores,          // [{ id, nombre, emoji, peso, nota, detalle, estado }]
  tip,                  // { titulo, mensaje }
  onVolver,
}) {
  // Scroll al top al abrir — evita abrir mostrando el final
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <>
      <div className="v-header-detalle">
        <button className="v-back-btn" onClick={onVolver}>‹ Volver</button>
        <div className="v-header-title">📋 Comportamiento</div>
        <div style={{ width: 60 }} />
      </div>

      <div className="v-comp-hero">
        <div className="label">Tu 40% de la nota · Este mes</div>
        <div className="valor">{(notaComportamiento || 0).toFixed(2)}</div>
        <div className="desc">De 5.0 posibles · aporta {(aporteNota || 0).toFixed(2)} a tu nota total</div>
      </div>

      <div className="v-card">
        <div className="v-card-title">📊 Los 5 indicadores</div>
        {(indicadores || []).map((ind) => (
          <div key={ind.id} className={"v-ind-row " + (ind.estado || "good")}>
            <div className="ico">{ind.emoji || iconoDe(ind.estado)}</div>
            <div className="info">
              <div className="nom">{ind.nombre}</div>
              <div className="det">{ind.detalle}</div>
            </div>
            <div className="der">
              <div className={"nota" + (ind.estado === "warn" ? " warn" : "")}>{(ind.nota || 0).toFixed(1)}</div>
              <div className="peso">peso {ind.peso}%</div>
            </div>
          </div>
        ))}
      </div>

      {tip && (
        <div style={{
          background: "linear-gradient(135deg, #f0fdf4, #ecfdf5)",
          border: "1.5px dashed #10b981",
          borderRadius: 14,
          padding: "12px 14px",
          marginBottom: 8,
        }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#047857", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6 }}>
            💡 {tip.titulo || "Cómo subir tu nota"}
          </div>
          <div style={{ fontSize: 13, color: "#064e3b", fontWeight: 600, lineHeight: 1.55 }}>
            {tip.mensaje}
          </div>
        </div>
      )}
    </>
  );
}

function iconoDe(estado) {
  if (estado === "warn") return "⚠️";
  if (estado === "star") return "⭐";
  return "✅";
}
