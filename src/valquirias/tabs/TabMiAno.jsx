// Tab MI AÑO — HERO gigante del total 2026 + proyección + desglose completo + acceso a meses cerrados

import { formatoPesos } from "../lib/helpers.js";

export default function TabMiAno({
  totalAño = 0,
  proyeccion = 0,
  posicionTrim,
  ciudad,
  desglose = {},   // { salarioBase, premiosMensuales, premiosSemanales, premiosTrimestrales, reconocimientos }
  mesesCerrados = [], // [{ año, mes, nombre, ventas, nota, ganado }]
  onVerMes,
}) {
  const cd = ciudad === "BOG" ? "Bogotá" : "Medellín";
  return (
    <>
      <div className="v-hero-year">
        <div className="label">💎 Llevas ganado en 2026</div>
        <div className="valor">{formatoPesos(totalAño)}</div>
        {posicionTrim && (
          <div className="sub">🏆 Eres la #{posicionTrim} de {cd} este trimestre</div>
        )}
      </div>

      {proyeccion > 0 && (
        <div className="v-proy-year">
          <div className="label">🌟 Si sigues así hasta diciembre</div>
          <div className="valor">{formatoPesos(proyeccion)}</div>
          <div className="desc">Proyección total 2026 al ritmo actual</div>
        </div>
      )}

      <div className="v-historial-list">
        <div className="titulo">💫 Desglose 2026</div>
        <div className="row"><span className="lbl">Salario base</span><span className="val">{formatoPesos(desglose.salarioBase || 0)}</span></div>
        <div className="row"><span className="lbl">Premios mensuales por ventas</span><span className="val">{formatoPesos(desglose.premiosMensuales || 0)}</span></div>
        <div className="row"><span className="lbl">Premios semanales</span><span className="val">{formatoPesos(desglose.premiosSemanales || 0)}</span></div>
        <div className="row"><span className="lbl">Premios trimestrales</span><span className="val">{formatoPesos(desglose.premiosTrimestrales || 0)}</span></div>
        {desglose.reconocimientos && (
          <div className="row"><span className="lbl">Reconocimientos</span><span className="val">{desglose.reconocimientos}</span></div>
        )}
        <div className="total"><span className="lbl">Total 2026</span><span className="val">{formatoPesos(totalAño)}</span></div>
      </div>

      {mesesCerrados.length > 0 && (
        <div className="v-card" style={{ marginTop: 12 }}>
          <div className="v-card-title">📅 Meses cerrados</div>
          {mesesCerrados.map((m, i) => (
            <button
              key={i}
              onClick={() => onVerMes?.(m)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                width: "100%",
                padding: "10px 12px",
                background: "rgba(168, 85, 247, 0.05)",
                border: "1px solid rgba(168, 85, 247, 0.15)",
                borderRadius: 10,
                marginBottom: 4,
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 900, color: "#1e1b4b" }}>{m.nombre}</div>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginTop: 2 }}>
                  {formatoPesos(m.ventas)} · nota {m.nota?.toFixed(2)}
                </div>
              </div>
              <div style={{ color: "#a855f7", fontWeight: 900 }}>›</div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
