// Admin > Nómina de comisiones mensuales
// Solo comisión por ventas del mes — NO incluye premios semanales ni trimestrales
// Cálculo automático con reglas: piso MED $15M, tramos, % por rol, pro-rata si cambio de rol mid-mes

import { useState, useMemo } from "react";
import { formatoPesos, hoyColombia, calcComisionMensual, PISO_MED } from "../lib/helpers.js";
import { VENDEDORAS_DEFAULT } from "../../lib/constantes.js";
import { useDatos } from "../data/DatosContext.jsx";

const MES_NOMBRES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

// Fallback (modo demo): ventas mock si Firestore no tiene datos del mes.
// IDs alineados con VENDEDORAS_DEFAULT del roster real.
const MOCK_VENTAS = {
  // MED
  1: 24_800_000,   // Lorena (admin)
  2: 22_600_000,   // Dayana (admin)
  3: 19_400_000,   // Jennifer (asesora)
  4: 28_500_000,   // Durley (admin)
  5: 13_200_000,   // Manuela (asesora) — NO llega al piso $15M → $0
  7: 21_600_000,   // Luisa (asesora)
  // BOG
  6: 26_300_000,   // Xiomara (admin)
  9: 23_100_000,   // Leydy (admin)
  10: 20_800_000,  // Mary Jacqueline (admin)
  11: 18_500_000,  // Yesica (admin)
  13: 16_200_000,  // Alisson (admin)
  15: 8_400_000,   // Norvy (asesora)
  16: 6_900_000,   // Paula (asesora)
};

// rolTienda ya viene del roster real en constantes.js — no necesita mock
const ROL_TIENDA_MOCK = {};

export default function NominaComisiones({ onVolver }) {
  const datos = useDatos();
  const hoy = hoyColombia();
  // Default: mes en curso (así al abrir se ve cómo va la comisión hasta hoy).
  // La lista muestra los últimos 12 meses en el selector.
  const [selMes, setSelMes] = useState({ año: hoy.año, mes: hoy.mes });

  // Cálculo automático con datos reales de Firestore (o mock si no hay)
  const filas = useMemo(() => {
    const claveMes = `${selMes.año}_${String(selMes.mes).padStart(2, "0")}`;
    const ventasFS = datos.metas?.[claveMes]?.vendidas || {};
    const vendedoras = (datos.vendedoras && datos.vendedoras.length > 0) ? datos.vendedoras : VENDEDORAS_DEFAULT;

    return vendedoras
      .filter(v => v.activa !== false)
      .map(v => {
        const ventasReales = ventasFS[v.id];
        const ventas = (ventasReales !== undefined) ? ventasReales : (MOCK_VENTAS[v.id] || 0);
        const rolTienda = v.rolTienda || ROL_TIENDA_MOCK[v.id] || "asesora";
        const calc = calcComisionMensual({
          ciudad: v.ciudad,
          rol: rolTienda,
          ventasMes: ventas,
          // TODO: si v.fechaAscensoAdmin cae en el mes, pasar datosCambioRol
        });
        return { v: { ...v, rolTienda }, ventas, calc };
      })
      .sort((a, b) => b.calc.comision - a.calc.comision);
  }, [selMes, datos.metas, datos.vendedoras]);

  const filasMed = filas.filter(f => f.v.ciudad === "MED");
  const filasBog = filas.filter(f => f.v.ciudad === "BOG");
  const totalMed = filasMed.reduce((s, f) => s + f.calc.comision, 0);
  const totalBog = filasBog.reduce((s, f) => s + f.calc.comision, 0);
  const totalGen = totalMed + totalBog;

  // Selector: mes en curso primero, luego los 11 anteriores
  const meses = [];
  for (let i = 0; i < 12; i++) {
    let m = hoy.mes - i;
    let a = hoy.año;
    while (m <= 0) { m += 12; a -= 1; }
    meses.push({ año: a, mes: m });
  }

  return (
    <div className="v-app">
      <div className="v-header-detalle">
        <button className="v-back-btn" onClick={onVolver}>‹ Volver</button>
        <div className="v-header-title">💰 Nómina comisiones</div>
        <div style={{ width: 60 }} />
      </div>

      {/* Selector de mes */}
      <div style={{ display: "flex", gap: 4, overflowX: "auto", padding: "0 0 10px", marginBottom: 10 }}>
        {meses.map(m => {
          const activo = m.año === selMes.año && m.mes === selMes.mes;
          return (
            <button
              key={`${m.año}-${m.mes}`}
              onClick={() => setSelMes(m)}
              style={{
                padding: "6px 10px",
                fontSize: 11,
                fontWeight: 800,
                background: activo ? "linear-gradient(135deg, #7c3aed, #ec4899)" : "#fff",
                color: activo ? "#fff" : "#7c3aed",
                border: "1.5px solid " + (activo ? "transparent" : "#e2e8f0"),
                borderRadius: 8,
                cursor: "pointer",
                flexShrink: 0,
                whiteSpace: "nowrap",
              }}
            >{MES_NOMBRES[m.mes - 1].slice(0, 3)} {m.año}</button>
          );
        })}
      </div>

      {/* HERO total */}
      <div style={{
        background: "linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)",
        color: "#fff",
        padding: "22px 20px",
        borderRadius: 20,
        marginBottom: 10,
        boxShadow: "0 15px 35px rgba(16, 185, 129, 0.35)",
        position: "relative",
        overflow: "hidden",
        textAlign: "center",
      }}>
        <div style={{ position: "absolute", top: "-50%", right: "-30%", width: 260, height: 260, background: "radial-gradient(circle, rgba(255,255,255,0.25), transparent 60%)", borderRadius: "50%", pointerEvents: "none" }} />
        <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 2, opacity: 0.95, marginBottom: 4, position: "relative" }}>
          💰 Total a pagar · {MES_NOMBRES[selMes.mes - 1]} {selMes.año}
        </div>
        <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1, position: "relative", textShadow: "0 2px 6px rgba(0,0,0,0.15)" }}>
          {formatoPesos(totalGen)}
        </div>
        <div style={{ fontSize: 12, marginTop: 8, opacity: 0.95, fontWeight: 700, position: "relative" }}>
          🟢 MED {formatoPesos(totalMed)} · 🟡 BOG {formatoPesos(totalBog)}
        </div>
      </div>

      {/* Info importante */}
      <div style={{ padding: "10px 12px", background: "rgba(168, 85, 247, 0.08)", borderLeft: "3px solid #a855f7", borderRadius: 10, fontSize: 11, color: "#5b21b6", fontWeight: 700, marginBottom: 10, lineHeight: 1.55 }}>
        💡 Solo comisiones por ventas del mes. <strong>No incluye</strong> premios semanales ($50k) ni trimestrales ($1M) ni reconocimientos. Ventas ya vienen netas de devoluciones y cambios.
      </div>

      {/* Sección MED */}
      <SeccionCiudad
        titulo="🟢 Team Valquirias Medellín"
        subtitulo={`Piso ${formatoPesos(PISO_MED)} · sin llegar al piso → $0`}
        color="green"
        filas={filasMed}
        total={totalMed}
      />

      {/* Sección BOG */}
      <SeccionCiudad
        titulo="🟡 Team Valquirias Bogotá"
        subtitulo="Sin piso · gana desde la primera venta"
        color="amber"
        filas={filasBog}
        total={totalBog}
      />

      <div style={{ marginTop: 14, textAlign: "center", fontSize: 10, color: "#94a3b8", fontWeight: 700 }}>
        📸 Toma pantallazo para pasar a nómina · cálculo generado el {hoy.iso}
      </div>
    </div>
  );
}

