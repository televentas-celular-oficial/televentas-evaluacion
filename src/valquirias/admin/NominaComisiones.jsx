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
  TRAMOS_2026,
  pisoAplica,
} from "../lib/helpers.js";
import { useDatos } from "../data/DatosContext.jsx";

const MES_NOMBRES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

const plural = (n, sing, plu) => `${n} ${n === 1 ? sing : plu}`;

// ---------------------------------------------------------------------------
// LA BARRA DE CADA VENDEDORA
// ---------------------------------------------------------------------------
// Es la MISMA barra que la vendedora ve en "Mi mes": escala fija de $0 hasta
// donde arranca el tramo 3, con marcas doradas en los saltos. Fija a propósito
// —no relativa a cada una— porque así las 14 barras se comparan entre sí de un
// vistazo: quién va lejos, quién está a punto de saltar de tramo, y en Medellín
// quién todavía no cruza el piso y por tanto va en $0.
//
// Sin un solo texto: las marcas son rayas. Los números ya están en la fila.
const ESCALA = TRAMOS_2026[2].min;        // $39.309.158 — arranque del tramo 3
const MARCA_T2 = TRAMOS_2026[1].min;      // $19.278.643 — arranque del tramo 2

function BarraTramos({ ventas, ciudad, año, mes, gana }) {
  const pct = Math.max(0, Math.min(100, (ventas / ESCALA) * 100));
  const marcas = [];
  // El piso sólo se dibuja donde y cuando de verdad rige.
  if (pisoAplica(ciudad, año, mes)) marcas.push((PISO_MED / ESCALA) * 100);
  marcas.push((MARCA_T2 / ESCALA) * 100);

  return (
    <div style={{ position: "relative", height: 7, marginTop: 7 }}>
      <div style={{
        position: "absolute", inset: 0, background: "var(--vk-neutro)",
        borderRadius: 4, overflow: "hidden",
      }}>
        <div style={{
          height: "100%", width: `${pct}%`, borderRadius: 4,
          background: gana ? "var(--vk-bien)" : "var(--vk-tenue)",
        }} />
      </div>
      {marcas.map((m) => (
        <span key={m} style={{
          position: "absolute", left: `${m}%`, top: -2, marginLeft: -1,
          width: 2, height: 11, borderRadius: 1, background: "var(--vk-metal-borde)",
        }} />
      ))}
    </div>
  );
}

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
    <div className="v-app v-ancho">
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
                // Mes activo: tinta llena con letra blanca — el mismo botón
                // activo que en el resto de la app. Antes era morado→rosado.
                background: activo ? "var(--vk-titulo)" : "var(--vk-tarjeta)",
                color: activo ? "var(--vk-sobre-tinta)" : "var(--vk-secundario)",
                border: "1.5px solid " + (activo ? "var(--vk-titulo)" : "var(--vk-borde)"),
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
        background: "var(--vk-noche)",
        color: "var(--vk-tarjeta)",
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

      {/* El bloque de "info importante" que iba aquí se quitó el 21-ago-2026:
          el dueño ya sabe qué hace esta pantalla y venía a ver números. Lo que
          decía sigue siendo cierto y sigue estando VISIBLE en la fila misma —
          el badge del rol de ese mes, el desglose de la pro-rata y el sello
          "Ya no trabaja aquí". No se perdió información, se perdió el párrafo. */}

      {filasSinCiudad.length > 0 && (
        <div style={{ padding: "12px 14px", background: "rgba(239, 68, 68, 0.08)", borderLeft: "3px solid var(--adm-alerta-borde)", borderRadius: 10, fontSize: 11.5, color: "var(--adm-alerta)", fontWeight: 700, marginBottom: 10, lineHeight: 1.55 }}>
          🚫 Con ventas pero <strong>sin ciudad</strong> en su ficha, no se puede liquidar (no se sabe si aplica el piso de Medellín):{" "}
          {filasSinCiudad.map(f => `${f.v.nombre} (${formatoPesos(f.ventas)})`).join(" · ")}. Corrige la ciudad en systemlap y vuelve a sincronizar.
        </div>
      )}

      {!hayVendedoras && (
        <div style={{ padding: "18px 16px", background: "rgba(239, 68, 68, 0.08)", borderLeft: "3px solid var(--adm-alerta-borde)", borderRadius: 10, fontSize: 12, color: "var(--adm-alerta)", fontWeight: 700, marginBottom: 10, lineHeight: 1.55, textAlign: "center" }}>
          🚫 Sin vendedoras sincronizadas — verifica el sync desde systemlap.
        </div>
      )}

      {hayVendedoras && !hayVentasMes && (
        <div style={{ padding: "14px 16px", background: "rgba(245, 158, 11, 0.10)", borderLeft: "3px solid var(--est-atencion-borde)", borderRadius: 10, fontSize: 12, color: "var(--vk-noche-apoyo)", fontWeight: 700, marginBottom: 10, lineHeight: 1.55 }}>
          ⚠️ Sin ventas cargadas para {MES_NOMBRES[selMes.mes - 1]} {selMes.año} — carga desde la vista de Carolina.
        </div>
      )}

      {hayVendedoras && (
        <>
          {/* Sección MED */}
          <SeccionCiudad
            titulo="🟢 Medellín"
            subtitulo={null}
            color="green"
            filas={filasMed}
            total={totalMed}
            año={selMes.año}
            mes={selMes.mes}
          />

          {/* Sección BOG */}
          <SeccionCiudad
            titulo="🟡 Bogotá"
            subtitulo={null}
            color="amber"
            filas={filasBog}
            total={totalBog}
            año={selMes.año}
            mes={selMes.mes}
          />
        </>
      )}

    </div>
  );
}

