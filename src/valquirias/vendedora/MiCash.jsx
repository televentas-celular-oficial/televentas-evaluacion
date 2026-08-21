// Mi cash semanal — ranking de efectivo de SU ciudad, con ella resaltada,
// y debajo un cuadro motivacional que cambia según cómo va la semana.
//
// Especificación visual: docs/prototipo-3-perfiles.html → vCash() (aprobado por
// el dueño). Colores, tamaños y copy salen de ahí.
//
// ═══════════════════════════════════════════════════════════════════════════
// DE DÓNDE SALE EL DINERO QUE SE PINTA AQUÍ
// ═══════════════════════════════════════════════════════════════════════════
// Del documento `televentas/efectivo`, que escribe el worker
// (televentas-reportes/src/sync.js → `syncEfectivo`) leyendo la tabla `ventas`
// de Supabase. La app SÓLO LEE. Forma del doc:
//
//   { "2026-08-17": { "101": 450000, "102": 200000 },
//     "2026-08-18": { "101": 500000 },
//     "_meta": { "actualizado": "…Z", "desde": "2026-08-10", "hasta": "2026-08-23" } }
//
// Las tres trampas del doc, y cómo las trata este archivo:
//
//  1. `_meta` viaja MEZCLADA con los días. Todo recorrido de llaves pasa por
//     `esDiaEfectivo()` (DatosContext.jsx). Sumar `_meta` daría NaN.
//  2. Las llaves internas son el id de la ficha COMO STRING. Se compara siempre
//     con `String(v.id)`; comparar contra el id numérico no encuentra nada.
//  3. QUE EXISTA LA LLAVE DEL DÍA = ese día ya se procesó. Una vendedora que no
//     aparece dentro de un día que SÍ existe vendió $0 ese día — eso es un dato
//     real y se muestra como $0. Que NO exista la llave del día = el día todavía
//     no llegó (el worker no escribe días futuros). Eso NO es $0: es ausencia de
//     dato, y entonces esta pantalla no arma ranking. Ver `armarSemana`.
//
// La definición de "efectivo" (Efectivo puro + la porción Efectivo de un Mixto,
// sólo tabla `ventas`, sin restar gastos ni devoluciones, anuladas fuera) vive
// en el worker y es la MISMA del ranking del correo diario. Aquí no se
// recalcula nada de eso: se leen pesos ya sumados por día y por vendedora.
//
// ═══════════════════════════════════════════════════════════════════════════
// LA ZONA HORARIA — POR QUÉ ESTE ARCHIVO NO USA `new Date().getDay()`
// ═══════════════════════════════════════════════════════════════════════════
// Colombia es UTC−5 y no tiene horario de verano. El worker agrupa las ventas
// por día calendario COLOMBIANO. Si la app calculara la semana con la hora del
// navegador, a las 7 de la noche de un domingo en Bogotá el reloj UTC ya marca
// lunes: `getDay()` devolvería 1 y la pantalla saltaría a la semana siguiente
// con la semana en curso todavía sin cerrar. Ese defecto exacto ya nos costó
// datos, así que aquí la fecha colombiana es explícita en dos pasos:
//
//   PASO 1 — `hoyISOColombia()`: se le pide a `Intl.DateTimeFormat` las partes
//   de calendario con `timeZone: "America/Bogota"`. Eso devuelve el año, el mes
//   y el día TAL COMO SE VEN EN COLOMBIA, sin importar dónde esté el teléfono
//   ni cómo lo tenga configurado la vendedora. Se usa `formatToParts` (no
//   `format`) para que el locale no pueda reordenar el texto.
//
//   PASO 2 — `fechasSemana()`: la aritmética de días se hace en UTC
//   (`Date.UTC`, `getUTCDay`, `getUTCDate`) sobre esa fecha ya "pelada", sin
//   hora. Un día en UTC dura siempre 24 horas exactas, así que restar hasta el
//   lunes o sumar días nunca corre la fecha. Mezclar `Date.UTC` con getters
//   locales SÍ la correría; por eso aquí no hay un solo getter local.
//
// Resultado hoy, martes 18 de agosto de 2026 por la noche en Colombia:
// lunes = 2026-08-17, y la semana suma el lunes 17 y el martes 18. Los días del
// 19 al 23 no existen todavía en el doc y no se cuentan ni como cero.
//
// ═══════════════════════════════════════════════════════════════════════════
// EL PREMIO (regla del negocio, verificada contra el worker)
// ═══════════════════════════════════════════════════════════════════════════
//   · $50.000 a cada una que llegue a $2.500.000 en efectivo de lunes a domingo.
//   · $50.000 EXTRA a la que más efectivo vendió ENTRE LAS QUE YA GANARON.
//     Ese EXTRA sólo se activa cuando hay 2 o más en el club (`hayExtra`), que
//     es la misma condición del ranking del correo.
//
// MED y BOG nunca se mezclan: el roster se filtra por la ciudad de la vendedora.
//
// ═══════════════════════════════════════════════════════════════════════════
// ESTADOS VACÍOS — SAGRADOS
// ═══════════════════════════════════════════════════════════════════════════
// Si el doc no existe, si la semana en curso no tiene ni un día procesado, o si
// no se puede resolver su ciudad, esta pantalla lo DICE. Nunca pinta un cero que
// parezca dato, nunca asume Medellín. `armarSemana` devuelve `{ ok: false }` con
// el motivo exacto y la pantalla lo escribe tal cual.

