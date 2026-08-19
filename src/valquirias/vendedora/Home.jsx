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

import { useMemo, useState } from "react";
import { useDatos } from "../data/DatosContext.jsx";
import ConfettiRain from "../common/ConfettiRain.jsx";
import {
  derivarSemanaEfectivo,
  derivarMesDeVendedora,
  derivarRankingMesCiudad,
  derivarTrimestreEnVivo,
  fechasSemanaDe,
} from "../data/derivar.js";
import { formatoPesos, primerNombre, hoyColombia, esLunesEnColombia } from "../lib/helpers.js";

// ---------------------------------------------------------------------------
// Paleta exacta del prototipo
// ---------------------------------------------------------------------------
const TINTA = "#0f172a";
const APOYO = "#475569";
const COLOR_CIUDAD = { MED: "#10b981", BOG: "#f59e0b" };
const NOMBRE_CIUDAD = { MED: "Medellín", BOG: "Bogotá" };
const PUNTO_CIUDAD = { MED: "🟢", BOG: "🟡" };

const BOTONES = {
  cash: { emoji: "💵", rotulo: "Mi cash semanal", fondo: "#f0fdf9", borde: "#b6e6d5", texto: "#046c4e", globo: "#c7f0e0" },
  mes:  { emoji: "📅", rotulo: "Mi mes",          fondo: "#fff8f1", borde: "#f6d9be", texto: "#9a4a12", globo: "#fbe3cd" },
  trim: { emoji: "💎", rotulo: "Mi trimestre",    fondo: "#f7f4ff", borde: "#ddd3f5", texto: "#5b2ec4", globo: "#e6dcfb" },
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

// Lunes de la semana ANTERIOR (para leer la semana que ya cerró el domingo)
function isoLunesPasado(isoHoy) {
  const lunes = fechasSemanaDe(isoHoy)[0];
  const d = new Date(`${lunes}T12:00:00`);
  d.setDate(d.getDate() - 7);
  const dd = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`;
}

const nombreDeFila = (fila, esYo, vendedora) =>
  esYo
    ? `TÚ · ${primerNombre(vendedora?.nombre)}`
    : (fila.nombre || "").split(" ").slice(0, 2).join(" ");

const CSS = `
.vk-gran{display:block;width:100%;text-align:left;border:1px solid;border-radius:18px;
  padding:18px 20px;margin-bottom:11px;cursor:pointer;font:inherit;
  transition:transform .12s ease,box-shadow .12s ease}
.vk-gran:hover{transform:translateY(-2px);box-shadow:0 6px 18px rgba(15,23,42,.07)}
.vk-gran:focus-visible{outline:2px solid currentColor;outline-offset:3px}
.vk-tl-cerrar:hover{opacity:1}
.vk-tl-cerrar:focus-visible{outline:2px solid currentColor;outline-offset:2px}
@media (prefers-reduced-motion:reduce){.vk-gran{transition:none}}
`;

// ---------------------------------------------------------------------------
// Tarjeta del lunes — ganadoras de la semana pasada
// ---------------------------------------------------------------------------
// `semana` es lo que devuelve derivarSemanaEfectivo() para la semana anterior.
// Si es null (el efectivo todavía no se sincroniza desde systemlap) la tarjeta
// NO se pinta: mejor no decir nada que inventar ganadoras.
function TarjetaLunes({ semana, vendedora, onCerrar }) {
  if (!semana) return null;

  const { club = [], clubCount = 0, hayExtra, gane, premio, umbral, desde, hasta } = semana;
  const soyLiderDelClub = clubCount > 0 && String(club[0].id) === String(vendedora?.id);

  if (!clubCount) {
    return (
      <div style={{ ...estiloTarjeta, background: "#f4f4f5", border: "1px solid #d9d9dd", color: "#3f3f46" }}>
        <BotonCerrar onCerrar={onCerrar} />
        <div style={estiloEyebrow}>Semana pasada</div>
        <div style={estiloTitulo}>Esta vez nadie llegó a los {peso(umbral)}</div>
        <div style={{ ...estiloNota, borderTopColor: "rgba(0,0,0,.08)" }}>
          Los {peso(premio)} quedaron sin dueña. Hoy arranca semana nueva — todas en ceros
          y el premio otra vez sobre la mesa.
        </div>
      </div>
    );
  }

  const fondo = gane ? "#fffaf0" : "#f7f7f8";
  const borde = gane ? "#f0d49a" : "#dededf";
  const tinta = gane ? "#8a5a08" : "#3f3f46";
  const titulo = gane
    ? (hayExtra && soyLiderDelClub ? "Te llevaste los dos premios 🎉" : `Ganaste tus ${peso(premio)} 🎉`)
    : "Ganaron el premio de la semana";
  const rango = rangoCorto(desde, hasta);

  return (
    <div style={{ ...estiloTarjeta, background: fondo, border: `1px solid ${borde}`, color: tinta }}>
      <BotonCerrar onCerrar={onCerrar} />
      <div style={estiloEyebrow}>Semana pasada{rango ? ` · ${rango}` : ""}</div>
      <div style={estiloTitulo}>{titulo}</div>

      {club.map((f, i) => {
        const esYo = String(f.id) === String(vendedora?.id);
        // El EXTRA sólo existe si 2+ llegaron al umbral (regla real de calcPremios)
        const monto = i === 0 && hayExtra ? premio * 2 : premio;
        return (
          <div
            key={f.id}
            style={{
              ...estiloFila,
              ...(esYo ? { background: "#fff", boxShadow: "inset 0 0 0 1.5px currentColor" } : null),
            }}
          >
            <span style={{ fontSize: 16, width: 20, textAlign: "center", flexShrink: 0 }}>
              {i === 0 && hayExtra ? "👑" : "💵"}
            </span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 800 }}>
              {nombreDeFila(f, esYo, vendedora)}
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 800, whiteSpace: "nowrap" }}>{peso(monto)}</span>
          </div>
        );
      })}

      <div style={estiloNota}>
        {hayExtra
          ? (soyLiderDelClub
              ? "Fuiste la que más efectivo vendió, así que sumaste el EXTRA. "
              : `👑 ${primerNombre(club[0].nombre)} sumó el EXTRA por ser la que más efectivo vendió. `)
          : `El EXTRA de ${peso(premio)} solo se reparte cuando llegan dos o más, así que esta vez no hubo. `}
        Hoy arranca semana nueva — todas en ceros.
      </div>
    </div>
  );
}

function BotonCerrar({ onCerrar }) {
  return (
    <button
      className="vk-tl-cerrar"
      onClick={onCerrar}
      aria-label="Cerrar el aviso de la semana pasada"
      style={{
        position: "absolute", top: 11, right: 12, background: "rgba(0,0,0,.07)", border: "none",
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
const estiloFila = { display: "flex", alignItems: "center", gap: 9, padding: "8px 11px", borderRadius: 11, marginBottom: 5, background: "rgba(255,255,255,.62)" };
const estiloNota = { fontSize: 12.5, fontWeight: 600, lineHeight: 1.55, marginTop: 11, paddingTop: 11, borderTop: "1px solid rgba(0,0,0,.09)" };

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
            : { fontSize: 27, fontWeight: 800, letterSpacing: "-.8px", lineHeight: 1, color: TINTA }
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
  const esLunes = useMemo(() => esLunesEnColombia(), []);

  const semana = useMemo(
    () => (vendedora ? derivarSemanaEfectivo(datos, vendedora) : null),
    [datos, vendedora]
  );

  const semanaPasada = useMemo(
    () => (vendedora && esLunes ? derivarSemanaEfectivo(datos, vendedora, isoLunesPasado(hoy.iso)) : null),
    [datos, vendedora, esLunes, hoy.iso]
  );

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
  // semana === null → el efectivo no se sincroniza todavía desde systemlap.
  // No se pinta un 0: se dice que el dato no está.
  const semanaArranca = esLunes && (semana?.clubCount || 0) === 0;
  let cashValor, cashPie, cashPendiente = false;
  if (!semana) {
    cashPendiente = true;
    cashValor = "Sin dato todavía";
    cashPie = "El efectivo de la semana aún no llega desde systemlap";
  } else if (semana.miEfectivo == null) {
    // El ranking de la ciudad SÍ se armó (otras ya tienen efectivo cargado),
    // pero de ella todavía no hay dato: derivarSemanaEfectivo la deja fuera de
    // `filas` y devuelve miEfectivo/faltaParaPremio en null. Pintar eso daba
    // "$0" y "Te faltan $0 para tus $50.000" — un cero que no es suyo y una
    // meta que se contradice sola.
    cashPendiente = true;
    cashValor = "Sin dato todavía";
    cashPie = "Tu efectivo de esta semana aún no llega desde systemlap";
  } else {
    cashValor = peso(semana.miEfectivo);
    cashPie = semanaArranca
      ? `Semana nueva · ${peso(semana.premio)} otra vez en juego`
      : semana.gane
        ? (semana.soyLider
            ? `Ganaste los ${peso(semana.premio)} y vas de primera por el EXTRA`
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