function SeccionCiudad({ titulo, subtitulo, color, filas, total, año, mes }) {
  const bg = color === "green" ? "var(--vk-bien-fondo)" : "var(--vk-noche)";
  const borde = color === "green" ? "var(--vk-bien-texto)" : "var(--est-atencion-borde)";
  const tint = color === "green" ? "var(--vk-bien)" : "var(--vk-noche-apoyo)";

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ background: bg, borderLeft: `4px solid ${borde}`, padding: "10px 12px", borderRadius: 12, marginBottom: 6, border: `1px solid ${borde}20` }}>
        <div style={{ fontSize: 13, fontWeight: 900, color: tint }}>{titulo}</div>
        {subtitulo && (
          <div style={{ fontSize: 10, color: "var(--vk-secundario)", fontWeight: 700, marginTop: 2 }}>{subtitulo}</div>
        )}
      </div>

      {filas.map(({ v, ventas, calc, rolMes, ascensoEnEsteMes, yaNoTrabaja }) => {
        const pro = calc.proRata || null;
        return (
        <div key={v.id} style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          padding: "10px 12px",
          background: "var(--vk-tarjeta)",
          borderRadius: 12,
          marginBottom: 4,
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          borderLeft: "3px solid " + (calc.comision > 0 ? borde : "var(--est-sin-dato)"),
          opacity: calc.comision > 0 ? 1 : 0.7,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, color: "var(--vk-titulo)" }}>
              {v.nombre}
              {/* El badge es el rol de ESE mes, no el cargo de hoy */}
              <span style={{ marginLeft: 6, fontSize: 9, background: rolMes === "admin" ? "var(--vk-noche)" : "var(--vk-bien-fondo)", color: rolMes === "admin" ? "var(--vk-noche-apoyo)" : "var(--vk-bien)", padding: "1px 6px", borderRadius: 4, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {ascensoEnEsteMes ? "Asesora → Admin" : ROL_CORTO[rolMes]}
              </span>
              {/* Aparece porque vendió ESTE mes, aunque hoy ya no esté en el
                  roster. El badge explica por qué está en la lista. */}
              {yaNoTrabaja && (
                <span style={{ marginLeft: 5, fontSize: 9, background: "var(--adm-alerta-fondo)", color: "var(--adm-alerta)", padding: "1px 6px", borderRadius: 4, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.5, border: "1px solid var(--adm-alerta-borde)" }}>
                  Ya no trabaja aquí
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--vk-secundario)", fontWeight: 700, marginTop: 2 }}>
              Vendió {formatoPesos(ventas)}
              {/* El TRAMO se nombra siempre, no sólo cuando hubo ascenso: es lo
                  que explica por qué le tocó ese porcentaje y no otro. Cuando
                  no hay tramo (MED que no pasó el piso) manda `detalle`, que
                  es el que dice "no superó el piso — comisión $0". */}
              {ascensoEnEsteMes
                ? ` · ${calc.tramo?.label || "Tramo"} · ascendió este mes`
                : calc.tramo
                  ? ` · ${calc.tramo.label} · ${pctTexto(calc.pct)}`
                  : ` · ${calc.detalle}`}
            </div>

            <BarraTramos
              ventas={ventas}
              ciudad={v.ciudad}
              año={año}
              mes={mes}
              gana={calc.comision > 0}
            />

            {/* Desglose de la pro-rata: el dueño tiene que poder auditar de
                dónde sale la cifra que va a pagar, no confiar a ciegas. */}
            {pro && (
              <div style={{
                marginTop: 5,
                padding: "6px 8px",
                background: "var(--vk-noche)",
                borderLeft: "2px solid var(--vk-metal)",
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 700,
                color: "var(--vk-noche-apoyo)",
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
            color: calc.comision > 0 ? tint : "var(--vk-tenue)",
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
