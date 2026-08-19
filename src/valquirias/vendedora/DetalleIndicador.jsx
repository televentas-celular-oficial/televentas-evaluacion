// Detalle de UN indicador — dos modos en un solo componente (Valkyrias)
//
// Spec: docs/prototipo-3-perfiles.html → vIndicador()
//
//   modo "mes"  → el indicador DÍA POR DÍA del mes (qué pasó cada día, verde o rojo)
//   modo "trim" → el mismo indicador MES A MES del trimestre, con peso y estado,
//                 más una línea de si viene subiendo o bajando y por cuánto.
//
// Todo sale del motor:
// - derivarIndicadoresMes        → nota del mes, resumen y el día a día
// - derivarIndicadoresTrimestre  → notas mes a mes, promedio PONDERADO y tendencia
// - derivarTrimestreEnVivo       → la etiqueta de estado de cada mes (cerrado / en curso)
//
// Los meses CERRADOS no se recalculan: la nota viene del snapshot. Mirar los días
// de un mes cerrado es sólo leer la observación en crudo — no mueve nada.

import { useEffect, useMemo } from "react";
import { useDatos } from "../data/DatosContext.jsx";
import {
  derivarIndicadoresMes,
  derivarIndicadoresTrimestre,
  derivarTrimestreEnVivo,
} from "../data/derivar.js";
import { hoyColombia } from "../lib/helpers.js";
import { colorN, bgN, fmtN } from "../../lib/calculos.js";

const LINEA = "#e2e8f0";
const APOYO = "#475569";
const TENUE = "#94a3b8";
const TINTA = "#0f172a";
const LILA_BG = "#f7f4ff";
const LILA_BORDE = "#ddd3f5";
const LILA_TXT = "#5b2ec4";

// Consejo corto por indicador. Los indicadores diarios son observaciones
// fotográficas: los días que pasaron NO se corrigen, así que aquí nunca se
// promete recuperar nada — sólo qué hacer con los días que vienen.
const CONSEJOS = {
  puntualidad: "Cada día que llegas a tiempo suma. Un retardo de 10 minutos o más pesa mucho más que uno de 2.",
  tienda: "Se revisan tres cosas cada día: orden, uniforme y depósito.",
  planilla: "La planilla se llena el mismo día. Los días que pasaron ya no se pueden recuperar, pero los que vienen sí.",
  actitud: "Solo se marca cuando hay algo puntual que anotar, y siempre con la explicación de qué pasó.",
  resenas: "Cada reseña que dejan tus clientas suma. Pedirlas al cerrar la venta es lo que mejor funciona.",
  // V1 (abril 2026 y antes)
  celular: "Se revisa cada día que el celular no se use en el puesto durante el turno.",
  uniforme: "El uniforme se revisa todos los días. Es de lo más fácil de tener en 5.00.",
  tienda_e: "El estado de la tienda se revisa todos los días: orden, presentación y depósito.",
};

const S = {
  volver: {
    background: "none", border: "none", font: "inherit", fontSize: 14, fontWeight: 700,
    color: APOYO, cursor: "pointer", padding: "0 0 12px", display: "flex",
    alignItems: "center", gap: 5,
  },
  card: {
    background: "#fff", border: `1px solid ${LINEA}`, borderRadius: 13,
    padding: 16, marginBottom: 10,
  },
  lbl: {
    fontSize: 12, fontWeight: 800, color: "#334155", textTransform: "uppercase",
    letterSpacing: ".7px", marginBottom: 4, display: "block",
  },
  dia: {
    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
    padding: "9px 11px", borderRadius: 9, marginBottom: 4, fontSize: 12.5, fontWeight: 700,
  },
  filaMes: {
    display: "flex", alignItems: "center", gap: 10, padding: "9px 0",
    borderBottom: `1px dashed ${LINEA}`,
  },
  consejo: {
    borderRadius: 16, padding: "16px 18px", marginTop: 12, lineHeight: 1.6,
    background: LILA_BG, border: `1px solid ${LILA_BORDE}`,
    fontSize: 13.5, fontWeight: 600, color: LILA_TXT,
  },
};

