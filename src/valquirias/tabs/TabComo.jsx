// Tab CÓMO FUNCIONA — reglamento completo con acordeones
// 2 versiones: MED (con piso $15M) y BOG (sin mención de piso)

import { useState } from "react";

function Acordeon({ titulo, abierto, onToggle, children }) {
  return (
    <div className={"v-acordeon " + (abierto ? "abierto" : "")}>
      <button className="v-acordeon-header" onClick={onToggle}>
        <span>{titulo}</span>
        <span className="v-acordeon-flecha">{abierto ? "▼" : "▶"}</span>
      </button>
      {abierto && <div className="v-acordeon-body">{children}</div>}
    </div>
  );
}

export default function TabComo({ ciudad }) {
  const [abierto, setAbierto] = useState("nota"); // primero abierto
  const esBog = ciudad === "BOG";
  const heroBg = esBog
    ? "linear-gradient(135deg, #f59e0b, #ec4899)"
    : "linear-gradient(135deg, #7c3aed, #ec4899)";
  const heroShadow = esBog
    ? "0 8px 24px rgba(245, 158, 11, 0.35)"
    : "0 8px 24px rgba(124, 58, 237, 0.35)";

  const tog = (id) => setAbierto(abierto === id ? null : id);

  return (
    <>
      <div style={{
        background: heroBg,
        color: "#fff",
        padding: "16px 18px",
        borderRadius: 16,
        marginBottom: 10,
        boxShadow: heroShadow,
      }}>
        <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 2, opacity: 0.95, marginBottom: 4 }}>
          💡 Todo lo que puedes ganar
        </div>
        <div style={{ fontSize: 18, fontWeight: 900 }}>
          Salario base + 4 tipos de premios
        </div>
      </div>

      <Acordeon titulo="📊 Tu nota mensual" abierto={abierto === "nota"} onToggle={() => tog("nota")}>
        <div><strong>60%</strong> viene de tus <strong>ventas</strong> (qué tanto cumples tu meta)</div>
        <div style={{ marginTop: 4 }}><strong>40%</strong> viene de tu <strong>comportamiento</strong> (5 indicadores):</div>
        <div style={{ background: "rgba(168, 85, 247, 0.06)", borderRadius: 10, padding: "8px 10px", marginTop: 6 }}>
          <div style={{ padding: "3px 0" }}>⏰ Puntualidad — 11%</div>
          <div style={{ padding: "3px 0" }}>🏪 Tienda — 9%</div>
          <div style={{ padding: "3px 0" }}>📋 Planilla — 9%</div>
          <div style={{ padding: "3px 0" }}>😊 Actitud — 6%</div>
          <div style={{ padding: "3px 0" }}>⭐ Reseñas — 5%</div>
        </div>
      </Acordeon>

      <Acordeon titulo="💰 Premio mensual por ventas" abierto={abierto === "mes"} onToggle={() => tog("mes")}>
        {!esBog && (
          <div style={{ marginBottom: 6 }}>
            Necesitas vender al menos <strong>$15.000.000</strong> en el mes para ganar este premio.
          </div>
        )}
        {esBog && (
          <div style={{ marginBottom: 6 }}>Ganas premio según cuánto vendas en el mes:</div>
        )}
        <div style={{ background: "rgba(168, 85, 247, 0.05)", borderRadius: 10, padding: 6, marginTop: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "6px 8px", background: "linear-gradient(135deg, #7c3aed, #ec4899)", color: "#fff", borderRadius: 6, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, fontWeight: 900, marginBottom: 4 }}>
            <span>Tramo</span><span>Asesora</span><span>Admin</span>
          </div>
          <div style={filaTabla}><span>Meta 1</span><span>1%</span><span>2%</span></div>
          <div style={filaTabla}><span>Meta 2</span><span>2%</span><span>4%</span></div>
          <div style={{ ...filaTabla, borderBottom: "none" }}><span>Meta 3</span><span>3%</span><span>6%</span></div>
        </div>
      </Acordeon>

      <Acordeon titulo="⚡ Premio semanal en efectivo" abierto={abierto === "sem"} onToggle={() => tog("sem")}>
        <div>Cada semana (lun-dom) puedes ganar:</div>
        <div style={premioBox}>💵 <strong>$50.000</strong> si vendes ≥$2.500.000 en efectivo</div>
        <div style={premioBox}>🏆 <strong>$50.000 EXTRA</strong> a la que más vendió en efectivo entre las que ya ganaron los $50k</div>
        <div style={{ color: "#64748b", marginTop: 6 }}>Se cierra domingo · se paga lunes</div>
      </Acordeon>

      <Acordeon titulo="💎 Premio trimestral" abierto={abierto === "trim"} onToggle={() => tog("trim")}>
        <div style={premioBox}>💰 <strong>$1.000.000</strong> si tu nota trimestral llega a <strong>4.50</strong></div>
        <div style={premioBox}>🌟 <strong>$1.000.000 EXTRA</strong> a la mejor de la ciudad si hay 2+ que pasan 4.50</div>
        <div style={{ marginTop: 6 }}>🏆 <strong>Reconocimiento sorpresa</strong> a la #1 (este trimestre: TV 42")</div>
      </Acordeon>

      <Acordeon titulo="📆 Cuándo se publica el ranking" abierto={abierto === "pub"} onToggle={() => tog("pub")}>
        <div><strong>Martes y viernes</strong> de <strong>6pm a 12am</strong></div>
        <div style={{ color: "#64748b", marginTop: 4 }}>Zona horaria Colombia. Fuera de esos días la app te avisa cuándo abre.</div>
      </Acordeon>

      <div style={{ textAlign: "center", marginTop: 12, padding: 10, background: "rgba(168, 85, 247, 0.06)", borderRadius: 10, fontSize: 12, color: "#64748b", fontWeight: 700 }}>
        💬 ¿Dudas? Escríbele a Luis directo
      </div>
    </>
  );
}

const filaTabla = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  padding: "6px 8px",
  fontSize: 13,
  fontWeight: 800,
  color: "#1e1b4b",
  borderBottom: "1px dashed rgba(168, 85, 247, 0.15)",
};

const premioBox = {
  background: "linear-gradient(90deg, #ecfdf5, #fff)",
  borderLeft: "3px solid #10b981",
  padding: "8px 10px",
  borderRadius: 8,
  margin: "6px 0",
  fontSize: 13,
  color: "#064e3b",
  fontWeight: 700,
};
