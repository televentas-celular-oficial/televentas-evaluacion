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
  derivarRankingPorIndicador,
} from "../data/derivar.js";
import { hoyColombia, primerNombre } from "../lib/helpers.js";
import { fmtN } from "../../lib/calculos.js";

// Paleta Valkyrias — sólo colores. `colorN`/`bgN` de lib/calculos.js siguen
// intactos porque los usan el admin y el ingreso diario, donde el rojo SÍ es
// una alarma de verdad. Aquí la vendedora tiene su propia escala.
// Los papeles de color viven en valquirias.css (:root). Aquí sólo se nombran.
const LINEA = "var(--vk-borde)";        // Borde
const APOYO = "var(--vk-secundario)";   // Niebla
const TENUE = "var(--vk-tenue)";        // Sin dato
const TINTA = "var(--vk-titulo)";       // Tinta
const PAPEL = "var(--vk-tarjeta)";      // Papel
const LILA_BG = "var(--vk-lavanda-fondo)";    // Lavanda — la tarjeta que explica
const LILA_BORDE = "var(--vk-lavanda-borde)"; // su borde
const LILA_TXT = "var(--vk-lavanda-texto)";   // su tinta
const NEUTRO = "var(--vk-neutro)";            // gris de resalte — riel de la barra
const VERDE = "var(--vk-bien)";               // "verde de lo ganado y de las barras"

// La tarjeta destacada: crema con borde dorado (los mismos papeles que MiMes).
const CREMA = "var(--vk-noche)";              // #FFFBEB — crema
const ORO = "var(--vk-metal)";                // #FCD34D — el dorado del borde
const ORO_FILO = "var(--vk-metal-borde)";     // #B45309 — el filo del oro
const C_TXT = "var(--vk-noche-texto)";        // tinta sobre la crema
const C_APOYO = "var(--vk-noche-apoyo)";      // secundario sobre la crema

// Nota → % de la barra de 1.00 a 5.00 (el rango real de una nota).
const pctNota = (n) => Math.max(0, Math.min(100, ((n - 1) / 4) * 100));

// Escala de notas: el canal principal es lleno contra hueco, no el tono.
const colorNota = (n) =>
  n >= 4.5 ? "var(--vk-bien-texto)" : n >= 3.5 ? "var(--est-atencion)" : n >= 2.5 ? "var(--est-medio)" : "var(--vk-medio)";
const fondoNota = (n) =>
  n >= 4.5 ? "var(--vk-bien-fondo)" : n >= 3.5 ? "var(--vk-tarjeta)" : n >= 2.5 ? "var(--est-medio-fondo)" : "var(--vk-neutro)";
const anilloNota = (n) => (n >= 3.5 && n < 4.5 ? "inset 0 0 0 1.5px var(--est-atencion-borde)" : "none");

// Consejo corto por indicador. Los indicadores diarios son observaciones
// fotográficas: los días que pasaron NO se corrigen, así que aquí nunca se
// promete recuperar nada — sólo qué hacer con los días que vienen.
const CONSEJOS = {
  puntualidad: "Cada día que llegas a tiempo suma. Un retardo de 10 minutos o más pesa mucho más que uno de 2.",
  tienda: "Se revisan tres cosas cada día: orden, uniforme y depósito.",
  planilla: "La planilla se llena el mismo día. Un día que no se llenó queda así — lo que sí está en tus manos son los días que vienen.",
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
    background: PAPEL, border: `1px solid ${LINEA}`, borderRadius: 13,
    padding: 16, marginBottom: 10,
  },
  // La destacada: crema con borde dorado.
  cardOro: {
    background: CREMA, border: `1px solid ${ORO}`, borderLeft: `4px solid ${ORO_FILO}`,
    borderRadius: "0 13px 13px 0", padding: 16, marginBottom: 10,
  },
  mini: {
    display: "flex", alignItems: "center", gap: 9, padding: "7px 10px",
    borderRadius: 9, marginBottom: 3, fontSize: 12.5,
  },
  lbl: {
    fontSize: 12, fontWeight: 800, color: APOYO, textTransform: "uppercase",
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
    background: hay ? fondoNota(nota) : PAPEL,
    color: hay ? colorNota(nota) : TENUE,
    boxShadow: hay ? anilloNota(nota) : "none",
    // Sin dato: hueco con borde punteado. El `outline` va por dentro, así que
    // no mueve ni un píxel de lo que ya estaba.
    ...(hay ? null : { outline: "1.5px dashed var(--est-sin-dato)", outlineOffset: "-1.5px" }),
    ...extra,
  };
}

