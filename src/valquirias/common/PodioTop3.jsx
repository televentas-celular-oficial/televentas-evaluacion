// Podio Top 3 del mes — portado de la clásica (src/App.jsx:829-857).
//
// HUECO QUE TAPA: en Valquirias TLV sólo había emojis 🥇🥈🥉 sueltos en las
// filas del ranking. El podio visual (3 columnas, el #1 al centro y más alto,
// con halo dorado) no existía.
//
// REGLA DE ORO: nada se calcula aquí. Todo sale de derivarPodioTop3(), que a su
// vez usa calcRanking() del motor → V1/V2, snapshots y desempate por ventas se
// respetan solos.
//
// Igual que la clásica (conDatos.length >= 3), si hay menos de 3 vendedoras con
// nota NO se renderiza nada: un podio de 2 no es un podio.

import { derivarPodioTop3 } from "../data/derivar.js";
import { fmtN, colorN, bgN } from "../../lib/calculos.js";
import { COLOR_CIUDAD } from "../../lib/constantes.js";

export default function PodioTop3({ datos, ciudad, año, mes, miId = null, onAbrir }) {
  const podio = derivarPodioTop3(datos, ciudad, año, mes, miId);

  // La clásica exige 3+ para pintar el podio. Menos que eso → nada.
  if (!podio || podio.length < 3) return null;

  const [oro, plata, bronce] = podio;

  // Orden visual: plata · oro · bronce (el #1 al centro y más alto)
  const columnas = [
    { v: plata, clase: "plata" },
    { v: oro, clase: "oro" },
    { v: bronce, clase: "bronce" },
  ];

  return (
    <div className="v-podio">
      <div className="v-podio-titulo">⚡ Top 3 del mes</div>

      <div className="v-podio-cols">
        {columnas.map(({ v, clase }) => (
          <div
            key={v.id}
            className={"v-podio-col" + (v.esYo ? " tu" : "") + (onAbrir ? " clickable" : "")}
            onClick={onAbrir ? () => onAbrir(v.id) : undefined}
            role={onAbrir ? "button" : undefined}
            tabIndex={onAbrir ? 0 : undefined}
            onKeyDown={onAbrir ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAbrir(v.id); } } : undefined}
          >
            <div
              className="v-podio-nombre"
              style={{ color: COLOR_CIUDAD[v.ciudad] || "var(--vk-titulo)" }}
            >
              {v.esYo ? "TÚ" : v.nombreCorto}
            </div>

            {/* Badge de nota — mismos colores que NotaBadge de la clásica */}
            <div
              className="v-podio-nota"
              style={{ background: bgN(v.nota), color: colorN(v.nota) }}
            >
              {fmtN(v.nota)}
            </div>

            <div className={"v-podio-base " + clase}>{v.medalla}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
