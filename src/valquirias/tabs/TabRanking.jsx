// Tab RANKING — cada vendedora ve SOLO su ciudad. Admin puede alternar MED/BOG/Todas.
// 4 sub-tabs: Mes / Trimestre / Semana efectivo / Por indicador
//
// COMPONENTE AUTOSUFICIENTE: lee useDatos() y deriva cada ranking él mismo
// (igual que TabMiAno y DetalleTrimestre). ValquiriasApp ya NO le inyecta listas.
//
// El sub-tab "Indicador" monta TabRankingIndicadores (el mismo componente que usa
// el panel admin). Hasta ahora ese ranking SOLO existía en admin, así que las
// vendedoras nunca veían el ranking por indicador que sí tenían en la app clásica
// (App.jsx:818-826). Aquí se cierra ese hueco: mismo motor, misma 👑 Estrella.
//
// REGLA DE ORO: nada se inventa. Cada fila trae su propio rol, su propia nota y
// sus propias ventas. Si el período no tiene datos → empty state honesto.
// Todos los chips (mes / trimestre / semana) REFILTRAN de verdad.

import { useMemo, useState } from "react";
import { useDatos } from "../data/DatosContext.jsx";
import {
  derivarRankingMes,
  derivarRankingPorIndicador,
  derivarTrimestreDeVendedora,
  derivarSemanaDeVendedora,
} from "../data/derivar.js";
import { formatoK, primerNombre, hoyColombia } from "../lib/helpers.js";
import TabRankingIndicadores from "./TabRankingIndicadores.jsx";
import PodioTop3 from "../common/PodioTop3.jsx";

// Sub-tabs en una sola fuente: con 4 botones el ancho de celular manda, así que
// se pintan en grid de 4 columnas iguales (emoji arriba, texto abajo) en vez de
// la fila flex de 3 que había. Ver notas en `tabsGrid4` más abajo.
const SUBTABS = [
  { id: "mes", emoji: "📅", label: "Mes" },
  { id: "trim", emoji: "💎", label: "Trimestre" },
  { id: "sem", emoji: "⚡", label: "Sem ef." },
  { id: "ind", emoji: "🏅", label: "Indicador" },
];

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MESES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// El programa de evaluación arrancó en abril de 2026: antes de eso no hay nada
// que rankear, así que los chips no ofrecen meses/trimestres previos.
const AÑO_INICIO = 2026;
const MES_INICIO = 4;

const dosDig = (n) => String(n).padStart(2, "0");
const isoDe = (d) => `${d.getFullYear()}-${dosDig(d.getMonth() + 1)}-${dosDig(d.getDate())}`;

// Lunes de la semana que contiene `iso` (mismo criterio que fechasSemanaDe en derivar.js)
function lunesDe(iso) {
  const base = new Date(`${iso}T12:00:00`);
  const dow = base.getDay();                    // 0 = domingo
  const offset = dow === 0 ? -6 : 1 - dow;
  const lun = new Date(base);
  lun.setDate(base.getDate() + offset);
  return lun;
}

// Últimas N semanas (lun–dom) desde HOY hora Colombia. Cada una trae el ISO de
// su lunes para poder re-derivar el ranking de esa semana.
function calcularUltimasSemanas(n) {
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const lunActual = lunesDe(hoyColombia().iso);

  const out = [];
  for (let i = 0; i < n; i++) {
    const lun = new Date(lunActual);
    lun.setDate(lunActual.getDate() - i * 7);
    const dom = new Date(lun);
    dom.setDate(lun.getDate() + 6);
    out.push({
      i,
      label: i === 0 ? "Actual" : i === 1 ? "Cerrada" : `-${i} sem`,
      rango: `${lun.getDate()} ${meses[lun.getMonth()]} – ${dom.getDate()} ${meses[dom.getMonth()]}`,
      iso: isoDe(lun),
    });
  }
  return out;
}

const rolTexto = (v) => (v?.rolTienda === "admin" ? "Administradora" : "Asesora");

