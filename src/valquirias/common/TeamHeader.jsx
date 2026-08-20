// Header con saludo + identidad de equipo (Team Valkyrias MED/BOG)

import { primerNombre } from "../lib/helpers.js";

export default function TeamHeader({ vendedora, rol, ciudad, totalAño = 0 }) {
  const nom = primerNombre(vendedora?.nombre);
  const esBog = ciudad === "BOG";
  const rolLabel = rol === "admin" ? "Admin" : rol === "oficina" ? "Oficina" : "Asesora";
  const rolClass = rol === "admin" ? "admin" : rol === "oficina" ? "oficina" : "";
  return (
    <>
      <div className="v-header">
        <div className="v-brand">Indicadores TLV</div>
        {totalAño > 0 && (
          <div className="v-chip-2026">💎 ${(totalAño / 1_000_000).toFixed(1)}M en 2026 ›</div>
        )}
      </div>
      <div className="v-greeting">
        Hola <strong>{nom}</strong>{" "}
        <span className={"v-role-mini " + rolClass}>{rolLabel}</span>
        <div className={"v-team-title " + (esBog ? "bog" : "med")}>
          {esBog ? "🟡 Team Valkyrias Bogotá" : "🟢 Team Valkyrias Medellín"}
        </div>
      </div>
    </>
  );
}
