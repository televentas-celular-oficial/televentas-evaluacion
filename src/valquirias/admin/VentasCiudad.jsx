// Admin > Ventas por ciudad
// Portado de PantallaVentas (App.jsx:1264-1368) al estilo Valquirias TLV.
//
// SOLO LECTURA. Las ventas las sincroniza systemlap cada 5 min y las metas se
// cargan en Admin → 🎯 Metas del mes. Esta pantalla nunca escribe en Firestore
// (un ajuste manual acá sobrescribiría lo que ya trajo la sync).
//
// Qué muestra por ciudad (MED / BOG):
//   · meta del mes · total vendido · % de cumplimiento con barra · cuánto falta
//   · lista de vendedoras ordenada por ventas, con su % individual
//
// Y avisa fuerte cuando el mes NO tiene metas cargadas — antes ese caso pasaba
// silencioso y todo se veía en 0% sin explicar por qué.

import { useState } from "react";
import { useDatos } from "../data/DatosContext.jsx";
import { derivarVentasTotalesMes } from "../data/derivar.js";
import { formatoPesos, hoyColombia, diasParaFinMes } from "../lib/helpers.js";

const MES_NOMBRES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const CIUDADES = [
  {
    id: "MED",
    titulo: "🟢 Team Valkyrias Medellín",
    color: "#10b981",
    borde: "#10b981",
    tinte: "#047857",
    bg: "linear-gradient(135deg, #ecfdf5, #d1fae5)",
  },
  {
    id: "BOG",
    titulo: "🟡 Team Valkyrias Bogotá",
    color: "#f59e0b",
    borde: "#f59e0b",
    tinte: "#b45309",
    bg: "linear-gradient(135deg, #fef3c7, #fde68a)",
  },
];

// Retrocompat: meta pudo guardarse como número (aplicaba igual a las 2 ciudades)
// antes de que se separaran en { MED, BOG }.
function metaDeCiudad(metaField, ciudad) {
  if (metaField == null) return 0;
  if (typeof metaField === "number") return metaField;
  if (typeof metaField === "object") return Number(metaField[ciudad]) || 0;
  return 0;
}

function pctDe(valor, meta) {
  return meta > 0 ? Math.round((valor / meta) * 100) : 0;
}

function colorPct(pct, colorCiudad) {
  if (pct >= 100) return "#059669";
  if (pct >= 70) return "#d97706";
  return colorCiudad;
}

