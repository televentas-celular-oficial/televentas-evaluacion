// Home de la vendedora — la PRIMERA pantalla que ve al abrir la app.
//
// Especificación: docs/prototipo-3-perfiles.html → vHome() + tarjetaLunes()
// (aprobado pantalla por pantalla por el dueño). Los valores de color, tamaño
// y copy salen tal cual del prototipo.
//
// Qué pinta:
//   · "Hola, <primer nombre>" + "Team Valkyrias <su ciudad>" en el color de su ciudad
//   · La TARJETA DEL LUNES con las ganadoras de la semana pasada (solo los lunes,
//     con confeti SOLO si ella ganó, y en gris sin celebración si nadie llegó)
//   · TRES botones grandes suaves con su dato principal: cash / mes / trimestre
//
// Reglas que respeta:
//   · Todo sale del motor (data/derivar.js), que a su vez delega en lib/calculos.js.
//     Aquí NO se calcula ninguna fórmula de negocio.
//   · Los meses cerrados se leen del snapshot: esta pantalla solo lee, nunca recalcula.
//   · MED tiene piso de $15.000.000, BOG no. El texto del botón "Mi mes" cambia según eso.
//   · Dato que no existe → null → la UI lo dice. NUNCA un 0 disfrazado de real.
//
// EL CASH SEMANAL SALE DE LA MISMA FUENTE QUE "Mi cash semanal":
// `armarSemana()` / `ganadorasDe()` de MiCash.jsx, que leen el documento
// `televentas/efectivo` (el que escribe el worker). Este Home llamaba a
// `derivarSemanaEfectivo()`, que buscaba el efectivo dentro de los registros
// diarios de Ingreso Diario — un campo que nunca existió, porque Ingreso Diario
// sólo guarda comportamiento. Devolvía null y el botón decía "Sin dato todavía"
// con la plata ya cargada en Firestore. Aquella función ya no existe: si alguna
// vez hace falta tocar el cash, se toca UNA sola fuente y las dos pantallas
// dicen lo mismo.

import { useMemo, useState } from "react";
import { useDatos } from "../data/DatosContext.jsx";
import ConfettiRain from "../common/ConfettiRain.jsx";
import {
  derivarMesDeVendedora,
  derivarRankingMesCiudad,
  derivarTrimestreEnVivo,
  UMBRAL_EFECTIVO_SEMANA,
  PREMIO_EFECTIVO_SEMANA,
} from "../data/derivar.js";
import { armarSemana, ganadorasDe, fechasSemana, hoyISOColombia } from "./MiCash.jsx";
import { formatoPesos, primerNombre, hoyColombia, esLunesEnColombia } from "../lib/helpers.js";

// ---------------------------------------------------------------------------
// Paleta exacta del prototipo
// ---------------------------------------------------------------------------
// Los papeles de color viven en valquirias.css (:root). Aquí sólo se nombran:
// esta pantalla ya no conoce ningún valor de color.
const V = {
  fondo: "var(--vk-fondo)",             // Lienzo — filas suaves
  tarjeta: "var(--vk-tarjeta)",         // Papel
  neutro: "var(--vk-neutro)",           // Gris de resalte — globos y tarjeta gris
  borde: "var(--vk-borde)",             // Borde
  medio: "var(--vk-medio)",             // Texto sobre gris
  secundario: "var(--vk-secundario)",   // Niebla
  nocheTexto: "var(--vk-noche-texto)",  // Tinta invertida sobre la noche
};

const TINTA = "var(--vk-titulo)";       // Tinta — títulos y texto fuerte
const CIFRA = "var(--vk-cifra)";        // Tinta — toda cifra de dinero y toda nota
const APOYO = "var(--vk-secundario)";   // Niebla — texto secundario
const NOCHE = "var(--vk-noche)";        // Una sola tarjeta por pantalla
const ORO = "var(--vk-metal)";          // Sólo sobre la tarjeta noche, y sólo si ya ganó
// Las ciudades dejan de tener color y se escriben: Medellín y Bogotá quedan en
// tinta, como texto. Ninguna vuelve a ir pintada del color de un aviso.
const COLOR_CIUDAD = { MED: TINTA, BOG: TINTA };
const NOMBRE_CIUDAD = { MED: "Medellín", BOG: "Bogotá" };
const PUNTO_CIUDAD = { MED: "🟢", BOG: "🟡" };

