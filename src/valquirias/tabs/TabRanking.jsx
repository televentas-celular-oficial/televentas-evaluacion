// Tab RANKING — cada vendedora ve SOLO su ciudad. Admin puede alternar MED/BOG/Todas.
// 3 sub-tabs: Mes / Trimestre / Semana efectivo
// Selector histórico de meses (chips ene-dic)

import { useState } from "react";
import { formatoK, primerNombre } from "../lib/helpers.js";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

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

      {/* Selector histórico de meses */}
      <div style={{ display: "flex", gap: 4, overflowX: "auto", padding: "4px 0 8px", marginBottom: 6 }}>
        {MESES.slice(3, mesActual).map((m, i) => {
          const numMes = i + 4; // abril=4, mayo=5, ...
          const activo = mesSeleccionado?.mes === numMes;
          return (
            <button
              key={m}
              onClick={() => setMesSeleccionado({ año: añoActual, mes: numMes })}
              style={{
                padding: "6px 10px",
                fontSize: 11,
                fontWeight: 800,
                background: activo ? "linear-gradient(135deg, #7c3aed, #ec4899)" : "#fff",
                color: activo ? "#fff" : "#7c3aed",
                border: "1.5px solid " + (activo ? "#7c3aed" : "#e2e8f0"),
                borderRadius: 8,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >{m}</button>
          );
        })}
      </div>

      <div className="v-rank-tabs">
        <button className={"v-rank-tab-btn" + (subTab === "mes" ? " active" : "")} onClick={() => setSubTab("mes")}>📅 Mes</button>
        <button className={"v-rank-tab-btn" + (subTab === "trim" ? " active" : "")} onClick={() => setSubTab("trim")}>💎 Trimestre</button>
        <button className={"v-rank-tab-btn" + (subTab === "sem" ? " active" : "")} onClick={() => setSubTab("sem")}>⚡ Sem ef.</button>
      </div>

      {(data || []).map((r, i) => (
        <div key={i} className={"v-rank-big " + (r.esYo ? "tu" : "")}>
          <div className="medal">{r.medal || i + 1}</div>
          <div className="info">
            <div className="nom">{r.esYo ? `TÚ (${primerNombre(vendedora?.nombre)})` : r.nombre}</div>
            <div className="rol">{r.rolLabel} {r.detalle && `· ${r.detalle}`}</div>
          </div>
          <div className="valores">
            <div className="v">{formatoK(r.valor)}</div>
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
