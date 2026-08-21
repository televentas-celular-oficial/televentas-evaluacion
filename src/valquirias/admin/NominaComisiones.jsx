// Admin > Nómina de comisiones mensuales
// Solo comisión por ventas del mes — NO incluye premios semanales ni trimestrales
// Cálculo automático con reglas: piso MED $15M, tramos, % por rol, pro-rata si cambio de rol mid-mes

import { useState, useMemo } from "react";
import {
  formatoPesos,
  hoyColombia,
  calcComisionMensual,
  PISO_MED,
  // ROL HISTÓRICO — qué era la vendedora en el mes que se está pagando.
  // Esta pantalla calculaba los 12 meses del selector con el rol de HOY:
  // ascender a una asesora le duplicaba retroactivamente la comisión de todos
  // los meses ya pagados (1%→2%, 2%→4%, 3%→6%). `rolDeMes` lo resuelve contra
  // `fechaAscensoAdmin`.
  //
  // Antes esta función estaba COPIADA aquí y en data/derivar.js, con un
  // comentario que pedía tocar las dos a la vez. Ahora hay UNA sola copia en
  // lib/helpers.js: la cifra que ve la vendedora en su boletín y la que el
  // dueño paga en esta pantalla salen literalmente del mismo código.
  rolDeMes,
  ROL_LARGO,
  ROL_CORTO,
  pctTexto,
} from "../lib/helpers.js";
import { useDatos } from "../data/DatosContext.jsx";

const MES_NOMBRES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

const plural = (n, sing, plu) => `${n} ${n === 1 ? sing : plu}`;