// Cada botón tiene SU color: menta, durazno y lavanda. Es lo que hace que los
// tres se distingan de un vistazo. Los valores viven en valquirias.css (:root).
const BOTONES = {
  cash: { emoji: "💵", rotulo: "Mi cash semanal", fondo: "var(--vk-btn-cash-fondo)", borde: "var(--vk-btn-cash-borde)", texto: "var(--vk-btn-cash-texto)", globo: "var(--vk-btn-cash-globo)" },
  mes:  { emoji: "📅", rotulo: "Mi mes",          fondo: "var(--vk-btn-mes-fondo)",  borde: "var(--vk-btn-mes-borde)",  texto: "var(--vk-btn-mes-texto)",  globo: "var(--vk-btn-mes-globo)" },
  trim: { emoji: "💎", rotulo: "Mi trimestre",    fondo: "var(--vk-btn-trim-fondo)", borde: "var(--vk-btn-trim-borde)", texto: "var(--vk-btn-trim-texto)", globo: "var(--vk-btn-trim-globo)" },
};

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const peso = (n) => formatoPesos(n);

// "28 de julio al 3 de agosto" · colapsa el mes cuando es el mismo
function rangoCorto(desde, hasta) {
  if (!desde || !hasta) return null;
  const a = new Date(`${desde}T12:00:00`);
  const b = new Date(`${hasta}T12:00:00`);
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} al ${b.getDate()} de ${MESES[b.getMonth()]}`
    : `${a.getDate()} de ${MESES[a.getMonth()]} al ${b.getDate()} de ${MESES[b.getMonth()]}`;
}

// Los 7 días (lun→dom) de la semana ANTERIOR a la que contiene `iso` — la que
// ya cerró el domingo. La aritmética va en UTC sobre días pelados, igual que en
// MiCash.jsx: un día UTC dura siempre 24 horas, así que restar 7 no puede correr
// la fecha aunque el teléfono esté en otra zona horaria.
function fechasSemanaPasadaDe(iso) {
  const [a, m, d] = fechasSemana(iso)[0].split("-").map(Number);
  const previo = new Date(Date.UTC(a, m - 1, d) - 7 * 86400000);
  const dd = (n) => String(n).padStart(2, "0");
  return fechasSemana(
    `${previo.getUTCFullYear()}-${dd(previo.getUTCMonth() + 1)}-${dd(previo.getUTCDate())}`
  );
}

const nombreDeFila = (fila, esYo, vendedora) =>
  esYo
    ? `TÚ · ${primerNombre(vendedora?.nombre)}`
    : (fila.nombre || "").split(" ").slice(0, 2).join(" ");

const CSS = `
.vk-gran{display:block;width:100%;text-align:left;border:1px solid;border-radius:18px;
  padding:18px 20px;margin-bottom:11px;cursor:pointer;font:inherit;
  transition:transform .12s ease,box-shadow .12s ease}