export default function TabRanking({
  vendedora,
  ciudad,          // ciudad de la vendedora (guard)
  rol,             // si admin, puede alternar
  filtroCiudadAdmin,
  setFiltroCiudadAdmin,
  mesSeleccionado, // { año, mes } — vive en ValquiriasApp para que sobreviva al cambio de tab
  setMesSeleccionado,
  onVerBoletin,    // ({ año, mes, vendedora }) — abre el boletín de esa persona
}) {
  const datos = useDatos();
  const hoy = hoyColombia();

  const [subTab, setSubTab] = useState("mes");
  const esAdmin = rol === "admin";
  const ciudadEfectiva = esAdmin ? filtroCiudadAdmin : ciudad;
  // rosterCiudad(datos, null) = todas → "TODAS" se traduce a null, nunca a "TODAS"
  const ciudadFiltro = ciudadEfectiva === "TODAS" ? null : ciudadEfectiva;

  // ---- Período seleccionado (de verdad, no decorativo) --------------------
  const añoVista = mesSeleccionado?.año || hoy.año;
  const mesVista = mesSeleccionado?.mes || hoy.mes;

  const primerMesDelAño = añoVista === AÑO_INICIO ? MES_INICIO : 1;
  const ultimoMesDelAño = añoVista === hoy.año ? hoy.mes : 12;

  const mesesDisponibles = useMemo(() => {
    const out = [];
    for (let m = primerMesDelAño; m <= ultimoMesDelAño; m++) out.push(m);
    return out;
  }, [primerMesDelAño, ultimoMesDelAño]);

  const qMin = Math.ceil(primerMesDelAño / 3);
  const qMax = Math.ceil(ultimoMesDelAño / 3);
  const qHoy = Math.ceil(hoy.mes / 3);
  const [qSel, setQSel] = useState(() => Math.min(Math.max(qHoy, qMin), qMax));
  const qVista = Math.min(Math.max(qSel, qMin), qMax);

  const semanas = useMemo(() => calcularUltimasSemanas(5), []);
  const [semSel, setSemSel] = useState(0);
  const semanaVista = semanas.find(s => s.i === semSel) || semanas[0];

  // Vendedora "de vista": cuando el admin mira otra ciudad, los rankings de
  // trimestre/semana se derivan sobre esa ciudad (nunca sobre la suya).
  const vendedoraVista = useMemo(
    () => (vendedora ? { ...vendedora, ciudad: ciudadFiltro } : null),
    [vendedora, ciudadFiltro]
  );

  const rolPorId = useMemo(() => {
    const m = {};
    (datos?.vendedoras || []).forEach(v => { m[v.id] = v; });
    return m;
  }, [datos?.vendedoras]);

  const etiquetaRol = (id) => {
    const v = rolPorId[id];
    const base = rolTexto(v);
    return ciudadFiltro === null && v?.ciudad ? `${base} · ${v.ciudad}` : base;
  };

  // ---- MES ---------------------------------------------------------------
  const filasMes = useMemo(() => {
    if (!vendedora) return [];
    const rk = derivarRankingMes(datos, ciudadFiltro, añoVista, mesVista, vendedora.id);
    // Si NADIE tiene ventas cargadas ese mes, no hay ranking que mostrar.
    if (!rk.some(r => (r.valor || 0) > 0)) return [];

    const general = derivarRankingPorIndicador(datos, "general", ciudadFiltro, añoVista, mesVista, vendedora.id);
    const porId = {};
    general.forEach(g => { porId[g.id] = g; });

    return rk.map(r => {
      const info = porId[r.id];
      const nota = typeof info?.nota === "number" ? info.nota : null;
      const pct = typeof info?.pct === "number" && info?.meta > 0 ? info.pct : null;
      return {
        key: r.id,
        id: r.id,          // lo usa abrirBoletin() al tocar la fila
        esYo: r.esYo,
        nombre: r.nombre,
        valor: r.valor,
        // Rol REAL de cada fila + su propio % de meta (nunca el de quien mira)
        rolLabel: etiquetaRol(r.id) + (pct !== null ? ` · ${pct}% meta` : ""),
        // Nota REAL de esa fila; si el mes aún no tiene nota, se muestra la
        // diferencia con quien va arriba (dato real también).
        subValor: nota !== null ? `Nota ${nota.toFixed(2)}` : (r.gap || ""),
      };
    });
  }, [datos, vendedora, ciudadFiltro, añoVista, mesVista, rolPorId]);

  // ---- TRIMESTRE ---------------------------------------------------------
  const filasTrim = useMemo(() => {
    if (!vendedoraVista) return [];
    const t = derivarTrimestreDeVendedora(datos, vendedoraVista, añoVista, qVista);
    return (t.rankingCiudad || []).map(v => ({
      key: v.id,
      esYo: v.id === vendedora.id,
      nombre: v.nombre,
      valor: v.notaTrim,
      rolLabel: etiquetaRol(v.id) + (v.completo ? "" : ` · Q${qVista} en curso`),
      subValor: v.realTrim > 0 ? `${formatoK(v.realTrim)} vendido` : "",
    }));
  }, [datos, vendedoraVista, vendedora, añoVista, qVista, rolPorId]);

  // ---- SEMANA DE EFECTIVO -------------------------------------------------
  const filasSem = useMemo(() => {
    if (!vendedoraVista || !semanaVista) return [];
    const s = derivarSemanaDeVendedora(datos, vendedoraVista, semanaVista.iso);
    return (s.rankingCiudad || []).map(v => ({
      key: v.id,
      esYo: v.id === vendedora.id,
      nombre: v.nombre,
      valor: v.valor,
      rolLabel: v.gano50k ? "✅ ganó $50k" : "sin premio esta semana",
      detalle: v.extra ? "+ $50k EXTRA (top 1)" : "",
      subValor: v.gano50k ? "+$50k" : (v.gap || ""),
    }));
  }, [datos, vendedoraVista, vendedora, semanaVista]);

  // El sub-tab "Indicador" no usa las filas de este componente: pinta
  // TabRankingIndicadores completo (tabs por indicador + su propia lista).
  const esInd = subTab === "ind";
  const data = esInd ? [] : subTab === "mes" ? filasMes : subTab === "trim" ? filasTrim : filasSem;

  const mensajeVacio =
    subTab === "mes"
      ? `Todavía no hay ventas cargadas de ${MESES_LARGO[mesVista - 1]} ${añoVista}.`
      : subTab === "trim"
        ? `Todavía no hay notas del Q${qVista} ${añoVista}. Aparecen cuando los meses del trimestre tengan registros.`
        : "El efectivo de esta semana todavía no queda registrado en la app, por eso no se puede armar el ranking.";

  // El admin publica/despublica el ranking desde su panel (config.rankingVisible).
  // Sin publicar, la vendedora no ve puestos — pero el admin sí, para poder revisarlo antes.
  // Default true: si la bandera aún no existe en Firestore, el ranking se ve.
  const rankingPublicado = datos.config?.rankingVisible !== false;

  // Tocar una fila / columna del podio abre el boletín de esa persona (como la clásica).
  // Solo aplica al ranking mensual: trimestre y semana no tienen boletín por mes.
  function abrirBoletin(id) {
    if (!onVerBoletin || subTab !== "mes") return;
    const v = (datos.vendedoras || []).find(x => x.id === id);
    if (!v) return;
    onVerBoletin({ año: añoVista, mes: mesVista, vendedora: v });
  }

  if (!rankingPublicado && !esAdmin) {
    return (
      <div className="v-card" style={{ textAlign: "center", padding: "40px 20px" }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 900, color: "#1e1b4b", marginBottom: 8 }}>
          Ranking aún sin publicar
        </div>
        <div style={{ fontSize: 13, color: "#64748b", fontWeight: 700, lineHeight: 1.5 }}>
          El administrador lo publica cuando estén todos los datos del período.
          Mientras tanto sigue sumando 💪
        </div>
      </div>
    );
  }

  return (
    <>
      {!rankingPublicado && esAdmin && (
        <div style={{ padding: "10px 12px", background: "rgba(245, 158, 11, 0.12)", borderLeft: "3px solid #f59e0b", borderRadius: 10, fontSize: 12, color: "#92400e", fontWeight: 800, marginBottom: 10, lineHeight: 1.5 }}>
          👁️ Sin publicar — solo tú ves esto. Las vendedoras ven "Ranking aún sin publicar".
        </div>
      )}

      {esAdmin && (
        <div className="v-rank-ciudad-tabs" style={{ marginBottom: 10 }}>
          <button
            className={"v-rank-ciudad-btn" + (filtroCiudadAdmin === "TODAS" ? " active" : "")}
            onClick={() => setFiltroCiudadAdmin("TODAS")}
          >Todas</button>
          <button
            className={"v-rank-ciudad-btn" + (filtroCiudadAdmin === "MED" ? " active" : "")}
            onClick={() => setFiltroCiudadAdmin("MED")}
          >🟢 MED</button>
          <button
            className={"v-rank-ciudad-btn bog" + (filtroCiudadAdmin === "BOG" ? " active" : "")}
            onClick={() => setFiltroCiudadAdmin("BOG")}
          >🟡 BOG</button>
        </div>
      )}

      {/* Header de equipo solo si admin cambió a otra ciudad distinta de la vendedora — evita duplicar el saludo */}
      {esAdmin && ciudadEfectiva !== ciudad && (
        <div className={"v-team-header " + (ciudadEfectiva === "BOG" ? "bog" : "")}>
          <div className="v-team-h-title">
            {ciudadEfectiva === "BOG"
              ? "🟡 Viendo como: Team Valquirias Bogotá"
              : ciudadEfectiva === "MED"
                ? "🟢 Viendo como: Team Valquirias Medellín"
                : "🏆 Viendo Todas · MED + BOG"}
          </div>
        </div>
      )}

      <div className="v-rank-tabs" style={tabsGrid4}>
        {SUBTABS.map(t => (
          <button
            key={t.id}
            className={"v-rank-tab-btn" + (subTab === t.id ? " active" : "")}
            style={tabBtn4}
            onClick={() => setSubTab(t.id)}
          >
            <span style={tabEmoji4}>{t.emoji}</span>
            <span style={tabLabel4}>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Ranking por indicador: mismo componente del panel admin, pero en modo
          vendedora → sin switcher de ciudad propio (el de arriba manda) y con
          miId para que se resalte a sí misma y vea su posición destacada. */}
      {esInd && (
        <TabRankingIndicadores
          ciudad={ciudadEfectiva}
          miId={vendedora?.id ?? null}
          mostrarFiltroCiudad={false}
          mes={{ año: añoVista, mes: mesVista }}
          onMes={setMesSeleccionado}
        />
      )}

      {/* Chips por sub-tab: meses / trimestres / semanas — todos refiltran de verdad */}
      {subTab === "mes" && (
        <>
          <div style={chipsRow}>
            {mesesDisponibles.map(m => (
              <button
                key={m}
                onClick={() => setMesSeleccionado?.({ año: añoVista, mes: m })}
                style={chipStyle(mesVista === m, "purple")}
              >{MESES[m - 1]}</button>
            ))}
          </div>
          {/* Podio oro/plata/bronce del mes — solo se pinta si hay 3+ con nota */}
          <PodioTop3
            datos={datos}
            ciudad={ciudadFiltro}
            año={añoVista}
            mes={mesVista}
            miId={vendedora?.id ?? null}
            onAbrir={v => abrirBoletin(v.id)}
          />
        </>
      )}
      {subTab === "trim" && (
        <div style={chipsRow}>
          {[1, 2, 3, 4].filter(n => n >= qMin && n <= qMax).map(n => (
            <button
              key={n}
              onClick={() => setQSel(n)}
              style={chipStyle(qVista === n, "amber")}
            >{["Q1 · ene-mar", "Q2 · abr-jun", "Q3 · jul-sep", "Q4 · oct-dic"][n - 1]}</button>
          ))}
        </div>
      )}
      {subTab === "sem" && (
        <div style={chipsRow}>
          {semanas.map(s => {
            const activo = semSel === s.i;
            return (
              <button
                key={s.i}
                onClick={() => setSemSel(s.i)}
                style={{
                  padding: "6px 10px",
                  fontSize: 11,
                  fontWeight: 800,
                  background: activo ? "linear-gradient(135deg, #10b981, #059669)" : "#fff",
                  color: activo ? "#fff" : "#047857",
                  border: "1.5px solid " + (activo ? "#10b981" : "#e2e8f0"),
                  borderRadius: 8,
                  cursor: "pointer",
                  flexShrink: 0,
                  textAlign: "center",
                  lineHeight: 1.2,
                }}
              >
                <div>{s.label}</div>
                <div style={{ fontSize: 9, opacity: 0.85, marginTop: 1 }}>{s.rango}</div>
              </button>
            );
          })}
        </div>
      )}

      {data.map((r, i) => {
        // En el ranking mensual cada fila abre el boletín de esa persona (como la clásica).
        const abrible = subTab === "mes" && !!onVerBoletin && r.id != null;
        return (
          <div
            key={r.key ?? i}
            className={"v-rank-big " + (r.esYo ? "tu" : "")}
            onClick={abrible ? () => abrirBoletin(r.id) : undefined}
            style={abrible ? { cursor: "pointer" } : undefined}
          >
            <div className="medal">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</div>
            <div className="info">
              <div className="nom">{r.esYo ? `TÚ (${primerNombre(vendedora?.nombre)})` : r.nombre}</div>
              <div className="rol">{r.rolLabel}{r.detalle ? ` · ${r.detalle}` : ""}</div>
            </div>
            <div className="valores">
              <div className="v">
                {subTab === "trim"
                  ? (typeof r.valor === "number" ? r.valor.toFixed(2) : "—")
                  : formatoK(r.valor)}
              </div>
              {r.subValor && <div className="g">{r.subValor}</div>}
            </div>
            {abrible && <div style={{ color: "#a855f7", fontWeight: 900, fontSize: 18, paddingLeft: 4 }}>›</div>}
          </div>
        );
      })}

      {/* !esInd: en el sub-tab de indicador el empty state lo pinta el propio
          TabRankingIndicadores; si no, saldrían los dos mensajes a la vez. */}
      {!esInd && data.length === 0 && (
        <div className="v-loading" style={{ textAlign: "center", lineHeight: 1.5, padding: "18px 10px" }}>
          {mensajeVacio}
        </div>
      )}
    </>
  );
}

// --- Sub-tabs (4) --------------------------------------------------------
// .v-rank-tabs es flex con .v-rank-tab-btn { flex:1; padding:8px; font-size:11px;
// uppercase; letter-spacing:.5px }. Con 3 botones cabía; con 4 no: en un celular
// de 360px quedan ~76px por columna y "TRIMESTRE" en 11px uppercase ya se sale.
// Solución: grid de 4 columnas con minmax(0,1fr) — nunca desborda el contenedor —
// y el texto en 2 renglones (emoji arriba, etiqueta abajo) en vez de uno solo.
const tabsGrid4 = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 4 };
const tabBtn4 = { padding: "6px 2px", letterSpacing: 0, lineHeight: 1.1, minWidth: 0, overflow: "hidden" };
const tabEmoji4 = { display: "block", fontSize: 13, lineHeight: 1.3 };
const tabLabel4 = { display: "block", fontSize: 9.5, marginTop: 1, letterSpacing: 0.2 };

// Estilos compartidos para chips de meses/trimestres/semanas
const chipsRow = { display: "flex", gap: 4, overflowX: "auto", padding: "0 0 8px", marginBottom: 6 };
function chipStyle(activo, color) {
  const bg = color === "amber"
    ? "linear-gradient(135deg, #f59e0b, #ea580c)"
    : "linear-gradient(135deg, #7c3aed, #ec4899)";
  const text = color === "amber" ? "#b45309" : "#7c3aed";
  return {
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 800,
    background: activo ? bg : "#fff",
    color: activo ? "#fff" : text,
    border: "1.5px solid " + (activo ? "transparent" : "#e2e8f0"),
    borderRadius: 8,
    cursor: "pointer",
    flexShrink: 0,
  };
}
