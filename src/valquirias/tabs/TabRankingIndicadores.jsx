// Tab RANKING POR INDICADOR — "veo el ranking por cada indicador" (pedido del dueño)
// Réplica en Valquirias TLV de los tabs de PantallaRanking de la app clásica:
//   🏅 General · un tab por cada indicador del mes · 💰 Ventas
//
// Todo el cálculo lo hace el motor (derivarRankingPorIndicador → calcRanking → calculos.js).
// Este componente SOLO elige indicador/ciudad/mes y pinta. No calcula notas.
//
// DOS PUNTOS DE MONTAJE:
//   1. Admin  → AdminHome, tile "🏅 Ranking por indicador"
//              <TabRankingIndicadores datos={datos} ciudad={null} miId={null} esAdmin onVolver={...} />
//   2. Vendedora → sub-tab dentro de TabRanking (ver reporte / snippet)
//              <TabRankingIndicadores ciudad={ciudadEfectiva} miId={vendedora.id}
//                                     mostrarFiltroCiudad={false} mes={...} onMes={...} />
//
// Por eso TODAS las props son opcionales: sin `datos` lee el store con useDatos(),
// y sin `mes`/`onMes` maneja el mes con estado propio. Así engancharlo desde el
// lado vendedora es una línea, no una refactorización.
//
// OJO con la prop `datos`: es el store CRUDO de Firestore
// ({ registros, metas, vendedoras, snapshots, config }), es decir el `datosFS`
// de useDatos() — NO el objeto derivado de derivarDatosVendedora().

import { useState, useMemo } from "react";
import { useDatos } from "../data/DatosContext.jsx";
import { derivarRankingPorIndicador, tabsRankingIndicador } from "../data/derivar.js";
import { hoyColombia, primerNombre } from "../lib/helpers.js";
import { fmtN, colorN } from "../../lib/calculos.js";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const PRIMER_MES_CON_DATOS_2026 = 4; // abril 2026 — antes no hay registros