.vk-gran:hover{transform:translateY(-2px);box-shadow:0 6px 18px rgba(var(--vk-sombra-rgb),.07)}
.vk-gran:focus-visible{outline:2px solid currentColor;outline-offset:3px}
.vk-tl-cerrar:hover{opacity:1}
.vk-tl-cerrar:focus-visible{outline:2px solid currentColor;outline-offset:2px}
@media (prefers-reduced-motion:reduce){.vk-gran{transition:none}}
`;

// ---------------------------------------------------------------------------
// Tarjeta del lunes — ganadoras de la semana pasada
// ---------------------------------------------------------------------------
// `semana` es lo que devuelve `resumenLunes()` (más abajo), que adapta la salida
// de `ganadorasDe()` de MiCash.jsx. Si es null — esa semana no tiene ni un día
// procesado en el doc de efectivo — la tarjeta NO se pinta: mejor no decir nada
// que inventar ganadoras.
function TarjetaLunes({ semana, vendedora, onCerrar }) {
  if (!semana) return null;

  const { club = [], clubCount = 0, hayExtra, empateExtra, lider,
    ganadorasExtra = [], gane, premio, umbral, desde, hasta } = semana;
  const idLider = lider ? String(lider.id) : null;
  const soyLiderDelClub = !!(idLider && idLider === String(vendedora?.id));
  // Con doble empate no hay `lider`, pero sí varias que se llevan el EXTRA.
  const estoyEnElExtra = ganadorasExtra.some(g => String(g.id) === String(vendedora?.id));
  const nombresExtra = ganadorasExtra.map(g => primerNombre(g.nombre)).join(" y ");

  if (!clubCount) {
    return (
      <div style={{ ...estiloTarjeta, background: V.neutro, border: `1px solid ${V.borde}`, color: V.medio }}>
        <BotonCerrar onCerrar={onCerrar} />
        <div style={estiloEyebrow}>Semana pasada</div>
        <div style={estiloTitulo}>Esta vez nadie llegó a los {peso(umbral)}</div>
        <div style={{ ...estiloNota, borderTopColor: "rgba(var(--vk-sombra-rgb),.10)" }}>
          Los {peso(premio)} quedaron sin dueña. Hoy arranca semana nueva — todas en ceros
          y el premio otra vez sobre la mesa.
        </div>
      </div>
    );
  }

  // LA TARJETA NOCHE DEL HOME. Sólo cuando el premio YA ESTÁ GANADO: ahí, y sólo
  // ahí, aparece el oro de la pantalla. Si ganaron otras, la misma tarjeta va en
  // papel — la noticia es buena, pero la cifra principal no es suya.
  const fondo = gane ? NOCHE : V.tarjeta;
  const borde = gane ? NOCHE : V.borde;
  const tinta = gane ? V.nocheTexto : TINTA;
  const fondoFila = gane ? "rgba(var(--vk-velo-rgb),.07)" : V.fondo;
  const fondoFilaYo = gane ? "rgba(var(--vk-metal-rgb),.12)" : V.tarjeta;
  const lineaNota = gane ? "rgba(var(--vk-velo-rgb),.18)" : "rgba(var(--vk-sombra-rgb),.10)";
  const titulo = gane
    ? (hayExtra && soyLiderDelClub ? "Te llevaste los dos premios 🎉" : `Ganaste tus ${peso(premio)} 🎉`)
    : "Ganaron el premio de la semana";
  const rango = rangoCorto(desde, hasta);

  return (
    <div style={{ ...estiloTarjeta, background: fondo, border: `1px solid ${borde}`, color: tinta }}>
      <BotonCerrar onCerrar={onCerrar} oscura={gane} />
      <div style={estiloEyebrow}>Semana pasada{rango ? ` · ${rango}` : ""}</div>
      <div style={{ ...estiloTitulo, color: gane ? ORO : TINTA }}>{titulo}</div>

      {club.map((f, i) => {
        const esYo = String(f.id) === String(vendedora?.id);
        // El EXTRA sólo existe si 2+ llegaron al umbral (regla real de
        // calcPremios) Y no hay empate arriba: con empate `lider` viene null y
        // nadie cobra doble.
        const esLider = !!(idLider && String(f.id) === idLider);
        const monto = hayExtra && esLider ? premio * 2 : premio;
        return (
          <div
            key={f.id}
            style={{
              ...estiloFila,
              background: fondoFila,
              ...(esYo ? { background: fondoFilaYo, boxShadow: "inset 0 0 0 1.5px currentColor" } : null),
            }}
          >
            <span style={{ fontSize: 16, width: 20, textAlign: "center", flexShrink: 0 }}>
              {hayExtra && esLider ? "👑" : "💵"}
            </span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 800 }}>
              {nombreDeFila(f, esYo, vendedora)}
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 800, whiteSpace: "nowrap" }}>{peso(monto)}</span>
          </div>
        );
      })}

      <div style={{ ...estiloNota, borderTopColor: lineaNota }}>
        {/* El orden importa: `empateExtra` va PRIMERO porque ahora implica que
            sí hubo EXTRA (lo ganan todas las empatadas) y en ese caso `lider`
            viene en null — leer `lider.nombre` ahí rompía la tarjeta. */}
        {empateExtra
          ? (estoyEnElExtra
              ? `Quedaste empatada arriba en efectivo y en ventas del mes, así que el EXTRA de ${peso(premio)} fue para las dos. `
              : `👑 ${nombresExtra} quedaron empatadas hasta en ventas del mes, así que el EXTRA de ${peso(premio)} fue para ambas. `)
          : hayExtra
            ? (soyLiderDelClub
                ? "Fuiste la que más efectivo vendió, así que sumaste el EXTRA. "
                : `👑 ${primerNombre(lider.nombre)} sumó el EXTRA por ser la que más efectivo vendió. `)
            : `El EXTRA de ${peso(premio)} solo se reparte cuando llegan dos o más, así que esta vez no hubo. `}
        Hoy arranca semana nueva — todas en ceros.
      </div>
    </div>
  );
}

function BotonCerrar({ onCerrar, oscura = false }) {
  return (
    <button
      className="vk-tl-cerrar"
      onClick={onCerrar}
      aria-label="Cerrar el aviso de la semana pasada"
      style={{
        position: "absolute", top: 11, right: 12,
        background: oscura ? "rgba(var(--vk-velo-rgb),.16)" : "rgba(var(--vk-sombra-rgb),.07)", border: "none",
        width: 25, height: 25, borderRadius: "50%", font: "inherit", fontSize: 14, lineHeight: 1,
        cursor: "pointer", color: "inherit", opacity: 0.65,
      }}
    >
      ×
    </button>
  );
}

const estiloTarjeta = { borderRadius: 18, padding: "17px 18px 15px", marginBottom: 16, position: "relative", overflow: "hidden" };
const estiloEyebrow = { fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "1.1px", opacity: 0.8 };
const estiloTitulo = { fontSize: 18, fontWeight: 800, letterSpacing: "-.3px", margin: "5px 0 12px", paddingRight: 26 };
const estiloFila = { display: "flex", alignItems: "center", gap: 9, padding: "8px 11px", borderRadius: 11, marginBottom: 5, background: V.fondo };
const estiloNota = { fontSize: 12.5, fontWeight: 600, lineHeight: 1.55, marginTop: 11, paddingTop: 11, borderTop: "1px solid rgba(var(--vk-sombra-rgb),.10)" };

// ---------------------------------------------------------------------------
// Botón grande
// ---------------------------------------------------------------------------
function BotonGrande({ tipo, valor, valorPendiente, pie, onIr }) {
  const c = BOTONES[tipo];
  return (
    <button
      className="vk-gran"
      onClick={() => onIr?.(tipo)}
      style={{ background: c.fondo, borderColor: c.borde }}
      aria-label={c.rotulo}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 12 }}>
        <span
          aria-hidden="true"
          style={{
            width: 38, height: 38, borderRadius: "50%", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 19, flexShrink: 0, background: c.globo,
          }}
        >
          {c.emoji}
        </span>
        <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: "-.2px", color: c.texto }}>{c.rotulo}</span>
        <span aria-hidden="true" style={{ marginLeft: "auto", fontSize: 20, fontWeight: 800, opacity: 0.45, color: c.texto }}>›</span>
      </div>
      <div
        style={
          valorPendiente
            ? { fontSize: 16, fontWeight: 800, lineHeight: 1.2, color: APOYO }
            : { fontSize: 27, fontWeight: 800, letterSpacing: "-.8px", lineHeight: 1, color: CIFRA }
        }
      >
        {valor}
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 6, lineHeight: 1.5, color: c.texto }}>{pie}</div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------
export default function Home({ vendedora, onIr }) {
  const datos = useDatos();
  const [lunesCerrada, setLunesCerrada] = useState(false);

  const hoy = useMemo(() => hoyColombia(), []);
  const hoyISO = useMemo(() => hoyISOColombia(), []);
  const esLunes = useMemo(() => esLunesEnColombia(), []);

  // Los 7 días de la semana en curso, hora Colombia (misma función que MiCash).
  const fechasEstaSemana = useMemo(() => fechasSemana(hoyISO), [hoyISO]);

  // LA MISMA fuente que "Mi cash semanal": el doc `televentas/efectivo`.
  // Devuelve { ok:true, … } o { ok:false, motivo } — nunca null, nunca ceros.
  const semana = useMemo(
    () => (vendedora
      ? armarSemana({
          efectivoDoc: datos.efectivo,
          vendedoras: datos.vendedoras,
          vendedora,
          fechas: fechasEstaSemana,
          metas: datos.metas,
        })
      : null),
    [datos.efectivo, datos.vendedoras, datos.metas, vendedora, fechasEstaSemana]
  );

  // Ganadoras de la semana que cerró el domingo, sólo los lunes.
  // `ganadorasDe` devuelve { ganadoras, extra, desde, hasta }; TarjetaLunes
  // espera { club, clubCount, hayExtra, gane, premio, umbral }. Aquí se traduce.
  const semanaPasada = useMemo(() => {
    if (!vendedora?.ciudad || !esLunes) return null;
    const r = ganadorasDe({
      efectivoDoc: datos.efectivo,
      vendedoras: datos.vendedoras,
      ciudad: vendedora.ciudad,
      fechas: fechasSemanaPasadaDe(hoyISO),
      metas: datos.metas,
    });
    // null = esa semana no tiene ni un día procesado (o no hay equipo de su
    // ciudad). No se pinta tarjeta: no hay nada verdadero que contar.
    if (!r) return null;

    const club = r.ganadoras || [];
    // `extra` es la ganadora única del EXTRA; viene en null sólo cuando hubo
    // DOBLE empate (mismo efectivo y mismas ventas del mes) — y ahí `extras`
    // trae a todas las que se lo llevan, porque ganan todas.
    const extras = r.extras || [];
    return {
      club,
      clubCount: club.length,
      lider: r.extra || null,
      hayExtra: extras.length > 0,
      empateExtra: extras.length >= 2,
      ganadorasExtra: extras,
      gane: club.some((g) => String(g.id) === String(vendedora.id)),
      premio: PREMIO_EFECTIVO_SEMANA,
      umbral: UMBRAL_EFECTIVO_SEMANA,
      desde: r.desde,
      hasta: r.hasta,
    };
  }, [datos.efectivo, datos.vendedoras, datos.metas, vendedora, esLunes, hoyISO]);

  const mes = useMemo(
    () => (vendedora ? derivarMesDeVendedora(datos, vendedora, hoy.año, hoy.mes) : null),
    [datos, vendedora, hoy.año, hoy.mes]
  );

  // ¿EXISTE el dato de ventas del mes?
  // `mes.ventas` NO sirve para responder esto: viene de calcNotaMensual, que
  // hace `real = vendidas[vid] ?? 0` (src/lib/calculos.js:282) y devuelve un
  // CERO DURO cuando el dato no ha llegado. Por eso el Home pintaba "$0" y
  // "te faltan $15.000.000 para el piso" mientras Mi mes decía "todavía no
  // están disponibles": dos pantallas, dos verdades, y la del Home acusaba a
  // la vendedora de no haber vendido nada.
  // La existencia se decide con derivarRankingMesCiudad, que sí distingue el
  // null del cero (`misVentas`) — EL MISMO guard que usa MiMes.jsx:215.
  const rkMes = useMemo(
    () => (vendedora ? derivarRankingMesCiudad(datos, vendedora, hoy.año, hoy.mes) : null),
    [datos, vendedora, hoy.año, hoy.mes]
  );
  const hayVentasMes = !!(rkMes?.disponible && rkMes?.misVentas != null);

  const trim = useMemo(
    () => (vendedora ? derivarTrimestreEnVivo(datos, vendedora, hoy.año, Math.ceil(hoy.mes / 3)) : null),
    [datos, vendedora, hoy.año, hoy.mes]
  );

  if (!vendedora) {
    return (
      <div style={{ padding: "24px 4px", color: APOYO, fontSize: 14, fontWeight: 700, lineHeight: 1.6 }}>
        Todavía no se puede identificar a la vendedora, así que no hay nada que mostrar.
        Escríbele al administrador.
      </div>
    );
  }

  const ciudad = vendedora.ciudad;
  const colorCiudad = COLOR_CIUDAD[ciudad] || APOYO;

  // --- Botón 1: Mi cash semanal --------------------------------------------
  // `armarSemana` NUNCA devuelve null: o `{ ok:true, … }` o `{ ok:false, motivo }`.
  // Cuando no se puede armar el ranking se imprime SU motivo, que dice
  // exactamente qué falta (la ciudad, el doc, un día procesado, el equipo) en vez
  // del genérico "el efectivo aún no llega".
  // "Arranca la semana" sólo si todas están de verdad en cero, no por ser lunes.
  const semanaArranca = esLunes && !!semana?.ok && semana.filas.every((f) => f.efectivo === 0);
  let cashValor, cashPie, cashPendiente = false;
  if (!datos.cargado) {
    // Mientras los documentos no hayan llegado no se afirma nada: un estado
    // vacío prematuro se lee como "no vendiste".
    cashPendiente = true;
    cashValor = "Cargando…";
    cashPie = "Buscando el efectivo de la semana";
  } else if (!semana?.ok) {
    cashPendiente = true;
    cashValor = "Sin dato todavía";
    cashPie = semana?.motivo
      || "El efectivo de la semana todavía no ha llegado desde systemlap.";
  } else if (semana.miEfectivo == null) {
    // El ranking de su ciudad SÍ se armó, pero ella no aparece en él: no es que
    // falte su dato, es que `participantes()` no la tiene compitiendo esta
    // semana (eventual o ya no activa). Pintar "$0" y "te faltan $2.500.000"
    // sería un cero que no es suyo y una meta que ella no está corriendo.
    cashPendiente = true;
    cashValor = "No estás en el concurso";
    cashPie = "No apareces entre las que compiten esta semana · escríbele al administrador";
  } else {
    cashValor = peso(semana.miEfectivo);
    cashPie = semanaArranca
      ? `Semana nueva · ${peso(semana.premio)} otra vez en juego`
      : semana.gane
        ? (semana.voyPrimeraDelClub
            ? (semana.hayExtra
                ? `Ganaste los ${peso(semana.premio)} y vas de primera por el EXTRA`
                : `Ganaste los ${peso(semana.premio)} · el EXTRA se activa cuando llegue otra`)
            : `Ya tienes tus ${peso(semana.premio)} · pelea por el EXTRA`)
        : semana.faltaParaPremio != null
          ? `Te faltan ${peso(semana.faltaParaPremio)} para tus ${peso(semana.premio)}`
          : `${peso(semana.premio)} en juego esta semana`;
  }

  // --- Botón 2: Mi mes ------------------------------------------------------
  // El piso de $15.000.000 SOLO aplica en Medellín; Bogotá gana desde el primer peso.
  let mesValor, mesPie, mesPendiente = false;
  // La nota FINAL necesita las dos mitades (comportamiento y ventas). Mientras
  // falte la de ventas, `mes.nota` viene en null a propósito — antes venía como
  // un 2.36 armado con un cero inventado (ver src/lib/calculos.js). Lo que sí
  // existe y sí es suyo es el comportamiento, así que es lo que se nombra.
  const notaTxt = mes?.nota != null
    ? `Nota ${mes.nota.toFixed(2)}`
    : mes?.notaComportamiento != null
      ? `Comportamiento ${mes.notaComportamiento.toFixed(2)}`
      : "Nota no disponible";
  if (!mes || !hayVentasMes) {
    // Sin dato de ventas NO se pinta cifra, ni piso, ni comisión: los tres
    // saldrían de un cero que nadie registró. El comportamiento SÍ es real (sale
    // de los indicadores del día) y se muestra, igual que en Mi mes.
    mesPendiente = true;
    mesValor = "Sin dato todavía";
    // Se dice explícitamente que falta un dato del SISTEMA. "Aún no están
    // disponibles" a secas se puede leer como "no has vendido".
    mesPie = mes
      ? `${notaTxt} · falta que lleguen tus ventas de ${mes.nombreMes} para tu nota`
      : "Las ventas del mes aún no llegan del sistema";
  } else {
    mesValor = peso(mes.ventas);
    // El piso ($15.000.000) sólo aplica en Medellín. `mes.piso` es null cuando
    // no se pudo resolver la ciudad: ahí no se afirma ni se niega el piso.
    const cola = mes.piso?.aplica && !mes.piso.superado
      ? (mes.piso.falta != null ? `te faltan ${peso(mes.piso.falta)} para el piso` : null)
      // "llevas X" sólo si la comisión EXISTE. Con ciudad sin cargar viene en
      // null y decía "llevas $0", que es acusarla de no haber ganado nada.
      : (mes.comision != null && mes.tramoInfo)
        ? `${mes.tramoInfo.nombre} · llevas ${peso(mes.comision)}`
        : mes.ciudadDesconocida
          ? "falta tu ciudad para poder calcular tu comisión"
          : null;
    mesPie = cola ? `${notaTxt} · ${cola}` : notaTxt;
  }

  // --- Botón 3: Mi trimestre ------------------------------------------------
  // Quien entró con el trimestre ya arrancado NO participa en el premio
  // trimestral (regla del dueño; la decide elegibilidadTrimestral y la explica
  // bien Mi trimestre). El botón prometía "Q3 en vivo · sube todos los días",
  // o sea una disputa en la que ella no está. Su nota se sigue mostrando
  // porque es real y le sirve de referencia — lo que no existe es el premio.
  // Tono: es calendario, no una falta suya, y el próximo trimestre entra igual
  // que todas.
  const noCompiteTrim = !!(trim && trim.compite === false);
  let trimValor, trimPie, trimPendiente = false;
  if (!trim || trim.nota == null) {
    trimPendiente = true;
    trimValor = "Sin nota todavía";
    trimPie = !trim
      ? "El trimestre aún no está disponible"
      : !noCompiteTrim
        ? `${trim.q} arranca cuando haya el primer mes con datos`
        : trim.motivoNoCompite === "entroTarde"
          ? `${trim.q} ya venía empezado · entras en la disputa desde el próximo`
          : `${trim.q} no entra en el reparto del premio · toca para ver por qué`;
  } else if (noCompiteTrim) {
    trimValor = trim.nota.toFixed(2);
    trimPie = trim.motivoNoCompite === "entroTarde"
      ? `${trim.q} ya venía empezado — esta nota es tuya, de referencia. Desde el próximo entras en la disputa en igualdad`
      : trim.motivoNoCompite === "eventual" || trim.motivoNoCompite === "inactiva"
        ? `Tu vinculación no entra en el premio de ${trim.q} — esta nota es tuya, de referencia`
        : `${trim.q} no entra en el reparto del premio — esta nota es tuya, de referencia. Toca para ver por qué`;
  } else {
    trimValor = trim.nota.toFixed(2);
    const ultimo = trim.meses?.[2]?.nombre;
    trimPie = ultimo
      ? `${trim.q} en vivo · sube todos los días hasta ${ultimo.toLowerCase()}`
      : `${trim.q} en vivo · sube todos los días`;
  }

  const mostrarLunes = esLunes && !lunesCerrada && !!semanaPasada;

  return (
    <>
      <style>{CSS}</style>

      {/* Confeti SOLO si ella ganó la semana pasada */}
      <ConfettiRain trigger={mostrarLunes && semanaPasada.gane} />

      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.6px", color: TINTA, margin: "4px 0 2px" }}>
        Hola, {primerNombre(vendedora.nombre)}
      </div>
      {/* Sin ciudad NO se inventa una: cambiaría las reglas del premio (el piso
          de $15.000.000 es sólo de Medellín). Se rotula el equipo a secas y el
          botón de "Mi mes" dice que falta la ciudad. */}
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 20, color: colorCiudad }}>
        {[PUNTO_CIUDAD[ciudad] || "⚪", "Team Valkyrias", NOMBRE_CIUDAD[ciudad]]
          .filter(Boolean)
          .join(" ")}
      </div>

      {mostrarLunes && (
        <TarjetaLunes
          semana={semanaPasada}
          vendedora={vendedora}
          onCerrar={() => setLunesCerrada(true)}
        />
      )}

      <BotonGrande tipo="cash" valor={cashValor} valorPendiente={cashPendiente} pie={cashPie} onIr={onIr} />
      <BotonGrande tipo="mes"  valor={mesValor}  valorPendiente={mesPendiente}  pie={mesPie}  onIr={onIr} />
      <BotonGrande tipo="trim" valor={trimValor} valorPendiente={trimPendiente} pie={trimPie} onIr={onIr} />
    </>
  );
}