// La barra de la nota: escala 1.00 → 5.00, con el 4.50 del premio marcado.
// No calcula nada: sólo coloca la nota que ya vino del motor sobre su escala.
function BarraNota({ nota }) {
  const marca = pctNota(4.5);
  return (
    <div>
      <div style={{ position: "relative", height: 10, marginTop: 12 }}>
        <div style={{
          position: "absolute", inset: 0, background: NEUTRO,
          borderRadius: 5, overflow: "hidden",
        }}>
          <span style={{
            display: "block", height: "100%", borderRadius: 5, background: VERDE,
            width: `${nota == null ? 0 : pctNota(nota)}%`,
          }} />
        </div>
        <span style={{
          position: "absolute", left: `${marca}%`, top: -3, marginLeft: -1,
          width: 2, height: 16, borderRadius: 1, background: ORO_FILO,
        }} />
      </div>
      <div style={{ position: "relative", height: 15, marginTop: 6 }}>
        <span style={{
          position: "absolute", left: `${marca}%`, transform: "translateX(-50%)",
          whiteSpace: "nowrap", fontSize: 10, fontWeight: 700,
          letterSpacing: ".2px", color: C_APOYO,
        }}>
          4.50 premio
        </span>
      </div>
    </div>
  );
}

// Lleno cuando el día salió bien; HUECO con borde cuando hubo novedad. Aquí no
// hay rojo: un día que ya pasó no se puede corregir, así que no es una alarma.
// "grave" es el mismo hueco, con el borde más oscuro para que se note que pesó
// más. Descanso y sin dato no son ni buenos ni malos: cada uno tiene su token.
// El cuadrito de la tira. Tres estados, que son los que el sistema ya guarda:
// bien, novedad leve y grave. Se distinguen por RELLENO, no sólo por tono —
// un día grave es sólido y se ve de lejos aunque la tira tenga treinta días.
function cuadroDia(estado) {
  if (estado === "grave") return { background: "var(--est-grave)", border: "1px solid var(--est-grave)" };
  if (estado === "mal") return { background: "var(--est-atencion-fondo)", border: "1px solid var(--est-atencion-borde)" };
  if (estado === "sindato") return { background: "transparent", border: "1px dashed var(--est-sin-dato)" };
  // `cero`: el día pasó y no hubo nada. No es falla (no baja la nota del día)
  // pero tampoco es logro, así que no va verde: va hueco.
  if (estado === "cero") return { background: "var(--vk-neutro)", border: "1px solid var(--vk-borde)" };
  return { background: "var(--vk-bien-fondo)", border: "1px solid var(--vk-bien-texto)" };
}

function estiloDia(estado) {
  if (estado === "ok") return { background: "var(--vk-bien-fondo)", color: "var(--vk-bien-texto)" };
  if (estado === "grave") return { background: PAPEL, color: "var(--est-atencion)", boxShadow: "inset 0 0 0 1.5px var(--est-grave)" };
  if (estado === "descanso") return { background: "var(--est-descanso)", color: "var(--est-descanso-texto)" };
  if (estado === "sindato") return { background: PAPEL, color: TENUE, outline: "1.5px dashed var(--est-sin-dato)", outlineOffset: "-1.5px" };
  return { background: PAPEL, color: "var(--est-atencion)", boxShadow: "inset 0 0 0 1.5px var(--est-atencion-borde)" };
}