function SeccionCiudad({ titulo, subtitulo, color, filas, total }) {
  const bg = color === "green" ? "linear-gradient(135deg, #ecfdf5, #d1fae5)" : "linear-gradient(135deg, #fef3c7, #fde68a)";
  const borde = color === "green" ? "#10b981" : "#f59e0b";
  const tint = color === "green" ? "#047857" : "#92400e";

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ background: bg, borderLeft: `4px solid ${borde}`, padding: "10px 12px", borderRadius: 12, marginBottom: 6, border: `1px solid ${borde}20` }}>
        <div style={{ fontSize: 13, fontWeight: 900, color: tint }}>{titulo}</div>
        <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, marginTop: 2 }}>{subtitulo}</div>
      </div>

      {filas.map(({ v, ventas, calc }) => (
        <div key={v.id} style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          padding: "10px 12px",
          background: "#fff",
          borderRadius: 12,
          marginBottom: 4,
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          borderLeft: "3px solid " + (calc.comision > 0 ? borde : "#cbd5e1"),
          opacity: calc.comision > 0 ? 1 : 0.7,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#1e1b4b" }}>
              {v.nombre}
              <span style={{ marginLeft: 6, fontSize: 9, background: v.rolTienda === "admin" ? "#faf5ff" : "#f0fdf4", color: v.rolTienda === "admin" ? "#7c3aed" : "#047857", padding: "1px 6px", borderRadius: 4, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {v.rolTienda === "admin" ? "Admin" : "Asesora"}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginTop: 2 }}>
              Vendió {formatoPesos(ventas)} · {calc.detalle}
            </div>
          </div>
          <div style={{
            fontSize: 15,
            fontWeight: 900,
            color: calc.comision > 0 ? tint : "#94a3b8",
            textAlign: "right",
            minWidth: 90,
          }}>
            {formatoPesos(calc.comision)}
          </div>
        </div>
      ))}

      {filas.length > 0 && (
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "8px 12px",
          background: bg,
          borderRadius: 10,
          marginTop: 4,
          fontSize: 12,
          fontWeight: 900,
          color: tint,
        }}>
          <span>Total {color === "green" ? "MED" : "BOG"}</span>
          <span>{formatoPesos(total)}</span>
        </div>
      )}
    </div>
  );
}