export default function VentasCiudad({ onVolver }) {
  const datos = useDatos();
  const hoy = hoyColombia();
  const [selMes, setSelMes] = useState({ año: hoy.año, mes: hoy.mes });

  const clave = `${selMes.año}_${String(selMes.mes).padStart(2, "0")}`;
  const cerrado = !!datos.snapshots?.[clave];
  const metaField = datos.metas?.[clave]?.meta;
  const ventasMes = datos.metas?.[clave]?.vendidas || {};

  const metas = { MED: metaDeCiudad(metaField, "MED"), BOG: metaDeCiudad(metaField, "BOG") };
  const totales = derivarVentasTotalesMes(datos, selMes.año, selMes.mes);
  const vendidoCiudad = { MED: totales.med, BOG: totales.bog };

  const sinMetas = metas.MED <= 0 && metas.BOG <= 0;
  const esMesEnCurso = selMes.año === hoy.año && selMes.mes === hoy.mes;

  // Listas por ciudad ordenadas por ventas (mayor → menor).
  // Se incluyen las inactivas que SÍ vendieron en el mes: si no, la suma de la
  // lista no cuadraría con el total de la ciudad (derivarVentasTotalesMes las
  // cuenta) y parecería un error de plata.
  const porCiudad = { MED: [], BOG: [] };
  (datos.vendedoras || []).forEach(v => {
    if (v.eventual) return;
    if (!porCiudad[v.ciudad]) return;
    const real = Number(ventasMes[v.id]) || 0;
    const activa = v.activa !== false;
    if (!activa && real <= 0) return;
    porCiudad[v.ciudad].push({ ...v, activa, real, pct: pctDe(real, metas[v.ciudad]) });
  });
  porCiudad.MED.sort((a, b) => b.real - a.real);
  porCiudad.BOG.sort((a, b) => b.real - a.real);

  const hayVendedoras = porCiudad.MED.length > 0 || porCiudad.BOG.length > 0;

  // Selector: meses del año en curso hasta el mes actual (igual que la clásica)
  const mesesDisponibles = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter(m => m <= hoy.mes);

  return (
    <div className="v-app v-ancho">
      <div className="v-header-detalle">
        <button className="v-back-btn" onClick={onVolver}>‹ Volver</button>
        <div className="v-header-title">💰 Ventas por ciudad</div>
        <div style={{ width: 60 }} />
      </div>

      {/* Selector de mes */}
      <div style={{ display: "flex", gap: 4, overflowX: "auto", padding: "0 0 10px", marginBottom: 10 }}>
        {mesesDisponibles.map(m => {
          const activo = m === selMes.mes;
          return (
            <button
              key={m}
              onClick={() => setSelMes({ año: hoy.año, mes: m })}
              style={{
                padding: "6px 12px",
                fontSize: 11,
                fontWeight: 800,
                background: activo ? "linear-gradient(135deg, #7c3aed, #ec4899)" : "#fff",
                color: activo ? "#fff" : "#7c3aed",
                border: "1.5px solid " + (activo ? "transparent" : "#e2e8f0"),
                borderRadius: 8,
                cursor: "pointer",
                flexShrink: 0,
                whiteSpace: "nowrap",
                textTransform: "capitalize",
              }}
            >{MES_CORTO[m - 1]}</button>
          );
        })}
      </div>

      {/* HERO total del mes */}
      <div style={{
        background: "linear-gradient(135deg, #ec4899 0%, #a855f7 50%, #7c3aed 100%)",
        color: "#fff",
        padding: "22px 20px",
        borderRadius: 20,
        marginBottom: 10,
        boxShadow: "0 15px 35px rgba(168, 85, 247, 0.35)",
        position: "relative",
        overflow: "hidden",
        textAlign: "center",
      }}>
        <div style={{ position: "absolute", top: "-50%", right: "-30%", width: 260, height: 260, background: "radial-gradient(circle, rgba(255,255,255,0.25), transparent 60%)", borderRadius: "50%", pointerEvents: "none" }} />
        <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 2, opacity: 0.95, marginBottom: 4, position: "relative" }}>
          💫 Vendido en {MES_NOMBRES[selMes.mes - 1]} {selMes.año}
        </div>
        <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1, position: "relative", textShadow: "0 2px 6px rgba(0,0,0,0.15)" }}>
          {formatoPesos(totales.total)}
        </div>
        <div style={{ fontSize: 12, marginTop: 8, opacity: 0.95, fontWeight: 700, position: "relative" }}>
          🟢 MED {formatoPesos(totales.med)} · 🟡 BOG {formatoPesos(totales.bog)}
        </div>
        {esMesEnCurso && (
          <div style={{ fontSize: 11, marginTop: 6, opacity: 0.9, fontWeight: 700, position: "relative" }}>
            ⏳ Quedan {diasParaFinMes()} día{diasParaFinMes() === 1 ? "" : "s"} del mes
          </div>
        )}
      </div>

      {/* ALERTA: mes sin metas cargadas */}
      {sinMetas && (
        <div style={{
          padding: "14px 16px",
          background: "rgba(239, 68, 68, 0.10)",
          borderLeft: "4px solid #ef4444",
          borderRadius: 12,
          marginBottom: 10,
          lineHeight: 1.55,
        }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: "#991b1b" }}>
            ⚠️ Este mes aún no tiene metas cargadas
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "#b91c1c", marginTop: 4 }}>
            Sin meta de {MES_NOMBRES[selMes.mes - 1]} no se puede calcular el % de cumplimiento
            (todo se ve en 0%) ni la nota de ventas de las vendedoras.
            Cárgalas en <strong>Admin → 🎯 Metas del mes</strong>.
          </div>
        </div>
      )}

      {/* Mes cerrado */}
      {cerrado && (
        <div style={{ padding: "10px 14px", background: "linear-gradient(135deg, #fef3c7, #fde68a)", borderRadius: 12, marginBottom: 10, fontSize: 12, fontWeight: 900, color: "#92400e" }}>
          🔒 Mes cerrado · datos finales
        </div>
      )}

      {/* Nota solo lectura */}
      <div style={{ padding: "10px 12px", background: "rgba(59, 130, 246, 0.07)", borderLeft: "3px solid #3b82f6", borderRadius: 10, fontSize: 11, color: "#1e40af", fontWeight: 700, marginBottom: 10, lineHeight: 1.55 }}>
        📡 <strong>Vista de solo lectura.</strong> Las ventas se sincronizan desde systemlap cada 5 min.
        Las metas se cargan en <strong>Admin → 🎯 Metas del mes</strong>.
      </div>

      {!hayVendedoras && (
        <div style={{ padding: "18px 16px", background: "rgba(148, 163, 184, 0.10)", border: "1.5px dashed #cbd5e1", borderRadius: 12, fontSize: 12, fontWeight: 700, color: "#64748b", textAlign: "center", lineHeight: 1.55 }}>
          Sin vendedoras sincronizadas — verifica el sync desde systemlap.
        </div>
      )}

      {hayVendedoras && CIUDADES.map(c => (
        <BloqueCiudad
          key={c.id}
          ciudad={c}
          meta={metas[c.id]}
          vendido={vendidoCiudad[c.id]}
          lista={porCiudad[c.id]}
        />
      ))}
    </div>
  );
}