import { useMemo } from "react";
import { useDatos, esDiaEfectivo } from "../data/DatosContext.jsx";
import { UMBRAL_EFECTIVO_SEMANA, PREMIO_EFECTIVO_SEMANA } from "../data/derivar.js";
import { participantes } from "../../lib/calculos.js";
import {
  formatoPesos, primerNombre, textoActualizado,
  // Desempate del EXTRA semanal: fuente única en helpers.js para que esta
  // pantalla y derivar.js no vuelvan a divergir (fue un bug real).
  resolverExtraSemanal, claveMesDeFecha, explicacionDesempate,
} from "../lib/helpers.js";

// Los papeles de color viven en valquirias.css (:root). Aquí sólo se nombran.
const TITULO = "var(--vk-titulo)";        // Tinta — títulos y nombres
const CIFRA = "var(--vk-cifra)";          // Tinta — toda cifra de dinero
const APOYO = "var(--vk-secundario)";     // Niebla
const TENUE = "var(--vk-tenue)";          // Sin dato
const VERDE = "var(--vk-bien)";           // Plata ganada
const LINEA = "var(--vk-borde)";          // Borde
const FONDO = "var(--vk-fondo)";          // Lienzo
const PAPEL = "var(--vk-tarjeta)";        // Papel
const NEUTRO = "var(--vk-neutro)";        // Gris de resalte
const MEDIO = "var(--vk-medio)";          // Texto sobre gris
const NOCHE = "var(--vk-noche)";          // Su propia fila: la cifra principal de la pantalla
const NOCHE_TXT = "var(--vk-noche-texto)";  // Tinta invertida sobre la noche
const NOCHE_APOYO = "var(--vk-noche-apoyo)";// Secundario sobre la noche
const VERDE_FONDO = "var(--vk-bien-fondo)"; // Verde claro de fondo
const ORO = "var(--vk-metal)";            // Sólo sobre la noche, y sólo si ya ganó

const NOMBRE_CIUDAD = { MED: "Medellín", BOG: "Bogotá" };

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

// Cifras de dinero SIEMPRE completas: $2.500.000, nunca $2.5M.
const peso = (n) => formatoPesos(n);

// ---------------------------------------------------------------------------
// FECHA COLOMBIANA — ver el bloque "LA ZONA HORARIA" arriba
// ---------------------------------------------------------------------------

// PASO 1: el día de hoy tal como se ve en Colombia, como "YYYY-MM-DD".
export function hoyISOColombia(ahora = new Date()) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(ahora);
  const v = (tipo) => partes.find((p) => p.type === tipo)?.value;
  return `${v("year")}-${v("month")}-${v("day")}`;
}

// Un ISO "YYYY-MM-DD" → milisegundos UTC de ese día a medianoche.
// Sin hora, sin desfase: es un día de calendario, no un instante.
const msDe = (iso) => {
  const [a, m, d] = String(iso).split("-").map(Number);
  return Date.UTC(a, m - 1, d);
};