function Marco({ onVolver, etiquetaVolver, children }) {
  return (
    <div>
      {onVolver && <button className="v-back-btn v-back-solo" onClick={onVolver}>‹ {etiquetaVolver}</button>}
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

  // ── Mi puesto en ESTE indicador, dentro de MI ciudad ──────────────────────
  // Ranking del motor (derivarRankingPorIndicador → calcRanking): ya existía y
  // ya lo usa el admin. Aquí sólo se lee, filtrado por la ciudad de ella.
  // Sin ciudad no hay ranking que mostrar: MED y BOG son dos empresas separadas
  // y mezclarlas sería inventar un puesto. No hay ciudad por defecto.
  const ciudadV =
    vendedora?.ciudad === "MED" || vendedora?.ciudad === "BOG" ? vendedora.ciudad : null;
  const rkInd = useMemo(
    () =>
      vendedora && !esTrim && ciudadV
        ? derivarRankingPorIndicador(datos, indicadorId, ciudadV, a, m, vendedora.id)
        : null,
    [datos, vendedora, esTrim, ciudadV, indicadorId, a, m]
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

  // ── Mi puesto en este indicador ───────────────────────────────────────────
  // `rkInd` ya viene ordenado y numerado por el motor. Aquí sólo se busca su
  // fila y la de arriba. La distancia es la RESTA de dos notas que están las dos
  // a la vista en la misma lista — no una fórmula nueva.
  const filasInd = rkInd || [];
  const miIdx = filasInd.findIndex(f => f.esYo);
  const yoInd = miIdx >= 0 ? filasInd[miIdx] : null;
  const arribaInd = miIdx > 0 ? filasInd[miIdx - 1] : null;
  const difInd =
    arribaInd && yoInd && arribaInd.nota != null && yoInd.nota != null
      ? Math.abs(arribaInd.nota - yoInd.nota).toFixed(2)
      : null;
  const ciudadTxt = ciudadV === "BOG" ? "Bogotá" : ciudadV === "MED" ? "Medellín" : null;

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
      lineaTendencia = { color: "var(--vk-bien)", texto: `▲ Vienes subiendo — ${dif} más que en ${prev}. Sigue así.` };
    } else if (ind.tendencia === "baja") {
      lineaTendencia = { color: "var(--est-atencion)", texto: `▼ Vienes bajando — ${dif} menos que en ${prev}.${colaUltimo}` };
    } else {
      lineaTendencia = { color: APOYO, texto: ind.texto };
    }
  }

  const dias = !esTrim ? (ind.dias || []) : null;
  // Los únicos días que llevan texto: los que tienen algo que corregir.
  const novedades = (dias || []).filter(d => d.estado === "mal" || d.estado === "grave");
  // Sólo para reseñas: días en que sí consiguió al menos una.
  const conResena = (dias || []).filter(d => d.estado === "ok").length;
  const nombreMesMes = !esTrim
    ? ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
       "agosto", "septiembre", "octubre", "noviembre", "diciembre"][m - 1]
    : null;

  return (
    <Marco onVolver={onVolver} etiquetaVolver={etiquetaVolver}>
      {/* ── 1) TU NOTA — tarjeta crema, nota grande, barra 1.00–5.00 ────────── */}
      <div style={S.cardOro}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
          <span style={{ fontSize: 24 }}>{ind.emoji}</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: C_TXT }}>{ind.nombre}</span>
        </div>
        <div style={{
          fontSize: 34, fontWeight: 800, letterSpacing: "-1px", textAlign: "center",
          color: nota == null ? TENUE : C_TXT,
        }}>
          {fmtN(nota)}
        </div>
        <BarraNota nota={nota} />
        {resumen ? (
          <div style={{
            fontSize: 12.5, color: C_APOYO, fontWeight: 600,
            marginTop: 8, textAlign: "center", lineHeight: 1.5,
          }}>
            {resumen}
          </div>
        ) : null}
      </div>

      {/* ── 2) MI PUESTO EN ESTE INDICADOR · SU CIUDAD ──────────────────────── */}
      {/* Sólo en el detalle del MES: el ranking por indicador del motor es
          mensual. En el trimestre no existe, y no se inventa. */}
      {!esTrim && ciudadTxt && (
        <div style={S.card}>
          <div style={S.lbl}>Mi puesto · {ciudadTxt}</div>
          {!filasInd.length || !yoInd ? (
            <div style={{ fontSize: 12.5, color: APOYO, fontWeight: 600, lineHeight: 1.55 }}>
              El puesto de este indicador todavía no está disponible.
            </div>
          ) : (
            <>
              {filasInd.map(f => (
                <div
                  key={f.id}
                  style={{
                    ...S.mini,
                    ...(f.esYo
                      ? { background: CREMA, boxShadow: `inset 0 0 0 1.5px ${ORO}` }
                      : null),
                  }}
                >
                  <span style={{
                    width: 20, textAlign: "center", fontWeight: 800, flexShrink: 0,
                    color: f.n <= 3 ? VERDE : TENUE,
                  }}>
                    {["🥇", "🥈", "🥉"][f.n - 1] || f.n}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 700, color: TINTA }}>
                    {f.esYo ? `TÚ · ${primerNombre(f.nombre)}` : primerNombre(f.nombre)}
                  </span>
                  <span style={badge(f.nota, { fontSize: 13, minWidth: 42, padding: "3px 10px" })}>
                    {fmtN(f.nota)}
                  </span>
                </div>
              ))}
              {arribaInd && difInd != null ? (
                <div style={{
                  fontSize: 12, color: APOYO, fontWeight: 600, marginTop: 8,
                  paddingTop: 8, borderTop: `1px dashed ${LINEA}`,
                }}>
                  {primerNombre(arribaInd.nombre)} está a{" "}
                  <strong style={{ color: TINTA }}>{difInd}</strong> de ti.
                </div>
              ) : miIdx === 0 ? (
                <div style={{
                  fontSize: 12, color: VERDE, fontWeight: 700, marginTop: 8,
                  paddingTop: 8, borderTop: `1px dashed ${LINEA}`,
                }}>
                  🏆 Vas de primera en tu ciudad.
                </div>
              ) : null}
            </>
          )}
        </div>
      )}

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
              {/* LA TIRA DEL MES.
                  Antes esto era un renglón por día: veinticuatro líneas para
                  decir que casi siempre estuvo bien, con la novedad enterrada
                  entre veintidós días idénticos.
                  Ahora los días buenos SE VEN y no se leen — un cuadrito verde
                  cada uno — y sólo los días con novedad llevan su explicación,
                  que es lo único que ella puede usar para corregir.
                  La tira pinta EXACTAMENTE los días con registro: un día que no
                  llegó, uno de descanso y uno que nadie llenó no se distinguen
                  entre sí, así que no se inventa una casilla para ellos. */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 10 }}>
                {dias.map(d => (
                  <span
                    key={d.fecha}
                    title={`${d.etiqueta} · ${d.texto}`}
                    style={{ width: 15, height: 15, borderRadius: 4, ...cuadroDia(d.estado) }}
                  />
                ))}
              </div>

              {/* "Días bien" sólo donde el día ES un veredicto.
                  Reseñas no juzga el día: su nota es el ratio del mes, y por eso
                  `diaDeIndicador` nunca le pone "mal". Decir "24 días bien" en un
                  indicador con nota 1.07 sería mentirle — y decir "24 días
                  registrados" cuando en ninguno consiguió una reseña tampoco
                  cuenta lo que pasó. Se dice el hecho: cuántos días sin ninguna. */}
              <div style={{ fontSize: 11.5, fontWeight: 800, color: APOYO, marginBottom: novedades.length ? 8 : 0 }}>
                {ind.id === "resenas" ? (
                  conResena === 0 ? (
                    <strong style={{ color: TINTA }}>{dias.length} días sin reseñas</strong>
                  ) : (
                    <>
                      <strong style={{ color: TINTA }}>{conResena} {conResena === 1 ? "día con reseña" : "días con reseña"}</strong>
                      {dias.length - conResena > 0 && ` · ${dias.length - conResena} sin ninguna`}
                    </>
                  )
                ) : (
                  <>
                    <strong style={{ color: TINTA }}>{dias.length - novedades.length} días bien</strong>
                    {novedades.length > 0 && ` · ${novedades.length} con novedad`}
                  </>
                )}
              </div>

              {novedades.map((d, i, arr) => (
                <div
                  key={d.fecha}
                  style={{
                    display: "flex", alignItems: "baseline", gap: 8, padding: "7px 0",
                    fontSize: 11.5,
                    borderBottom: i === arr.length - 1 ? "none" : `1px dashed ${LINEA}`,
                  }}
                >
                  <span style={{
                    fontWeight: 800, width: 84, flexShrink: 0,
                    color: d.estado === "grave" ? "var(--est-grave)" : "var(--est-atencion)",
                  }}>{d.etiqueta}</span>
                  <span style={{ flex: 1, color: APOYO, fontWeight: 700, textAlign: "right" }}>
                    {d.texto}
                  </span>
                </div>
              ))}

              {/* La tira TERMINA en el último día registrado, no en hoy: el
                  ingreso diario se llena con retraso. Sin decirlo, los días que
                  faltan al final parecen días perdidos. */}
              <div style={{ fontSize: 11.5, color: TENUE, marginTop: 8, lineHeight: 1.5 }}>
                {ind.cerrado
                  ? "Este mes ya cerró: su nota quedó fija."
                  : dias.length
                    ? <>Contado hasta el <strong style={{ color: APOYO }}>{(dias[dias.length - 1].etiqueta || "").toLowerCase()}</strong>. Los días siguientes entran cuando se registren.</>
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
