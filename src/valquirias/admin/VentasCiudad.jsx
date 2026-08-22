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
    color: "var(--vk-bien-texto)",
    borde: "var(--vk-bien-texto)",
    tinte: "var(--vk-bien)",
    bg: "var(--vk-bien-fondo)",
  },
  {
    id: "BOG",
    titulo: "🟡 Team Valkyrias Bogotá",
    color: "var(--est-atencion-borde)",
    borde: "var(--est-atencion-borde)",
    tinte: "var(--vk-metal-borde)",
    bg: "var(--vk-noche)",
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
  if (pct >= 100) return "var(--vk-bien-texto)";
  if (pct >= 70) return "var(--est-atencion)";
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
                background: activo ? "var(--vk-titulo)" : "var(--vk-tarjeta)",
                color: activo ? "var(--vk-sobre-tinta)" : "var(--vk-secundario)",
                border: "1.5px solid " + (activo ? "transparent" : "var(--vk-borde)"),
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

      {/* HERO total del mes — crema con filo de oro, la tarjeta destacada del
          sistema. Antes era un degradado rosado→morado a pantalla completa. */}
      <div style={{
        background: "var(--vk-noche)",
        border: "1px solid var(--vk-metal)",
        color: "var(--vk-noche-texto)",
        padding: "22px 20px",
        borderRadius: 20,
        marginBottom: 10,
        boxShadow: "0 2px 10px rgba(var(--vk-metal-rgb), 0.25)",
        position: "relative",
        overflow: "hidden",
        textAlign: "center",
      }}>
        {/* Iba aquí un velo blanco radial y una sombra de texto: los dos
            existían porque la tarjeta era un degradado oscuro. Sobre crema
            sobran — la sombra ensuciaba la cifra. */}
        <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 2, marginBottom: 4, position: "relative", color: "var(--vk-noche-apoyo)" }}>
          Vendido en {MES_NOMBRES[selMes.mes - 1]} {selMes.año}
        </div>
        <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1, position: "relative" }}>
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
          borderLeft: "4px solid var(--adm-alerta-borde)",
          borderRadius: 12,
          marginBottom: 10,
          lineHeight: 1.55,
        }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: "var(--adm-alerta)" }}>
            ⚠️ Este mes aún no tiene metas cargadas
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--adm-alerta)", marginTop: 4 }}>
            Sin meta de {MES_NOMBRES[selMes.mes - 1]} no se puede calcular el % de cumplimiento
            (todo se ve en 0%) ni la nota de ventas de las vendedoras.
            Cárgalas en <strong>Admin → 🎯 Metas del mes</strong>.
          </div>
        </div>
      )}

      {/* Mes cerrado */}
      {cerrado && (
        <div style={{ padding: "10px 14px", background: "var(--vk-noche)", borderRadius: 12, marginBottom: 10, fontSize: 12, fontWeight: 900, color: "var(--vk-noche-apoyo)" }}>
          🔒 Mes cerrado · datos finales
        </div>
      )}

      {/* Nota solo lectura */}
      <div style={{ padding: "10px 12px", background: "rgba(59, 130, 246, 0.07)", borderLeft: "3px solid var(--vk-secundario)", borderRadius: 10, fontSize: 11, color: "var(--vk-secundario)", fontWeight: 700, marginBottom: 10, lineHeight: 1.55 }}>
        📡 <strong>Vista de solo lectura.</strong> Las ventas se sincronizan desde systemlap cada 5 min.
        Las metas se cargan en <strong>Admin → 🎯 Metas del mes</strong>.
      </div>

      {!hayVendedoras && (
        <div style={{ padding: "18px 16px", background: "rgba(148, 163, 184, 0.10)", border: "1.5px dashed var(--est-sin-dato)", borderRadius: 12, fontSize: 12, fontWeight: 700, color: "var(--vk-secundario)", textAlign: "center", lineHeight: 1.55 }}>
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

  // ⚠️ AQUÍ HABÍA UN NÚMERO FALSO (corregido 21-ago-2026).
  // La cabecera hacía `pctDe(vendido, meta)`: dividía la suma de TODA la ciudad
  // entre la meta de UNA vendedora. Con siete personas vendiendo, eso daba
  // cifras de 300% y un "🎉 Meta cumplida" que no significaba nada.
  //
  // La meta es POR VENDEDORA (Luis, 21-ago-2026). El % de cumplimiento sólo
  // tiene sentido persona por persona — y así ya se calcula en cada fila.
  // A nivel de ciudad no se inventa una meta colectiva: se dicen los hechos
  // (cuánto se vendió) y se cuenta cuántas llegaron.
  const cumplieron = meta > 0 ? lista.filter(v => v.real >= meta).length : 0;

  return (
    <div style={{ marginBottom: 14 }}>
      {/* Cabecera ciudad: meta + vendido + % + barra */}
      <div style={{ background: ciudad.bg, borderLeft: `4px solid ${ciudad.borde}`, border: `1px solid ${ciudad.borde}20`, padding: "12px 14px", borderRadius: 12, marginBottom: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: ciudad.tinte }}>{ciudad.titulo}</div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 900, color: "var(--vk-secundario)", textTransform: "uppercase", letterSpacing: 1 }}>Meta c/u</div>
            <div style={{ fontSize: 12, fontWeight: 900, color: meta > 0 ? "var(--vk-titulo)" : "var(--adm-alerta)" }}>
              {meta > 0 ? formatoPesos(meta) : "sin cargar"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 900, color: "var(--vk-secundario)", textTransform: "uppercase", letterSpacing: 1 }}>Vendido</span>
          <span style={{ fontSize: 17, fontWeight: 900, color: "var(--vk-titulo)", letterSpacing: -0.5 }}>
            {formatoPesos(vendido)}
          </span>
        </div>

        {/* Cuántas llegaron. No es una meta de ciudad inventada: es el conteo de
            un hecho que ya existe por persona. */}
        <div style={{ fontSize: 11.5, fontWeight: 800, marginTop: 6, color: meta <= 0 ? "var(--adm-alerta)" : ciudad.tinte }}>
          {meta <= 0
            ? `⚠️ Sin meta cargada para ${ciudad.id}`
            : `${cumplieron} de ${lista.length} llegaron a la meta`}
        </div>
      </div>

      {/* Vendedoras de la ciudad, ordenadas por ventas */}
      <div style={{ fontSize: 9.5, fontWeight: 900, color: "var(--vk-tenue)", textTransform: "uppercase", letterSpacing: 1, padding: "2px 12px 5px", display: "flex", justifyContent: "space-between" }}>
        <span>Vendedora</span>
        <span>Vendido · % de su meta</span>
      </div>

      {lista.map((v, i) => (
        <div key={v.id} style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          background: "var(--vk-tarjeta)",
          borderRadius: 12,
          marginBottom: 4,
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          borderLeft: "3px solid " + (v.real > 0 ? ciudad.borde : "var(--est-sin-dato)"),
          opacity: v.real > 0 ? 1 : 0.65,
        }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: i === 0 && v.real > 0 ? "var(--est-atencion-borde)" : "var(--vk-tenue)", width: 20, textAlign: "center" }}>
            {i === 0 && v.real > 0 ? "🥇" : i + 1}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "var(--vk-titulo)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {v.nombre}
              {v.rolTienda === "admin" && (
                <span style={{ marginLeft: 6, fontSize: 9, background: "var(--vk-noche)", color: "var(--vk-noche-apoyo)", padding: "1px 6px", borderRadius: 4, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.5 }}>Admin</span>
              )}
              {!v.activa && (
                <span style={{ marginLeft: 6, fontSize: 9, background: "var(--vk-fondo-hueco)", color: "var(--vk-secundario)", padding: "1px 6px", borderRadius: 4, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.5 }}>Inactiva</span>
              )}
            </div>
            {/* Mini barra individual */}
            <div style={{ background: "var(--vk-borde)", borderRadius: 4, height: 5, overflow: "hidden", marginTop: 5 }}>
              <div style={{ height: "100%", width: Math.min(v.pct, 100) + "%", borderRadius: 4, background: colorPct(v.pct, ciudad.color) }} />
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0, minWidth: 92 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: v.pct >= 100 ? "var(--vk-bien-texto)" : "var(--vk-titulo)" }}>
              {formatoPesos(v.real)}
            </div>
            <div style={{ fontSize: 10, fontWeight: 800, color: meta > 0 ? colorPct(v.pct, "var(--vk-tenue)") : "var(--est-sin-dato)", marginTop: 1 }}>
              {meta > 0 ? `${v.pct}%` : "sin meta"}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