function badge(nota, extra = {}) {
  const hay = nota !== null && nota !== undefined;
  return {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    borderRadius: 8, fontWeight: 800,
    background: hay ? bgN(nota) : "#f1f5f9",
    color: hay ? colorN(nota) : TENUE,
    ...extra,
  };
}

// Verde si el día salió bien, rojo si hubo novedad. "grave" es rojo también,
// pero se marca con un borde para que se note que pesó más.
function estiloDia(estado) {
  if (estado === "ok") return { background: "#f0fdf4", color: "#059669" };
  if (estado === "grave") return { background: "#fef2f2", color: "#dc2626", boxShadow: "inset 0 0 0 1.5px #fca5a5" };
  return { background: "#fef2f2", color: "#dc2626" };
}

function Marco({ onVolver, etiquetaVolver, children }) {
  return (
    <div>
      {onVolver && <button style={S.volver} onClick={onVolver}>‹ {etiquetaVolver}</button>}
      {children}
    </div>
  );
}

export default function DetalleIndicador({
  vendedora,
  indicadorId,
  modo = "mes",
  onVolver,
  año,
  mes,
  q,
}) {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  const datos = useDatos();
  const hoy = hoyColombia();
  const esTrim = modo === "trim";
  const a = Number(año) || hoy.año;
  const m = Number(mes) || hoy.mes;
  const qNum = Number(q) || Math.ceil(hoy.mes / 3);
  const etiquetaVolver = esTrim ? "Volver a mi trimestre" : "Volver a mi mes";

  // ── Modo mes ──────────────────────────────────────────────────────────────
  const indsMes = useMemo(
    () => (vendedora && !esTrim ? derivarIndicadoresMes(datos, vendedora, a, m) : null),
    [datos, vendedora, esTrim, a, m]
  );

  // ── Modo trimestre ────────────────────────────────────────────────────────
  const indsTrim = useMemo(
    () => (vendedora && esTrim ? derivarIndicadoresTrimestre(datos, vendedora, a, qNum) : null),
    [datos, vendedora, esTrim, a, qNum]
  );
  const trim = useMemo(
    () => (vendedora && esTrim ? derivarTrimestreEnVivo(datos, vendedora, a, qNum) : null),
    [datos, vendedora, esTrim, a, qNum]
  );

  if (!vendedora) {
    return (
      <Marco onVolver={onVolver} etiquetaVolver={etiquetaVolver}>
        <div style={{ ...S.card, textAlign: "center", padding: "38px 18px" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: TINTA }}>No disponible</div>
          <div style={{ fontSize: 12.5, color: APOYO, marginTop: 7, lineHeight: 1.6 }}>
            Todavía no podemos identificar tus datos.
          </div>
        </div>
      </Marco>
    );
  }

  const ind = esTrim
    ? (indsTrim?.indicadores || []).find(x => x.id === indicadorId)
    : (indsMes || []).find(x => x.id === indicadorId);

  if (!ind) {
    return (
      <Marco onVolver={onVolver} etiquetaVolver={etiquetaVolver}>
        <div style={{ ...S.card, textAlign: "center", padding: "38px 18px" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: TINTA }}>Indicador no disponible</div>
          <div style={{ fontSize: 12.5, color: APOYO, marginTop: 7, lineHeight: 1.6 }}>
            Este indicador no aplica en {esTrim ? "este trimestre" : "este mes"}.
          </div>
        </div>
      </Marco>
    );
  }

  const nota = esTrim ? ind.promedio : ind.nota;
  const resumen = esTrim ? "En el trimestre" : ind.detalle;

  // Etiqueta de estado de cada mes: la del motor (cerrado / en curso · día X de Y /
  // sin cerrar / aún no empieza). Nunca se inventa un estado.
  const etiquetaPorMes = Object.fromEntries(
    (trim?.meses || []).map(x => [x.mes, x.etiquetaEstado])
  );
  const ultimoTrim = trim?.meses?.[trim.meses.length - 1] || null;

  // Línea de tendencia del trimestre — con la diferencia exacta.
  let lineaTendencia = null;
  if (esTrim) {
    const nombrePrev = (indsTrim?.meses || []).find(x => x.mes === ind.mesPrevio)?.nombre || "";
    const prev = nombrePrev.toLowerCase();
    const dif = ind.delta === null ? null : Math.abs(ind.delta).toFixed(2);
    const colaUltimo = ultimoTrim && !ultimoTrim.cerrado
      ? ` ${ultimoTrim.nombre} pesa el ${ultimoTrim.pesoPct}%: ahí es donde más se mueve.`
      : "";

    if (ind.tendencia === "igual") {
      lineaTendencia = { color: APOYO, texto: `Vas igual que en ${prev}.` };
    } else if (ind.tendencia === "sube") {
      lineaTendencia = { color: "#059669", texto: `▲ Vienes subiendo — ${dif} más que en ${prev}. Sigue así.` };
    } else if (ind.tendencia === "baja") {
      lineaTendencia = { color: "#ea580c", texto: `▼ Vienes bajando — ${dif} menos que en ${prev}.${colaUltimo}` };
    } else {
      lineaTendencia = { color: APOYO, texto: ind.texto };
    }
  }

  const dias = !esTrim ? (ind.dias || []) : null;
  const nombreMesMes = !esTrim
    ? ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
       "agosto", "septiembre", "octubre", "noviembre", "diciembre"][m - 1]
    : null;

  return (
    <Marco onVolver={onVolver} etiquetaVolver={etiquetaVolver}>
      {/* ── Cabecera: emoji grande, nombre, resumen y nota ──────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <span style={{ fontSize: 34 }}>{ind.emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: TINTA }}>{ind.nombre}</div>
          <div style={{ fontSize: 12.5, color: APOYO, fontWeight: 600, marginTop: 2 }}>
            {resumen}
          </div>
        </div>
        <span style={badge(nota, { fontSize: 23, minWidth: 72, padding: "8px 13px" })}>
          {fmtN(nota)}
        </span>
      </div>

      {esTrim ? (
        /* ── Modo trimestre: mes a mes ─────────────────────────────────────── */
        <div style={S.card}>
          <div style={S.lbl}>Mes a mes · {indsTrim.q}</div>
          {(indsTrim.meses || []).map((mm, i) => {
            const n = ind.notasMes[i] ?? null;
            return (
              <div
                key={mm.mes}
                style={{
                  ...S.filaMes,
                  borderBottom: i === indsTrim.meses.length - 1 ? "none" : S.filaMes.borderBottom,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: mm.cerrado ? TINTA : APOYO }}>
                    {mm.nombre}
                  </div>
                  <div style={{ fontSize: 11.5, color: APOYO, marginTop: 2 }}>
                    Pesa {mm.pesoPct}% · {etiquetaPorMes[mm.mes] || (mm.cerrado ? "cerrado" : "sin cerrar")}
                  </div>
                </div>
                <span style={badge(n, { fontSize: 14, minWidth: 46, padding: "3px 10px" })}>
                  {fmtN(n)}
                </span>
              </div>
            );
          })}
          {lineaTendencia && (
            <div style={{
              fontSize: 12.5, fontWeight: 700, marginTop: 10, lineHeight: 1.55,
              color: lineaTendencia.color,
            }}>
              {lineaTendencia.texto}
            </div>
          )}
        </div>
      ) : (
        /* ── Modo mes: día por día ─────────────────────────────────────────── */
        <div style={S.card}>
          <div style={S.lbl}>Día por día · {nombreMesMes}</div>
          {!dias || !dias.length ? (
            <div style={{ fontSize: 12.5, color: APOYO, lineHeight: 1.6 }}>
              Todavía no hay días registrados de {nombreMesMes} para este indicador.
            </div>
          ) : (
            <>
              {dias.map(d => (
                <div key={d.fecha} style={{ ...S.dia, ...estiloDia(d.estado) }}>
                  <span>{d.etiqueta}</span>
                  <span style={{ textAlign: "right" }}>{d.texto}</span>
                </div>
              ))}
              <div style={{ fontSize: 11.5, color: TENUE, marginTop: 8 }}>
                {ind.cerrado
                  ? "Este mes ya cerró: su nota quedó fija."
                  : "Se van sumando a medida que pasa el mes."}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Consejo del indicador ──────────────────────────────────────────── */}
      {CONSEJOS[ind.id] && <div style={S.consejo}>{CONSEJOS[ind.id]}</div>}
    </Marco>
  );
}
