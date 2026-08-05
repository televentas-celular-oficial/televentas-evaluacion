// Tab RANKING — cada vendedora ve SOLO su ciudad. Admin puede alternar MED/BOG/Todas.
// 3 sub-tabs: Mes / Trimestre / Semana efectivo
// Selector histórico de meses (chips ene-dic)

import { useState, useMemo } from "react";
import { formatoK, primerNombre } from "../lib/helpers.js";

// Calcula las últimas N semanas (lun-dom) desde HOY hora Colombia
function calcularUltimasSemanas(n) {
  const meses = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  const tz = "America/Bogota";
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(new Date());
  const wdMap = { Sun: 6, Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5 };
  const diasDesdeLunes = wdMap[wd] ?? 0;

  const lunActual = new Date();
  lunActual.setDate(lunActual.getDate() - diasDesdeLunes);

  const out = [];
  for (let i = 0; i < n; i++) {
    const lun = new Date(lunActual);
    lun.setDate(lunActual.getDate() - i * 7);
    const dom = new Date(lun);
    dom.setDate(lun.getDate() + 6);
    const rango = `${lun.getDate()} ${meses[lun.getMonth()]} – ${dom.getDate()} ${meses[dom.getMonth()]}`;
    const label = i === 0 ? "Actual" : i === 1 ? "Cerrada" : `-${i} sem`;
    out.push({ i, label, rango });
  }
  return out;
}

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const TRIMESTRE_ACTUAL = 3; // Q3 en agosto — luego se calcula automático

export default function TabRanking({
  vendedora,
  ciudad,        // ciudad de la vendedora (guard)
  rol,           // si admin, puede alternar
  filtroCiudadAdmin,
  setFiltroCiudadAdmin,
  mesSeleccionado, // { año, mes }
  setMesSeleccionado,
  añoActual,
  mesActual,
  rankingMes,    // array por sub-tab
  rankingTrim,
  rankingSem,
}) {
  const [subTab, setSubTab] = useState("mes");
  const [qSel, setQSel] = useState(TRIMESTRE_ACTUAL);
  const esAdmin = rol === "admin";
  const ciudadEfectiva = esAdmin ? filtroCiudadAdmin : ciudad;

  const data = subTab === "mes" ? rankingMes : subTab === "trim" ? rankingTrim : rankingSem;

  return (
    <>
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

      <div className="v-rank-tabs">
        <button className={"v-rank-tab-btn" + (subTab === "mes" ? " active" : "")} onClick={() => setSubTab("mes")}>📅 Mes</button>
        <button className={"v-rank-tab-btn" + (subTab === "trim" ? " active" : "")} onClick={() => setSubTab("trim")}>💎 Trimestre</button>
        <button className={"v-rank-tab-btn" + (subTab === "sem" ? " active" : "")} onClick={() => setSubTab("sem")}>⚡ Sem ef.</button>
      </div>

      {/* Chips por sub-tab: meses / trimestres / semanas */}
      {subTab === "mes" && (
        <div style={chipsRow}>
          {MESES.slice(3, mesActual).map((m, i) => {
            const numMes = i + 4;
            const activo = mesSeleccionado?.mes === numMes;
            return (
              <button
                key={m}
                onClick={() => setMesSeleccionado({ año: añoActual, mes: numMes })}
                style={chipStyle(activo, "purple")}
              >{m}</button>
            );
          })}
        </div>
      )}
      {subTab === "trim" && (
        <div style={chipsRow}>
          {[1, 2, 3, 4].filter(n => n <= TRIMESTRE_ACTUAL).map(n => {
            const activo = qSel === n;
            const label = ["Q1 · ene-mar", "Q2 · abr-jun", "Q3 · jul-sep", "Q4 · oct-dic"][n - 1];
            return (
              <button
                key={n}
                onClick={() => setQSel(n)}
                style={chipStyle(activo, "amber")}
              >{label}</button>
            );
          })}
        </div>
      )}
      {subTab === "sem" && <ChipsSemanas />}

      {(data || []).map((r, i) => (
        <div key={i} className={"v-rank-big " + (r.esYo ? "tu" : "")}>
          <div className="medal">{r.medal || i + 1}</div>
          <div className="info">
            <div className="nom">{r.esYo ? `TÚ (${primerNombre(vendedora?.nombre)})` : r.nombre}</div>
            <div className="rol">{r.rolLabel} {r.detalle && `· ${r.detalle}`}</div>
          </div>
          <div className="valores">
            <div className="v">
              {subTab === "trim"
                ? (typeof r.valor === "number" ? r.valor.toFixed(2) : r.valor)
                : formatoK(r.valor)}
            </div>
            {r.subValor && <div className="g">{r.subValor}</div>}
          </div>
        </div>
      ))}

      {(!data || data.length === 0) && (
        <div className="v-loading">Sin datos aún para este período</div>
      )}
    </>
  );
}

// Estilos compartidos para chips de meses/trimestres
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

// Chips de últimas semanas (para navegar histórico en Sem Ef)
// Fechas calculadas dinámicamente desde HOY (hora Colombia)
function ChipsSemanas() {
  const [semSel, setSemSel] = useState(0); // 0 = semana actual
  const semanas = useMemo(() => calcularUltimasSemanas(5), []);
  return (
    <div style={{ display: "flex", gap: 4, overflowX: "auto", padding: "0 0 8px", marginBottom: 6 }}>
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
  );
}