const isoDe = (ms) => {
  const f = new Date(ms);
  const dd = (n) => String(n).padStart(2, "0");
  return `${f.getUTCFullYear()}-${dd(f.getUTCMonth() + 1)}-${dd(f.getUTCDate())}`;
};

const DIA_MS = 86400000;

// PASO 2: los 7 días (lunes → domingo) de la semana que contiene `iso`.
// Toda la aritmética es UTC sobre días pelados, así que no puede correrse.
export function fechasSemana(iso) {
  const dow = new Date(msDe(iso)).getUTCDay();     // 0 = domingo, 1 = lunes…
  // El domingo cierra la semana que ya empezó, no abre una nueva: retrocede 6.
  const alLunes = dow === 0 ? -6 : 1 - dow;
  const lunes = msDe(iso) + alLunes * DIA_MS;
  return Array.from({ length: 7 }, (_, i) => isoDe(lunes + i * DIA_MS));
}

const diaSemanaDe = (iso) => new Date(msDe(iso)).getUTCDay();

// "lunes 17"
const etiquetaDia = (iso) => {
  const f = new Date(msDe(iso));
  return `${DIAS[f.getUTCDay()]} ${f.getUTCDate()}`;
};

// "Lunes 17 a domingo 23 de agosto"
function rangoSemana(desde, hasta) {
  if (!desde || !hasta) return null;
  const a = new Date(msDe(desde));
  const b = new Date(msDe(hasta));
  const cap = `Lunes ${a.getUTCDate()}`;
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${cap} a domingo ${b.getUTCDate()} de ${MESES[b.getUTCMonth()]}`
    : `${cap} de ${MESES[a.getUTCMonth()]} a domingo ${b.getUTCDate()} de ${MESES[b.getUTCMonth()]}`;
}

// "lunes 17 y martes 18" / "lunes 17, martes 18 y miércoles 19"
function listaDias(fechas) {
  const e = fechas.map(etiquetaDia);
  if (e.length === 0) return "";
  if (e.length === 1) return e[0];
  return `${e.slice(0, -1).join(", ")} y ${e[e.length - 1]}`;
}

// ---------------------------------------------------------------------------
// ARMAR LA SEMANA — la única función que lee dinero
// ---------------------------------------------------------------------------
// Devuelve { ok: true, … } o { ok: false, motivo } — nunca ceros de relleno.
export function armarSemana({ efectivoDoc, vendedoras, vendedora, fechas, metas = null }) {
  const ciudad = vendedora?.ciudad || null;

  // Sin ciudad no hay ranking posible. Adivinarla sería inventar el concurso.
  if (!ciudad) {
    return {
      ok: false,
      motivo: "No podemos saber en qué ciudad estás compitiendo, y el premio se pelea " +
        "por ciudad. Escríbele al administrador para que revise tus datos.",
    };
  }

  const doc = efectivoDoc && typeof efectivoDoc === "object" ? efectivoDoc : {};
  // Trampa 1: `_meta` va mezclada con los días. Se filtra ANTES de recorrer.
  const diasEnDoc = Object.keys(doc).filter(esDiaEfectivo);

  if (diasEnDoc.length === 0) {
    return {
      ok: false,
      motivo: "El efectivo todavía no ha llegado desde systemlap, así que no hay ranking " +
        "que armar. En cuanto llegue, esta pantalla se llena sola.",
    };
  }

  // Trampa 3: sólo los días de ESTA semana que el worker YA procesó.
  // Un día ausente no es $0: es un día que todavía no ha llegado.
  const diasConDato = fechas.filter(
    (f) => doc[f] && typeof doc[f] === "object" && !Array.isArray(doc[f])
  );

  if (diasConDato.length === 0) {
    return {
      ok: false,
      motivo: "De esta semana todavía no hay ningún día procesado. No mostramos ceros: " +
        "sería decirte que no vendiste, y eso no es lo que dice el dato.",
      hayDocPeroNoSemana: true,
    };
  }

  const roster = participantes(vendedoras || [], "semanal", { ciudad });
  if (roster.length === 0) {
    return {
      ok: false,
      motivo: `Todavía no hay equipo cargado para ${NOMBRE_CIUDAD[ciudad] || ciudad}, ` +
        "así que no se puede armar el ranking.",
    };
  }

  // Trampa 2: las llaves del doc son el id de la ficha COMO STRING.
  const sumaDe = (id) =>
    diasConDato.reduce((t, f) => t + (Number(doc[f]?.[String(id)]) || 0), 0);

  const filas = roster
    .map((v) => ({
      id: v.id,
      nombre: v.nombre,
      esYo: String(v.id) === String(vendedora.id),
      efectivo: sumaDe(v.id),
    }))
    .sort((a, b) => b.efectivo - a.efectivo || String(a.nombre).localeCompare(String(b.nombre)));

  const club = filas.filter((f) => f.efectivo >= UMBRAL_EFECTIVO_SEMANA);
  const hayExtra = club.length >= 2;

  // Desempate del EXTRA: con empate al peso arriba del club manda lo vendido en
  // el MES DEL DOMINGO que cierra la semana (fechas[6]) — la semana lun–dom
  // puede cruzar de mes. Misma métrica del premio mensual (`metas.vendidas`) y
  // misma función que usa derivar.js, para que las dos pantallas no divergan.
  const vendidasMes = metas?.[claveMesDeFecha(fechas[6])]?.vendidas || {};
  const extra = resolverExtraSemanal(
    club,
    (f) => f.efectivo,
    (f) => Number(vendidasMes[String(f.id)]) || 0
  );
  const { ganadorasExtra, lider, empateExtra } = extra;
  const idsExtra = new Set(ganadorasExtra.map((f) => String(f.id)));

  // Sólo existe si HUBO empate de verdad. En una semana normal es null y la
  // pantalla no menciona el tema (regla del dueño: nada de empates salvo que pase).
  const notaDesempate = explicacionDesempate(
    extra, PREMIO_EFECTIVO_SEMANA, (f) => primerNombre(f.nombre)
  );

  const conPosicion = filas.map((f, i) => ({
    ...f,
    n: i + 1,
    medalla: ["🥇", "🥈", "🥉"][i] || null,
    gano: f.efectivo >= UMBRAL_EFECTIVO_SEMANA,
    // Con doble empate (efectivo Y ventas del mes) el extra lo ganan todas las
    // empatadas — por eso es un conjunto y no "la que quedó de primera".
    extra: idsExtra.has(String(f.id)),
    falta: Math.max(0, UMBRAL_EFECTIVO_SEMANA - f.efectivo),
  }));

  const yo = conPosicion.find((f) => f.esYo) || null;

  return {
    ok: true,
    ciudad,
    desde: fechas[0],
    hasta: fechas[6],
    diasConDato,
    filas: conPosicion,
    umbral: UMBRAL_EFECTIVO_SEMANA,
    premio: PREMIO_EFECTIVO_SEMANA,
    club,
    clubCount: club.length,
    hayExtra,
    empateExtra,
    ganadorasExtra,
    notaDesempate,
    lider,
    // Mi situación (yo === null si no estoy compitiendo esta semana)
    yo,
    miEfectivo: yo ? yo.efectivo : null,
    gane: !!yo?.gano,
    // Con doble empate no hay `lider` pero ella SÍ se lleva el EXTRA, así que
    // esto se mide por `yo.extra` y no por quién quedó de primera en la lista.
    voyPrimeraDelClub: !!yo?.extra,
    faltaParaPremio: yo ? yo.falta : null,
  };
}

// Ganadoras de una semana ya cerrada — para la tarjeta del lunes.
// Devuelve null si esa semana no tiene ni un día procesado (que es lo que pasa
// hoy con la semana pasada si el worker apenas se desplegó).
export function ganadorasDe({ efectivoDoc, vendedoras, ciudad, fechas, metas = null }) {
  const doc = efectivoDoc && typeof efectivoDoc === "object" ? efectivoDoc : {};
  const dias = fechas.filter((f) => doc[f] && typeof doc[f] === "object");
  if (dias.length === 0 || !ciudad) return null;

  const roster = participantes(vendedoras || [], "semanal", { ciudad });
  if (roster.length === 0) return null;

  const filas = roster
    .map((v) => ({
      id: v.id,
      nombre: v.nombre,
      efectivo: dias.reduce((t, f) => t + (Number(doc[f]?.[String(v.id)]) || 0), 0),
    }))
    .filter((f) => f.efectivo >= UMBRAL_EFECTIVO_SEMANA)
    .sort((a, b) => b.efectivo - a.efectivo);

  if (filas.length === 0) return { ganadoras: [], extra: null, desde: fechas[0], hasta: fechas[6] };

  // Esta es la semana YA CERRADA — la tarjeta del lunes que corona de verdad.
  // Mismo desempate que la semana en curso: con empate al peso manda lo vendido
  // en el mes del domingo. Sin `metas` no se puede desempatar, y entonces no se
  // corona a nadie antes que coronar a la equivocada.
  const vendidasMes = metas?.[claveMesDeFecha(fechas[6])]?.vendidas || {};
  const res = resolverExtraSemanal(
    filas,
    (f) => f.efectivo,
    (f) => Number(vendidasMes[String(f.id)]) || 0
  );
  return {
    ganadoras: filas,
    extra: res.lider,                // una sola, o null si empataron también en ventas
    extras: res.ganadorasExtra,      // todas las que se llevan el EXTRA
    // null en la semana normal: sin empate no se menciona el tema.
    notaDesempate: explicacionDesempate(
      res, PREMIO_EFECTIVO_SEMANA, (f) => primerNombre(f.nombre)
    ),
    desde: fechas[0],
    hasta: fechas[6],
  };
}

// ---------------------------------------------------------------------------
// CUADRO MOTIVACIONAL
// ---------------------------------------------------------------------------
// Marco: "vas así, esto es lo que falta". NUNCA "recupera lo que no hiciste" —
// aquí se habla de plata que todavía se puede vender, no de días perdidos.
function mensajeMotivacional(semana, semanaArranca) {
  const { premio, umbral, club, clubCount, hayExtra, empateExtra, lider,
    gane, voyPrimeraDelClub, miEfectivo, faltaParaPremio, yo } = semana;

  // Lo informativo y lo que falta va en neutro — gris, nunca rojo ni morado.
  // Lo ganado va en verde: LLENO cuando además va de primera, HUECO cuando el
  // premio ya es suyo pero todavía queda algo por pelear.
  const MORADO = { fondo: NEUTRO, borde: LINEA, tinta: MEDIO };
  const VERDE_S = { fondo: VERDE_FONDO, borde: LINEA, tinta: VERDE };
  const AMBAR = { fondo: PAPEL, borde: LINEA, tinta: VERDE };

  // No está en el ranking de su ciudad (eventual, o ya no activa). Se dice, no
  // se le inventa una posición ni una meta.
  if (!yo) {
    return {
      ...MORADO,
      titulo: "No estás en el concurso de esta semana",
      mensaje: `Este ranking es de las que están compitiendo por los ${peso(premio)} en ` +
        `${NOMBRE_CIUDAD[semana.ciudad] || semana.ciudad}, y tu nombre no aparece entre ellas. ` +
        "Si crees que es un error, escríbele al administrador.",
    };
  }

  if (semanaArranca) {
    return {
      ...MORADO,
      titulo: "Arranca la semana",
      mensaje: `Todas en ceros otra vez. La primera en llegar a ${peso(umbral)} en efectivo ` +
        `se lleva ${peso(premio)}, y la que más venda entre ellas suma ${peso(premio)} más.`,
    };
  }

  // ── Va de primera entre las que ya ganaron ──
  if (voyPrimeraDelClub) {
    const seg = club.find((f) => String(f.id) !== String(yo.id));
    // La distancia puede ser $0 (van iguales). Decir "está a $0 de pasarte" se
    // lee raro y además nombra un empate que todavía no decide nada: mientras
    // la semana esté abierta no se habla del tema.
    const dist = seg ? Math.max(0, miEfectivo - seg.efectivo) : null;
    return {
      ...VERDE_S,
      titulo: hayExtra ? "Vas por los dos premios" : `Ya son tuyos ${peso(premio)}`,
      mensaje: seg
        ? (dist > 0
            ? `Tienes tus ${peso(premio)} asegurados y vas de primera por el EXTRA. ` +
              `${primerNombre(seg.nombre)} está a ${peso(dist)} de pasarte — la semana no ha cerrado.`
            : `Tienes tus ${peso(premio)} asegurados y vas de primera por el EXTRA. ` +
              `${primerNombre(seg.nombre)} viene pisándote los talones — la semana no ha cerrado.`)
        : `Tienes tus ${peso(premio)}. El EXTRA de ${peso(premio)} sólo se activa cuando ` +
          "llegue otra al umbral, y por ahora vas de primera.",
    };
  }

  // (Antes había aquí una rama que le hablaba del empate y decía que el EXTRA
  // "estaba sin dueña". Se eliminó: quien se lleva el EXTRA cae arriba, en
  // `voyPrimeraDelClub`, que ahora se mide por `yo.extra`. Y el porqué, cuando
  // hubo empate de verdad, lo dice `notaDesempate` al pie del ranking — una
  // sola vez y sólo si pasó.)

  // ── Ya ganó, pero no es la #1 ──
  if (gane) {
    const arriba = lider || club[0];
    const faltaExtra = arriba ? Math.max(0, arriba.efectivo - miEfectivo) : null;
    return {
      ...AMBAR,
      titulo: `Ya son tuyos ${peso(premio)}`,
      mensaje: hayExtra && arriba
        ? `Van ${clubCount} en el club esta semana, así que el EXTRA de ${peso(premio)} se ` +
          `pelea entre ustedes. ${primerNombre(arriba.nombre)} va de primera con ` +
          `${peso(arriba.efectivo)} — te faltan ${peso(faltaExtra)} para quedar por encima.`
        : `Ya cruzaste los ${peso(umbral)} y el premio es tuyo. Lo que vendas de aquí al ` +
          `domingo es lo que pelea el EXTRA de ${peso(premio)}.`,
    };
  }

  // ── Todavía no llega a los $2.500.000 ──
  return {
    ...MORADO,
    titulo: `Te faltan ${peso(faltaParaPremio)}`,
    mensaje: clubCount
      ? `Vas en ${peso(miEfectivo)}. Con ${peso(faltaParaPremio)} más entras al club de los ` +
        `${peso(premio)}; ya van ${clubCount} adentro peleando el EXTRA y la semana no ha cerrado.`
      : `Vas en ${peso(miEfectivo)}. Con ${peso(faltaParaPremio)} más te ganas los ` +
        `${peso(premio)}. Nadie ha llegado todavía esta semana: la primera que cruce arranca ` +
        "peleando el EXTRA.",
  };
}

// ---------------------------------------------------------------------------
// Piezas de UI
// ---------------------------------------------------------------------------
const CSS = `
.vk-volver{background:none;border:none;font:inherit;font-size:14px;font-weight:700;
  color:${APOYO};cursor:pointer;padding:0 0 12px;display:flex;align-items:center;gap:5px}
.vk-volver:focus-visible{outline:2px solid ${TITULO};outline-offset:2px}
`;

function Volver({ onVolver }) {
  return (
    <button className="vk-volver" onClick={() => onVolver?.()}>
      ‹ Volver
    </button>
  );
}

function Encabezado({ subtitulo, nota }) {
  return (
    <>
      <div style={{ fontSize: 19, fontWeight: 800, margin: "0 0 12px", color: TITULO }}>
        💵 Mi cash semanal
      </div>
      {subtitulo && (
        <div style={{ fontSize: 12, color: APOYO, margin: "-6px 0 4px" }}>{subtitulo}</div>
      )}
      {nota && (
        <div style={{ fontSize: 11.5, color: TENUE, margin: "0 0 14px", fontWeight: 600 }}>
          {nota}
        </div>
      )}
      {!nota && subtitulo && <div style={{ height: 10 }} />}
    </>
  );
}

// Requisito fijo: siempre debajo, con las cifras completas.
function ComoSeGana({ umbral = UMBRAL_EFECTIVO_SEMANA, premio = PREMIO_EFECTIVO_SEMANA }) {
  return (
    <div
      style={{
        background: FONDO, border: `1px solid ${LINEA}`, borderRadius: 16,
        padding: "16px 18px", marginTop: 12, lineHeight: 1.6, color: TITULO,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Cómo se gana</div>
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>
        · {peso(premio)} para cada una que llegue a {peso(umbral)} en efectivo, de lunes a domingo.
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 4 }}>
        · {peso(premio)} EXTRA a la que más efectivo vendió entre las que ya ganaron.
      </div>
    </div>
  );
}

// Tarjeta del lunes: las ganadoras de la semana que acaba de cerrar.
// Sólo se pinta los lunes Y sólo si esa semana tiene días procesados. Hoy es
// martes, así que no aparece; el lunes que haya dato, aparece sola.
function TarjetaLunesPasado({ resumen, premio }) {
  if (!resumen || !resumen.ganadoras) return null;
  const { ganadoras, extra } = resumen;
  const rango = rangoSemana(resumen.desde, resumen.hasta);

  if (ganadoras.length === 0) {
    return (
      <div
        style={{
          background: FONDO, border: `1px solid ${LINEA}`, borderRadius: 16,
          padding: "14px 16px", marginBottom: 14, lineHeight: 1.6, color: APOYO,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 800, color: TITULO, marginBottom: 4 }}>
          Semana cerrada
        </div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          {rango}: ninguna llegó a {peso(UMBRAL_EFECTIVO_SEMANA)}. Semana nueva, cuenta nueva.
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: VERDE_FONDO, border: `1px solid ${LINEA}`, borderRadius: 16,
        padding: "14px 16px", marginBottom: 14, lineHeight: 1.6, color: VERDE,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>
        🎉 Ganadoras de la semana pasada
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, opacity: 0.85 }}>{rango}</div>
      {ganadoras.map((g) => (
        <div key={g.id} style={{ fontSize: 13, fontWeight: 700, marginTop: 3 }}>
          {primerNombre(g.nombre)} — {peso(g.efectivo)} · {peso(premio)}
          {extra && String(extra.id) === String(g.id) ? ` + 👑 EXTRA ${peso(premio)}` : ""}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estado vacío honesto — el dato NO existe todavía
// ---------------------------------------------------------------------------
function SinDato({ motivo, subtitulo, tarjetaLunes, onVolver }) {
  return (
    <>
      <style>{CSS}</style>
      <Volver onVolver={onVolver} />
      <Encabezado subtitulo={subtitulo} />
      {tarjetaLunes}

      <div
        style={{
          background: NEUTRO, border: `1px solid ${LINEA}`, borderRadius: 16,
          padding: "18px 18px 16px", color: MEDIO,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>
          Todavía no se puede armar el ranking
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.6 }}>{motivo}</div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------
export default function MiCash({ vendedora, onVolver }) {
  const datos = useDatos();
  // `metas` entra para desempatar el EXTRA cuando dos quedan iguales al peso.
  const { efectivo, vendedoras, metas, cargado } = datos;

  // Fecha colombiana explícita (ver el bloque de zona horaria arriba).
  const hoyISO = useMemo(() => hoyISOColombia(), []);
  const fechas = useMemo(() => fechasSemana(hoyISO), [hoyISO]);
  const esLunes = diaSemanaDe(hoyISO) === 1;

  const semana = useMemo(
    () => (vendedora ? armarSemana({ efectivoDoc: efectivo, vendedoras, vendedora, fechas, metas }) : null),
    [efectivo, vendedoras, vendedora, fechas, metas]
  );

  // La tarjeta del lunes sólo se calcula los lunes. Martes: ni se intenta.
  const resumenPasada = useMemo(() => {
    if (!esLunes || !vendedora?.ciudad) return null;
    const anterior = fechasSemana(isoDe(msDe(fechas[0]) - 7 * DIA_MS));
    return ganadorasDe({
      efectivoDoc: efectivo, vendedoras, ciudad: vendedora.ciudad, fechas: anterior, metas,
    });
  }, [esLunes, efectivo, vendedoras, vendedora, fechas, metas]);

  const tarjetaLunes = resumenPasada
    ? <TarjetaLunesPasado resumen={resumenPasada} premio={PREMIO_EFECTIVO_SEMANA} />
    : null;

  const rango = rangoSemana(fechas[0], fechas[6]);
  const ciudadTxt = vendedora?.ciudad ? (NOMBRE_CIUDAD[vendedora.ciudad] || vendedora.ciudad) : null;
  const subtitulo = rango;   // sin ciudad: ella ya sabe dónde trabaja

  if (!vendedora) {
    return (
      <>
        <style>{CSS}</style>
        <Volver onVolver={onVolver} />
        <div style={{ padding: "8px 4px", color: APOYO, fontSize: 14, fontWeight: 700, lineHeight: 1.6 }}>
          Todavía no se puede identificar a la vendedora, así que no hay ranking que mostrar.
        </div>
      </>
    );
  }

  // Mientras los documentos no hayan llegado, no se afirma nada: ni ranking ni
  // "no hay dato". Un empty state prematuro se lee como "no vendiste".
  if (!cargado) {
    return (
      <>
        <style>{CSS}</style>
        <Volver onVolver={onVolver} />
        <Encabezado subtitulo={subtitulo} />
        <div style={{ padding: "8px 4px", color: APOYO, fontSize: 13.5, fontWeight: 700 }}>
          Cargando el efectivo de la semana…
        </div>
      </>
    );
  }

  if (!semana.ok) {
    return (
      <SinDato
        motivo={semana.motivo}
        subtitulo={subtitulo}
        tarjetaLunes={tarjetaLunes}
        onVolver={onVolver}
      />
    );
  }

  // "Arranca la semana" sólo si de verdad todas están en cero, no por ser lunes.
  const semanaArranca = esLunes && semana.filas.every((f) => f.efectivo === 0);
  const { fondo, borde, tinta, titulo, mensaje } = mensajeMotivacional(semana, semanaArranca);

  const meta = efectivo?._meta || null;
  const frescura = meta?.actualizado ? textoActualizado(meta.actualizado) : null;
  // La línea "Suma lunes 17, martes 18…· actualizado hace X" se quitó: ella ya
  // sabe qué semana es y esa nota sólo recargaba la vista.
  const nota = null;

  return (
    <>
      <style>{CSS}</style>
      <Volver onVolver={onVolver} />
      <Encabezado subtitulo={subtitulo} nota={nota} />
      {tarjetaLunes}

      {/* SU fila es la tarjeta noche de esta pantalla: la cifra principal de
          "Mi cash" es su propio efectivo de la semana. El oro aparece una sola
          vez, en esa misma fila, y sólo si el premio ya está ganado. */}
      {semana.filas.map((f) => (
        <div
          key={f.id}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            background: f.esYo ? "var(--vk-noche)" : PAPEL,
            border: `1px solid ${f.esYo ? "var(--vk-metal)" : LINEA}`,
            borderRadius: 11, padding: "11px 13px", marginBottom: 5,
          }}
        >
          <span
            style={{
              fontSize: f.medalla ? 13 : 15, fontWeight: 800, width: 26, minWidth: 26,
              textAlign: "center", flexShrink: 0, overflow: "hidden",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              color: f.gano ? VERDE : TENUE,
            }}
          >
            {f.medalla || f.n}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: TITULO }}>
              {f.esYo
                ? `TÚ · ${primerNombre(vendedora.nombre)}`
                : String(f.nombre || "").split(" ").slice(0, 2).join(" ")}
            </div>
            <div style={{ fontSize: 11, color: APOYO, marginTop: 2 }}>
              {f.gano ? `✅ ganó ${peso(semana.premio)}` : `faltan ${peso(f.falta)}`}
              {f.extra ? ` · 👑 EXTRA ${peso(semana.premio)}` : ""}
            </div>
          </div>
          <span style={{
            fontWeight: 800, fontSize: 14, whiteSpace: "nowrap",
            color: f.gano ? VERDE : CIFRA,
          }}>
            {peso(f.efectivo)}
          </span>
        </div>
      ))}

      {/* Sólo aparece si HUBO empate en efectivo. En una semana normal es null
          y aquí no se pinta nada: la app no habla de empates que no pasaron.
          Cuando pasa, dice quién ganó el EXTRA y con qué criterio, para que las
          empatadas no se queden preguntando. */}
      {semana.notaDesempate && (
        <div style={{
          fontSize: 11.5, color: APOYO, fontWeight: 600, lineHeight: 1.55,
          marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${LINEA}`,
        }}>
          {semana.notaDesempate}
        </div>
      )}

      <div
        style={{
          background: fondo, border: `1px solid ${borde}`, borderRadius: 16,
          padding: "16px 18px", marginTop: 12, lineHeight: 1.6,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 5, color: tinta }}>{titulo}</div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: tinta }}>{mensaje}</div>
      </div>
    </>
  );
}
