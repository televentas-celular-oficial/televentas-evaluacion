// Card celebratoria — se muestra los LUNES en Tab Hoy
// Anuncia las ganadoras de la semana pasada (que se cerró el domingo)
// Confetti automático cuando la vendedora que abre ganó algo
// El martes desaparece automáticamente

import { formatoPesos, primerNombre } from "../lib/helpers.js";

export default function CardSemanaCerrada({ semanaCerrada, onCerrar }) {
  if (!semanaCerrada) return null;

  const { fechaLabel, extra, ganadoras50k } = semanaCerrada;

  return (
    <div className="v-semana-cerrada">
      <button className="v-cerrar-x" onClick={onCerrar} aria-label="Cerrar">✕</button>
      <div className="v-sc-titulo">🏆 ¡SEMANA CERRADA!</div>
      <div className="v-sc-fecha">{fechaLabel}</div>

      {/* Ganadora del EXTRA */}
      <div className="v-sc-extra">
        <div className="v-sc-badge">🥇 $50.000 EXTRA</div>
        <div className="v-sc-nombre-big">
          {extra.esYo ? "¡GANASTE TÚ! 🎉" : primerNombre(extra.nombre)}
        </div>
        <div className="v-sc-monto">{formatoPesos(extra.monto)} en efectivo</div>
      </div>

      {/* Ganadoras del +$50.000 base */}
      {ganadoras50k && ganadoras50k.length > 0 && (
        <div className="v-sc-50k">
          <div className="v-sc-50k-titulo">✅ +$50.000 para:</div>
          <div className="v-sc-50k-lista">
            {ganadoras50k.map((g, i) => (
              <span
                key={i}
                className={"v-sc-chip " + (g.esYo ? "tu" : "")}
              >
                {g.esYo ? "TÚ 💫" : primerNombre(g.nombre)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="v-sc-footer">💰 Los pagos se hacen hoy · nueva semana ya arrancó</div>
    </div>
  );
}
