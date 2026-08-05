// Detalle Comportamiento — el 40% de la nota que hoy es invisible
// HERO morado + indicadores REALES con detalle operativo + tip motivacional
//
// Los datos vienen de derivarComportamientoDeVendedora() (data/derivar.js), que
// delega todo cálculo en src/lib/calculos.js → hereda V1/V2, snapshots y penalizaciones.

import { useEffect } from "react";

export default function DetalleComportamiento({
  notaComportamiento,   // number | null — sobre 5
  aporteNota,           // number | null — cuánto aporta a la nota final
  pesoComportamiento,   // 40 en V2, 70 en V1
  indicadores,          // [{ id, nombre, emoji, color, peso, nota, detalle, estado }]
  dias,                 // días trabajados evaluados este mes
  cerrado,              // mes cerrado (snapshot congelado)
  nombreMes,
  tip,                  // { titulo, mensaje }
  onVolver,
}) {
  // Scroll al top al abrir — evita abrir mostrando el final
  useEffect(() => { window.scrollTo(0, 0); }, []);

  const lista = Array.isArray(indicadores) ? indicadores : [];
  const conNota = lista.filter((i) => i.nota !== null && i.nota !== undefined);

  // Empty state SOLO cuando genuinamente no hay datos del mes:
  // sin nota de comportamiento y sin ningún indicador calculado.
  const sinDatos = (notaComportamiento === null || notaComportamiento === undefined) && conNota.length === 0;

  const peso = pesoComportamiento || 40;
  const pesoTotal = lista.reduce((s, i) => s + (i.peso || 0), 0);

  // Cuánto le cuesta a la nota cada indicador: (5 - nota) * peso / pesoTotal.
  // Es exacto: notaBase = Σ(nota_i · peso_i) / Σpeso_i  →  5 - notaBase = Σ((5 - nota_i)·peso_i)/Σpeso_i
  const costeDe = (ind) => {
    if (ind.nota === null || ind.nota === undefined || !pesoTotal) return 0;
    return Math.round(((5 - ind.nota) * (ind.peso || 0) / pesoTotal) * 100) / 100;
  };

  const peor = conNota.length
    ? conNota.reduce((a, b) => (costeDe(b) > costeDe(a) ? b : a))
    : null;
  const faltaPara5 =
    notaComportamiento === null || notaComportamiento === undefined
      ? null
      : Math.round((5 - notaComportamiento) * 100) / 100;

  return (
    <>
      <div className="v-header-detalle">
        <button className="v-back-btn" onClick={onVolver}>‹ Volver</button>
        <div className="v-header-title">📋 Comportamiento</div>
        <div style={{ width: 60 }} />
      </div>

      {sinDatos ? (
        <div className="v-comp-hero">
          <div className="label">Tu {peso}% de la nota</div>
          <div className="valor">—</div>
          <div className="desc">
            Todavía no hay días registrados{nombreMes ? ` de ${nombreMes}` : ""}. Se calcula con los indicadores que anota Carolina cada día.
          </div>
        </div>
      ) : (
        <>
          <div className="v-comp-hero">
            <div className="label">
              Tu {peso}% de la nota{nombreMes ? ` · ${nombreMes}` : ""}
            </div>
            <div className="valor">{fmt(notaComportamiento)}</div>
            <div className="desc">
              De 5.00 posibles
              {aporteNota !== null && aporteNota !== undefined
                ? <> · aporta <strong>{fmt(aporteNota)}</strong> a tu nota total</>
                : null}
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", position: "relative" }}>
              <span style={chipHero}>
                {dias ? `${dias} ${dias === 1 ? "día evaluado" : "días evaluados"}` : "Sin días evaluados"}
              </span>
              <span style={chipHero}>{cerrado ? "🔒 Mes cerrado" : "🔄 En curso"}</span>
            </div>
          </div>

          <div className="v-card">
            <div className="v-card-title">
              <span>📊 {lista.length === 1 ? "Tu indicador" : `Los ${lista.length} indicadores`}</span>
              <span className="v-card-title-cierra">pesos suman {pesoTotal}</span>
            </div>

            {lista.map((ind) => {
              const tieneNota = ind.nota !== null && ind.nota !== undefined;
              const estado = tieneNota ? (ind.estado || "good") : "";
              const coste = costeDe(ind);
              const pct = tieneNota ? Math.max(0, Math.min(100, (ind.nota / 5) * 100)) : 0;
              return (
                <div key={ind.id} className={("v-ind-row " + estado).trim()}>
                  <div className="ico">{ind.emoji || iconoDe(ind.estado)}</div>
                  <div className="info">
                    <div className="nom">{ind.nombre}</div>
                    <div className="det">{ind.detalle || (tieneNota ? "" : "Sin datos este mes")}</div>
                    <div style={barTrack}>
                      <div
                        style={{
                          ...barFill,
                          width: `${pct}%`,
                          background: tieneNota ? (ind.color || "#a855f7") : "#cbd5e1",
                        }}
                      />
                    </div>
                  </div>
                  <div className="der">
                    <div className={"nota" + (estado === "warn" ? " warn" : "")}>
                      {tieneNota ? fmt(ind.nota) : "—"}
                    </div>
                    <div className="peso">peso {ind.peso}%</div>
                    {coste > 0 && (
                      <div style={costeStyle}>−{coste.toFixed(2)}</div>
                    )}
                  </div>
                </div>
              );
            })}

            {faltaPara5 !== null && faltaPara5 > 0 && peor && costeDe(peor) > 0 && (
              <div style={resumenStyle}>
                Te faltan <strong>{faltaPara5.toFixed(2)}</strong> para el 5.00.
                Lo que más te resta: <strong>{peor.emoji ? `${peor.emoji} ` : ""}{peor.nombre}</strong>
                {" "}(−{costeDe(peor).toFixed(2)}).
              </div>
            )}
            {faltaPara5 === 0 && (
              <div style={{ ...resumenStyle, borderColor: "#10b98159", color: "#047857", background: "linear-gradient(90deg, #ecfdf5, #fff)" }}>
                🏆 Comportamiento perfecto: <strong>5.00</strong> en todos los indicadores.
              </div>
            )}
          </div>
        </>
      )}

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

function fmt(n) {
  return typeof n === "number" && !Number.isNaN(n) ? n.toFixed(2) : "—";
}

function iconoDe(estado) {
  if (estado === "warn") return "⚠️";
  if (estado === "star") return "⭐";
  return "✅";
}

const chipHero = {
  background: "rgba(255,255,255,0.22)",
  border: "1px solid rgba(255,255,255,0.35)",
  borderRadius: 20,
  padding: "3px 10px",
  fontSize: 11,
  fontWeight: 800,
};

const barTrack = {
  marginTop: 6,
  height: 5,
  borderRadius: 3,
  background: "rgba(148,163,184,0.25)",
  overflow: "hidden",
};

const barFill = {
  height: "100%",
  borderRadius: 3,
};

const costeStyle = {
  marginTop: 3,
  fontSize: 10,
  fontWeight: 800,
  color: "#b45309",
};

const resumenStyle = {
  marginTop: 8,
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px dashed #a855f759",
  background: "linear-gradient(90deg, #faf5ff, #fff)",
  fontSize: 12,
  fontWeight: 700,
  color: "#475569",
  lineHeight: 1.5,
};