export default function NominaComisiones({ onVolver }) {
  const datos = useDatos();
  const hoy = hoyColombia();
  // Default: mes en curso (así al abrir se ve cómo va la comisión hasta hoy).
  // La lista muestra los últimos 12 meses en el selector.
  const [selMes, setSelMes] = useState({ año: hoy.año, mes: hoy.mes });

  // Cálculo automático con datos reales de Firestore — sin fallbacks mock.
  const claveMes = `${selMes.año}_${String(selMes.mes).padStart(2, "0")}`;
  const ventasFS = datos.metas?.[claveMes]?.vendidas || {};
  const vendedoras = datos.vendedoras || [];
  const hayVendedoras = vendedoras.length > 0;
  const hayVentasMes = Object.values(ventasFS).some(v => Number(v) > 0);

  const filas = useMemo(() => {
    return vendedoras
      // QUIÉN ENTRA EN LA NÓMINA DE ESTE MES:
      // las activas de hoy, MÁS cualquiera que tenga ventas registradas en el
      // mes seleccionado aunque hoy ya no trabaje aquí. Antes el filtro era
      // sólo `v.activa !== false`: cuando alguien salía, el worker la marcaba
      // `activa: false` y desaparecía de la nómina de los meses que SÍ trabajó
      // y SÍ generó comisión — el dueño le quedaba debiendo sin enterarse.
      // Quien salió y no vendió nada ese mes sigue fuera (no aporta ruido).
      .filter(v => v.activa !== false || Number(ventasFS[v.id]) > 0)
      .map(v => {
        const ventas = ventasFS[v.id] || 0;
        // Rol que tenía en el mes SELECCIONADO, no el de hoy. Si el ascenso
        // cayó dentro del mes, `datosCambioRol` hace que calcComisionMensual
        // prorratee día a día. Fuente única: lib/helpers.js.
        const { rol, datosCambioRol, historico } = rolDeMes(v, selMes.año, selMes.mes);
        const calc = calcComisionMensual({
          ciudad: v.ciudad,
          rol,
          ventasMes: ventas,
          datosCambioRol,
          // El mes decide si el piso de MED ya regía (rige desde ago-2026).
          // Sin esto, junio y julio se liquidaban con un piso que no existía.
          año: selMes.año,
          mes: selMes.mes,
        });
        return {
          v: { ...v, rolTienda: rol },
          ventas,
          calc,
          rolMes: rol,
          rolHistorico: historico,
          ascensoEnEsteMes: !!datosCambioRol,
          // true = hoy ya no está en el roster, pero este mes trabajó y vendió
          yaNoTrabaja: v.activa === false,
        };
      })
      .sort((a, b) => b.calc.comision - a.calc.comision);
  }, [selMes, datos.metas, datos.vendedoras]);

  const filasMed = filas.filter(f => f.v.ciudad === "MED");
  const filasBog = filas.filter(f => f.v.ciudad === "BOG");
  // Sin ciudad no se sabe si aplica el piso de $15M de Medellín → no se puede
  // liquidar. No se inventa una cifra: se avisa, para que no desaparezca sin
  // que nadie lo note (que es lo que pasaba antes con las inactivas).
  const filasSinCiudad = filas.filter(f => f.v.ciudad !== "MED" && f.v.ciudad !== "BOG" && f.ventas > 0);
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
        💡 Solo comisiones por ventas del mes. <strong>No incluye</strong> premios semanales ($50.000) ni trimestrales ($1.000.000) ni reconocimientos. Ventas ya vienen netas de devoluciones y cambios.
        <br />El % es el del <strong>rol que tenía ese mes</strong>, no el cargo de hoy. Si ascendió a mitad de mes, la fila muestra la pro-rata día a día.
        <br />Aparecen también las que <strong>ya no trabajan aquí</strong> si vendieron en este mes — se les debe igual.
      </div>

      {filasSinCiudad.length > 0 && (
        <div style={{ padding: "12px 14px", background: "rgba(239, 68, 68, 0.08)", borderLeft: "3px solid #ef4444", borderRadius: 10, fontSize: 11.5, color: "#991b1b", fontWeight: 700, marginBottom: 10, lineHeight: 1.55 }}>
          🚫 Con ventas pero <strong>sin ciudad</strong> en su ficha, no se puede liquidar (no se sabe si aplica el piso de Medellín):{" "}
          {filasSinCiudad.map(f => `${f.v.nombre} (${formatoPesos(f.ventas)})`).join(" · ")}. Corrige la ciudad en systemlap y vuelve a sincronizar.
        </div>
      )}

      {!hayVendedoras && (
        <div style={{ padding: "18px 16px", background: "rgba(239, 68, 68, 0.08)", borderLeft: "3px solid #ef4444", borderRadius: 10, fontSize: 12, color: "#991b1b", fontWeight: 700, marginBottom: 10, lineHeight: 1.55, textAlign: "center" }}>
          🚫 Sin vendedoras sincronizadas — verifica el sync desde systemlap.
        </div>
      )}

      {hayVendedoras && !hayVentasMes && (
        <div style={{ padding: "14px 16px", background: "rgba(245, 158, 11, 0.10)", borderLeft: "3px solid #f59e0b", borderRadius: 10, fontSize: 12, color: "#92400e", fontWeight: 700, marginBottom: 10, lineHeight: 1.55 }}>
          ⚠️ Sin ventas cargadas para {MES_NOMBRES[selMes.mes - 1]} {selMes.año} — carga desde la vista de Carolina.
        </div>
      )}

      {hayVendedoras && (
        <>
          {/* Sección MED */}
          <SeccionCiudad
            titulo="🟢 Team Valkyrias Medellín"
            subtitulo={`Piso ${formatoPesos(PISO_MED)} · sin llegar al piso → $0`}
            color="green"
            filas={filasMed}
            total={totalMed}
          />

          {/* Sección BOG */}
          <SeccionCiudad
            titulo="🟡 Team Valkyrias Bogotá"
            subtitulo="Sin piso · gana desde la primera venta"
            color="amber"
            filas={filasBog}
            total={totalBog}
          />
        </>
      )}

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

      {filas.map(({ v, ventas, calc, rolMes, ascensoEnEsteMes, yaNoTrabaja }) => {
        const pro = calc.proRata || null;
        return (
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
              {/* El badge es el rol de ESE mes, no el cargo de hoy */}
              <span style={{ marginLeft: 6, fontSize: 9, background: rolMes === "admin" ? "#faf5ff" : "#f0fdf4", color: rolMes === "admin" ? "#7c3aed" : "#047857", padding: "1px 6px", borderRadius: 4, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {ascensoEnEsteMes ? "Asesora → Admin" : ROL_CORTO[rolMes]}
              </span>
              {/* Aparece porque vendió ESTE mes, aunque hoy ya no esté en el
                  roster. El badge explica por qué está en la lista. */}
              {yaNoTrabaja && (
                <span style={{ marginLeft: 5, fontSize: 9, background: "#fef2f2", color: "#b91c1c", padding: "1px 6px", borderRadius: 4, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.5, border: "1px solid #fecaca" }}>
                  Ya no trabaja aquí
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginTop: 2 }}>
              Vendió {formatoPesos(ventas)}
              {ascensoEnEsteMes
                ? ` · ${calc.tramo?.label || "Tramo"} · ascendió este mes`
                : ` · ${calc.detalle}`}
            </div>

            {/* Desglose de la pro-rata: el dueño tiene que poder auditar de
                dónde sale la cifra que va a pagar, no confiar a ciegas. */}
            {pro && (
              <div style={{
                marginTop: 5,
                padding: "6px 8px",
                background: "rgba(124, 58, 237, 0.07)",
                borderLeft: "2px solid #a855f7",
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 700,
                color: "#5b21b6",
                lineHeight: 1.5,
              }}>
                <div>
                  ⚖️ {plural(pro.desde.dias, "día", "días")} {ROL_LARGO[pro.desde.rol]} ({pctTexto(pro.desde.pct)}) → {formatoPesos(pro.desde.comision)}
                </div>
                <div>
                  ＋ {plural(pro.hasta.dias, "día", "días")} {ROL_LARGO[pro.hasta.rol]} ({pctTexto(pro.hasta.pct)}) → {formatoPesos(pro.hasta.comision)}
                </div>
              </div>
            )}
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
        );
      })}

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
