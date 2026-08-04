// Confetti que cae por toda la pantalla — se muestra UNA sola vez al abrir
// cuando la vendedora ganó algo escaso. NO en loop.
// prefers-reduced-motion respetado.

import { useEffect, useState } from "react";
import { CONFETTI_PIECES } from "../lib/helpers.js";

export default function ConfettiRain({ trigger }) {
  const [mostrar, setMostrar] = useState(false);

  useEffect(() => {
    if (!trigger) return;
    // Respeta preferencias de accesibilidad
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setMostrar(true);
    const t = setTimeout(() => setMostrar(false), 4000);
    return () => clearTimeout(t);
  }, [trigger]);

  if (!mostrar) return null;

  return (
    <div className="v-confetti-container" aria-hidden="true">
      {CONFETTI_PIECES.map(p => (
        <div
          key={p.id}
          className={"v-confetti-piece " + p.forma}
          style={{
            left: p.left,
            background: p.color,
            animationDelay: p.delay,
            animationDuration: p.duration,
          }}
        />
      ))}
    </div>
  );
}