export default function TabRankingIndicadores({
  datos: datosProp,          // store crudo de Firestore. Si no viene → useDatos()
  ciudad = null,             // ciudad a mostrar. null/"TODAS" = las dos
  miId = null,               // id de la vendedora propia (resalta su fila). null en vista admin
  esAdmin = false,           // true → puede alternar Todas / MED / BOG
  mostrarFiltroCiudad,       // default = esAdmin. false → el padre ya tiene su switcher
  mes: mesProp,              // opcional { año, mes } — mes controlado por el padre
  onMes,                     // opcional — sólo se usa el mes del padre si AMBOS vienen
  onVolver,                  // opcional: si viene, se pinta el header con ‹ Volver
}) {
  const store = useDatos();
  const datos = datosProp || store;

  const hoy = useMemo(() => hoyColombia(), []);
  const [indSel, setIndSel] = useState("general");
  const [filtroCiudad, setFiltroCiudad] = useState(ciudad || "TODAS");
  const [mesInterno, setMesInterno] = useState({ año: hoy.año, mes: hoy.mes });

  // Mes controlado por el padre sólo si manda valor Y setter: con uno solo los
  // chips quedarían muertos (se ven pero no cambian nada).
  const mesControlado = !!(mesProp?.mes && onMes);
  const mesSel = mesControlado ? mesProp : mesInterno;
  const setMesSel = mesControlado ? onMes : setMesInterno;

  // El switcher de ciudad se pinta solo si este componente manda sobre la ciudad.
  // Montado dentro de TabRanking el padre ya tiene el suyo → duplicarlo confunde,
  // y encima quedaría desincronizado del de arriba.
  const conSwitcher = mostrarFiltroCiudad ?? esAdmin;
  const ciudadEfectiva = conSwitcher ? filtroCiudad : (ciudad || "TODAS");
  const ciudadParaMotor = ciudadEfectiva === "TODAS" ? null : ciudadEfectiva;

  // Los tabs cambian con el mes (V1 abril = 8 tabs · V2 mayo+ = 7 tabs)
  const tabs = useMemo(
    () => tabsRankingIndicador(mesSel.año, mesSel.mes),
    [mesSel.año, mesSel.mes]
  );

  // Si al cambiar de mes el indicador elegido ya no existe (ej: "actitud" en abril),
  // caemos a General sin romper ni parpadear
  const tabActivo = tabs.some(t => t.id === indSel) ? indSel : "general";
  const defActivo = tabs.find(t => t.id === tabActivo) || tabs[0];

  // 👑 Estrella y borde de color son SÓLO de los tabs de indicador (App.jsx:867/869).
  // En General y en Ventas no hay "estrella del indicador" que valga.
  const esTabIndicador = tabActivo !== "general" && tabActivo !== "ventas";

  const lista = useMemo(
    () => derivarRankingPorIndicador(datos, tabActivo, ciudadParaMotor, mesSel.año, mesSel.mes, miId ?? null),
    [datos, tabActivo, ciudadParaMotor, mesSel.año, mesSel.mes, miId]
  );

  const yo = miId != null ? lista.find(r => r.esYo) : null;
  const mesCerrado = lista.some(r => r.cerrado);

  // Chips de meses: desde abril 2026 (primer mes con datos) hasta el mes en curso
  const mesInicio = mesSel.año === 2026 ? PRIMER_MES_CON_DATOS_2026 : 1;
  const mesTope = mesSel.año < hoy.año ? 12 : hoy.mes;
  const mesesVisibles = [];
  for (let m = mesInicio; m <= mesTope; m++) mesesVisibles.push(m);
  // Nunca dejar la fila de chips vacía (pasaría en ene–mar de un año sin datos):
  // sin chips el mes elegido no se podría ni ver ni cambiar.
  if (!mesesVisibles.length) mesesVisibles.push(mesSel.mes);

  return (
    <>
      {onVolver && (
        <div className="v-header-detalle">
          <button className="v-back-btn" onClick={onVolver}>‹ Volver</button>
          <div className="v-header-title">🏅 Ranking por indicador</div>
          <div style={{ width: 60 }} />
        </div>
      )}

      {/* Filtro de ciudad — sólo si este componente manda sobre la ciudad */}
      {conSwitcher && (
        <div className="v-rank-ciudad-tabs">
          <button
            className={"v-rank-ciudad-btn" + (filtroCiudad === "TODAS" ? " active" : "")}
            onClick={() => setFiltroCiudad("TODAS")}
          >Todas</button>
          <button
            className={"v-rank-ciudad-btn" + (filtroCiudad === "MED" ? " active" : "")}
            onClick={() => setFiltroCiudad("MED")}
          >🟢 MED</button>
          <button
            className={"v-rank-ciudad-btn bog" + (filtroCiudad === "BOG" ? " active" : "")}
            onClick={() => setFiltroCiudad("BOG")}
          >🟡 BOG</button>
        </div>
      )}

      {/* Chips de mes */}
      <div style={chipsRow}>
        {mesesVisibles.map(m => (
          <button
            key={m}
            onClick={() => setMesSel({ año: mesSel.año, mes: m })}
            style={chipStyle(mesSel.mes === m)}
          >{MESES[m - 1]}</button>
        ))}
      </div>

      {/* Tabs de indicador: 🏅 General + indicadores del mes + 💰 Ventas.
          Grid de 4 columnas porque en V1 son 8 tabs y no caben en fila. */}
      <div className="v-rank-tabs" style={tabsGrid}>
        {tabs.map(t => (
          <button
            key={t.id}
            className={"v-rank-tab-btn" + (tabActivo === t.id ? " active" : "")}
            onClick={() => setIndSel(t.id)}
          >{t.emoji} {t.label}</button>
        ))}
      </div>

      <div className="v-card">
        <div className="v-card-title">
          <span>{defActivo?.emoji} Ranking · {defActivo?.label}</span>
          <span className="v-card-title-cierra">
            {mesCerrado ? "🔒 " : ""}{MES_LARGO[mesSel.mes - 1]} · {lista.length} {lista.length === 1 ? "vendedora" : "vendedoras"}
          </span>
        </div>

        {/* Tu posición, arriba del todo, para no tener que buscarse en la lista */}
        {yo && (
          <div className="v-rank-full tu" style={{ marginBottom: 8 }}>
            <span>
              <span className="n">#{yo.n}</span>
              TÚ ({primerNombre(yo.nombre)})
              {esTabIndicador && yo.esEstrella && <span className="medalla">👑</span>}
              <span className="gap">de {lista.length}</span>
            </span>
            <span className="val">{fmtN(yo.nota)}</span>
          </div>
        )}

        {/* Vendedora que mira un indicador donde todavía no tiene nota: se lo
            decimos, en vez de dejarla buscándose en una lista donde no está. */}
        {miId != null && !yo && lista.length > 0 && (
          <div style={sinNota}>
            Todavía no tienes nota en {defActivo?.label?.toLowerCase()} este mes
          </div>
        )}

        {lista.length === 0 ? (
          <div className="v-loading">Sin datos aún para este período</div>
        ) : (
          lista.map(r => (
            <div
              key={r.id}
              className={"v-rank-big " + (r.esYo ? "tu" : "")}
              style={esTabIndicador && r.color ? { borderLeft: `3px solid ${r.color}` } : undefined}
            >
              <div className="medal">{medalla(r.n)}</div>
              <div className="info">
                <div className="nom">
                  {r.esYo ? `TÚ (${primerNombre(r.nombre)})` : r.nombre}
                  {esTabIndicador && r.esEstrella && <span style={estrella}>👑 Estrella</span>}
                </div>
                <div className="rol">{r.detalle}</div>
              </div>
              <div className="valores">
                <div className="v" style={{ color: colorN(r.nota ?? null) }}>{fmtN(r.nota)}</div>
                {ciudadEfectiva === "TODAS" && (
                  <div className="g">{r.ciudad === "BOG" ? "🟡 BOG" : "🟢 MED"}</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Nota al pie: explica el orden real de cada tab (no es obvio en Ventas) */}
      <div style={pie}>
        {tabActivo === "general"
          ? "Ordenado por nota final del mes (comportamiento + ventas)."
          : tabActivo === "ventas"
            ? "Ordenado por % de cumplimiento de meta. La nota está topada en 5.00."
            : `Ordenado por la nota mensual de ${defActivo?.label?.toLowerCase()}. 👑 = la mejor del mes.`}
      </div>
    </>
  );
}

function medalla(n) {
  return n === 1 ? "🥇" : n === 2 ? "🥈" : n === 3 ? "🥉" : String(n);
}

// Mismos estilos de chips que TabRanking (variante morada) — no inventar look nuevo
const chipsRow = { display: "flex", gap: 4, overflowX: "auto", padding: "0 0 8px", marginBottom: 6 };
function chipStyle(activo) {
  return {
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 800,
    background: activo ? "var(--vk-noche)" : "var(--vk-tarjeta)",
    color: activo ? "var(--vk-tarjeta)" : "var(--vk-secundario)",
    border: "1.5px solid " + (activo ? "transparent" : "var(--vk-borde)"),
    borderRadius: 8,
    cursor: "pointer",
    flexShrink: 0,
  };
}

// .v-rank-tabs es flex; con 7-8 tabs se aprieta → mismo contenedor, layout en grid
const tabsGrid = { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 };

// Aviso honesto cuando la vendedora no aparece en el ranking de ese indicador
const sinNota = {
  background: "var(--vk-fondo)",
  border: "1px dashed var(--est-sin-dato)",
  borderRadius: 8,
  padding: "7px 9px",
  marginBottom: 8,
  fontSize: 11,
  fontWeight: 700,
  color: "var(--vk-secundario)",
};

const estrella = {
  fontSize: 10,
  fontWeight: 900,
  color: "var(--est-grave)",
  background: "var(--vk-noche)",
  borderRadius: 6,
  padding: "1px 5px",
  marginLeft: 6,
  whiteSpace: "nowrap",
};

const pie = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--vk-tenue)",
  textAlign: "center",
  padding: "2px 10px 8px",
  lineHeight: 1.5,
};