function BloqueCiudad({ ciudad, meta, vendido, lista }) {
  if (!lista.length) return null;

  const pct = pctDe(vendido, meta);
  const falta = Math.max(meta - vendido, 0);
  const excedente = Math.max(vendido - meta, 0);
  const barra = colorPct(pct, ciudad.color);

  return (
    <div style={{ marginBottom: 14 }}>
      {/* Cabecera ciudad: meta + vendido + % + barra */}
      <div style={{ background: ciudad.bg, borderLeft: `4px solid ${ciudad.borde}`, border: `1px solid ${ciudad.borde}20`, padding: "12px 14px", borderRadius: 12, marginBottom: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: ciudad.tinte }}>{ciudad.titulo}</div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>Meta</div>
            <div style={{ fontSize: 12, fontWeight: 900, color: meta > 0 ? "#1e1b4b" : "#dc2626" }}>
              {meta > 0 ? formatoPesos(meta) : "sin cargar"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 10, marginBottom: 5 }}>
          <span style={{ fontSize: 10, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>Vendido</span>
          <span style={{ fontSize: 17, fontWeight: 900, color: pct >= 100 ? "#059669" : "#1e1b4b", letterSpacing: -0.5 }}>
            {formatoPesos(vendido)}
            {meta > 0 && <span style={{ fontSize: 12, color: barra, marginLeft: 6 }}>{pct}%</span>}
          </span>
        </div>

        {/* Barra de progreso */}
        <div style={{ background: "rgba(255,255,255,0.75)", borderRadius: 6, height: 10, overflow: "hidden", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.08)" }}>
          <div style={{
            height: "100%",
            width: Math.min(pct, 100) + "%",
            borderRadius: 6,
            background: pct >= 100
              ? "linear-gradient(90deg, #10b981, #059669)"
              : `linear-gradient(90deg, ${barra}, ${barra}cc)`,
            transition: "width 0.3s",
          }} />
        </div>

        {/* Cuánto falta */}
        <div style={{ fontSize: 11.5, fontWeight: 800, marginTop: 6, color: meta <= 0 ? "#b91c1c" : pct >= 100 ? "#047857" : ciudad.tinte }}>
          {meta <= 0
            ? `⚠️ Sin meta cargada para ${ciudad.id} — no se puede medir el cumplimiento`
            : pct >= 100
              ? `🎉 Meta cumplida · ${formatoPesos(excedente)} por encima`
              : `Faltan ${formatoPesos(falta)} para la meta`}
        </div>
      </div>

      {/* Vendedoras de la ciudad, ordenadas por ventas */}
      <div style={{ fontSize: 9.5, fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, padding: "2px 12px 5px", display: "flex", justifyContent: "space-between" }}>
        <span>Vendedora</span>
        <span>Vendido · % de la meta ciudad</span>
      </div>

      {lista.map((v, i) => (
        <div key={v.id} style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          background: "#fff",
          borderRadius: 12,
          marginBottom: 4,
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          borderLeft: "3px solid " + (v.real > 0 ? ciudad.borde : "#cbd5e1"),
          opacity: v.real > 0 ? 1 : 0.65,
        }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: i === 0 && v.real > 0 ? "#eab308" : "#94a3b8", width: 20, textAlign: "center" }}>
            {i === 0 && v.real > 0 ? "🥇" : i + 1}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#1e1b4b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {v.nombre}
              {v.rolTienda === "admin" && (
                <span style={{ marginLeft: 6, fontSize: 9, background: "#faf5ff", color: "#7c3aed", padding: "1px 6px", borderRadius: 4, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.5 }}>Admin</span>
              )}
              {!v.activa && (
                <span style={{ marginLeft: 6, fontSize: 9, background: "#f1f5f9", color: "#64748b", padding: "1px 6px", borderRadius: 4, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.5 }}>Inactiva</span>
              )}
            </div>
            {/* Mini barra individual */}
            <div style={{ background: "#eef2f7", borderRadius: 4, height: 5, overflow: "hidden", marginTop: 5 }}>
              <div style={{ height: "100%", width: Math.min(v.pct, 100) + "%", borderRadius: 4, background: colorPct(v.pct, ciudad.color) }} />
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0, minWidth: 92 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: v.pct >= 100 ? "#059669" : "#1e1b4b" }}>
              {formatoPesos(v.real)}
            </div>
            <div style={{ fontSize: 10, fontWeight: 800, color: meta > 0 ? colorPct(v.pct, "#94a3b8") : "#cbd5e1", marginTop: 1 }}>
              {meta > 0 ? `${v.pct}%` : "sin meta"}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
