// Pantalla que se muestra a vendedora cuando el ranking está fuera de ventana
// Auto-encendido: martes y viernes 6pm-12am hora Colombia
// Admin puede forzar visible en cualquier momento

import { proximaVentana } from "./lib/helpers.js";

export default function PantallaBloqueada() {
  const cuando = proximaVentana();
  return (
    <div className="v-app">
      <div className="v-locked">
        <div className="v-locked-emoji">🚀</div>
        <div className="v-locked-title">Cada venta cuenta.<br />Cada cliente importa.</div>
        <div className="v-locked-msg">
          Tus indicadores se publican<br />
          <strong>martes y viernes de 6pm a 12am</strong>
          <br /><br />
          Vuelve <strong>{cuando}</strong> 💪
        </div>
      </div>
    </div>
  );
}
