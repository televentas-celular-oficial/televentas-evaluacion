// Helpers para Valquirias TLV — formato, fechas, cálculos rápidos

// ============================================================================
// UN DATO QUE NO EXISTE NO ES UN CERO
// ============================================================================
// `formatoPesos(null)` devolvía "$0" por culpa de `Number(n) || 0`. Eso hacía
// INDISTINGUIBLES dos cosas que no se parecen en nada:
//   · una comisión de $0 REAL (vendió bajo el piso de Medellín) — un hecho;
//   · una comisión que todavía no se puede calcular (ventas sin sincronizar,
//     ciudad sin cargar) — la ausencia de un hecho.
// Pintar la segunda como "$0" es acusar a la vendedora de no haber vendido.
// Con 13 personas compitiendo por plata, esa diferencia es el producto entero.
//
// Ahora: null / undefined / "" / NaN → SIN_DATO. El 0 real sigue siendo "$0".
export const SIN_DATO = "—";

// ¿Hay un número que mostrar? (0 SÍ es un dato; null/undefined/""/NaN no)
export function hayDato(n) {
  if (n === null || n === undefined || n === "") return false;
  return Number.isFinite(Number(n));
}

// $12.345.678 → "$12.3M" o "$12.345.678" según variante · sin dato → "—"
export function formatoPesos(n, opts = {}) {
  if (!hayDato(n)) return SIN_DATO;
  const val = Number(n);
  if (opts.corto) {
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}k`;
    return `$${val}`;
  }
  return "$" + val.toLocaleString("es-CO");
}

export function formatoK(n) {
  if (!hayDato(n)) return SIN_DATO;
  const val = Number(n);
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (val >= 1_000) return `$${Math.round(val / 1_000)}k`;
  return `$${val}`;
}

// Nombre corto (primer nombre)
export function primerNombre(nombre) {
  return (nombre || "").split(" ")[0] || "";
}

// Fecha hoy en Colombia
export function hoyColombia() {
  const now = new Date();
  const tz = "America/Bogota";
  const y = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric" }).format(now);
  const m = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "2-digit" }).format(now);
  const d = new Intl.DateTimeFormat("en-US", { timeZone: tz, day: "2-digit" }).format(now);
  return { año: parseInt(y, 10), mes: parseInt(m, 10), dia: parseInt(d, 10), iso: `${y}-${m}-${d}` };
}

export function fechaBonita(fecha) {
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const dias = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const d = new Date(fecha + "T12:00:00");
  return `${dias[d.getDay()]} ${d.getDate()} ${meses[d.getMonth()]}`;
}

// Diferencia en minutos desde una fecha ISO hasta ahora
export function minutosDesde(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

export function textoActualizado(iso) {
  const min = minutosDesde(iso);
  if (min == null) return "sin hora de actualización";
  if (min < 1) return "actualizado hace segundos";
  if (min < 60) return `actualizado hace ${min} min`;
  const h = Math.floor(min / 60);
  return `actualizado hace ${h}h`;
}

// Confetti pieces (18 unidades)
export const CONFETTI_PIECES = Array.from({ length: 18 }, (_, i) => {
  const colores = ["#E0B01C", "#0B5E2E", "#8A6708", "#2F3841", "#E0B01C", "#5B6472", "#0B5E2E", "#EBEDEF", "#E0B01C", "#12161C"];
  const forma = i % 3 === 0 ? "round" : i % 3 === 1 ? "thin" : "";
  return {
    id: i,
    color: colores[i % colores.length],
    forma,
    left: `${(i * 5.5) % 100}%`,
    delay: `${(i * 0.15) % 2.5}s`,
    duration: `${3 + (i % 4) * 0.3}s`,
  };
});

// Tramos de comisión 2026 (rangos EXACTOS según Luis)
// Aplica desde $0 en BOG. En MED aplica solo si ventasMes >= PISO_MED ($15M).
export const TRAMOS_2026 = [
  { min: 0,          max: 19_278_642, pctAsesora: 0.01, pctAdmin: 0.02, label: "Tramo 1" },
  { min: 19_278_643, max: 39_309_157, pctAsesora: 0.02, pctAdmin: 0.04, label: "Tramo 2" },
  { min: 39_309_158, max: Infinity,   pctAsesora: 0.03, pctAdmin: 0.06, label: "Tramo 3" },
];

export const PISO_MED = 15_000_000;

// ---------------------------------------------------------------------------
// EL PISO DE MEDELLÍN TIENE FECHA DE ARRANQUE
// ---------------------------------------------------------------------------
// Rige desde el 1-ago-2026. **Junio y julio de 2026 se pagaron SIN piso**, y
// Bogotá nunca ha tenido. Sin esta condición, abrir un mes viejo en la nómina
// le aplica una regla que entonces no existía: junio mostraba $1.108.957 cuando
// se pagaron $1.887.476, y 9 vendedora-mes salían en $0 sin deberlo. Nadie
// cobró de menos — esos meses ya se pagaron bien — pero la pantalla reescribía
// el pasado, que es justo lo que no puede hacer.
//
// Es el mismo patrón que ya protege al rol (`rolDeMes` + `fechaAscensoAdmin`):
// un mes cerrado se lee con las reglas que regían ESE mes, no con las de hoy.
//
// Se compara con año y mes numéricos a propósito: en este código conviven
// `"2026_08"` (llave de Firestore) y `{año, mes}`, y una comparación de strings
// entre los dos formatos falla en silencio.
export const PISO_MED_DESDE = { año: 2026, mes: 8 };

// ¿Aplica el piso de $15.000.000 a esta vendedora en ESE mes?
// Sin año/mes se asume que sí (comportamiento de siempre, que es el correcto
// para el mes en curso). Todo llamador que sepa el mes debe pasarlo.
export function pisoAplica(ciudad, año = null, mes = null) {
  if (ciudad !== "MED") return false;
  if (!año || !mes) return true;
  return año > PISO_MED_DESDE.año || (año === PISO_MED_DESDE.año && mes >= PISO_MED_DESDE.mes);
}

// ---------------------------------------------------------------------------
// DESEMPATE DEL BONUS SEMANAL — regla de Luis, 21-ago-2026
// ---------------------------------------------------------------------------
// El EXTRA de $50.000 sólo existe cuando hay 2 o más en el club (2+ pasaron los
// $2.500.000 en efectivo). Si dos o más empatan AL PESO arriba del club:
//
//   gana la que más lleve vendido en el MES en curso, todas las formas de pago.
//   El mes es el del DOMINGO que cierra la semana (la semana lun–dom puede
//   cruzar de mes). Si también empatan ahí, GANAN TODAS.
//
// Antes de esta regla la app no coronaba a nadie con empate — el extra quedaba
// sin dueña. Ahora sí hay ganadora salvo en el doble empate.
//
// Por qué NO se usó otra métrica (para que nadie las reproponga):
//   · Por nota mensual → el comportamiento se carga los LUNES; el domingo la
//     nota todavía no refleja la semana. Luis lo descartó.
//   · Por total vendido de esa misma semana → sería lo más coherente, pero ese
//     dato NO llega: el sync manda el efectivo por día y el total por mes.
//
// `efectivoDe` y `ventasMesDe` son accesores porque cada pantalla nombra el
// campo distinto (`valor` en derivar.js, `efectivo` en MiCash.jsx). El orden de
// `club` no importa: el tope se saca con Math.max, no con club[0].
export function resolverExtraSemanal(club, efectivoDe, ventasMesDe) {
  const vacio = { ganadorasExtra: [], lider: null, empateExtra: false };
  if (!Array.isArray(club) || club.length < 2) return vacio;

  const tope = Math.max(...club.map(efectivoDe));
  const empatadas = club.filter(f => efectivoDe(f) === tope);

  // Una sola arriba: no hay nada que desempatar.
  if (empatadas.length === 1) {
    return { ganadorasExtra: empatadas, lider: empatadas[0], empateExtra: false };
  }

  // Empate al peso → decide lo vendido en el mes del domingo.
  const topeVentas = Math.max(...empatadas.map(ventasMesDe));
  const ganan = empatadas.filter(f => ventasMesDe(f) === topeVentas);
  return {
    ganadorasExtra: ganan,
    lider: ganan.length === 1 ? ganan[0] : null,
    // true = empataron TAMBIÉN en ventas del mes, así que ganan todas ellas.
    empateExtra: ganan.length >= 2,
  };
}

// "2026-08-23" → "2026_08". La llave de mes de Firestore (`metas`) a partir de
// una fecha ISO. Se usa con el DOMINGO de la semana, que es el que manda.
export function claveMesDeFecha(iso) {
  const s = String(iso || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(0, 4)}_${s.slice(5, 7)}` : null;
}

// Devuelve el tramo aplicable según ventas totales del mes
export function tramoParaVentas(ventasMes) {
  return TRAMOS_2026.find(t => ventasMes >= t.min && ventasMes <= t.max) || TRAMOS_2026[0];
}

// Calcula la comisión mensual de UNA vendedora para un mes específico
// - ciudad: "MED" | "BOG"
// - rol: "asesora" | "admin"
// - ventasMes: número (ya viene neto de devoluciones/cambios de systemlap)
// - datosCambioRol: opcional { desde: "asesora", hasta: "admin", diaCambio: 15, diasMes: 31 }
//                   → si viene, aplica pro-rata
// - año, mes: el mes que se está liquidando. Decide si el piso de MED ya regía
//             (ver PISO_MED_DESDE). Omitirlos = tratarlo como mes vigente.
// Devuelve: { comision, tramo, aplicaPiso, aplicoPiso, detalle, proRata? }
export function calcComisionMensual({ ciudad, rol, ventasMes, datosCambioRol = null, año = null, mes = null }) {
  const aplicaPiso = pisoAplica(ciudad, año, mes);
  const pasoPiso = ventasMes >= PISO_MED;

  // Si es MED y no pasó el piso → gana $0
  if (aplicaPiso && !pasoPiso) {
    return {
      comision: 0,
      tramo: null,
      aplicaPiso: true,
      pasoPiso: false,
      detalle: `No superó el piso $${PISO_MED.toLocaleString("es-CO")} — comisión $0`,
    };
  }

  const tramo = tramoParaVentas(ventasMes);

  // Sin cambio de rol → cálculo directo
  if (!datosCambioRol) {
    const pct = rol === "admin" ? tramo.pctAdmin : tramo.pctAsesora;
    return {
      comision: Math.round(ventasMes * pct),
      tramo,
      aplicaPiso,
      pasoPiso,
      pct,
      detalle: `${(pct * 100).toFixed(0)}% × $${ventasMes.toLocaleString("es-CO")}`,
    };
  }

  // Pro-rata por cambio de rol mid-mes
  //
  // ⚠️ LÍMITE CONOCIDO — ESTO ES UN PROMEDIO, NO EL NÚMERO EXACTO.
  // Reparte las ventas TOTALES del mes de forma proporcional a los días de
  // cada rol (13 de 31 días = 13/31 de las ventas del mes), NO las ventas
  // reales que hizo en cada tramo. Se hace así porque Firestore sólo guarda el
  // acumulado del mes (`metas[YYYY_MM].vendidas[vid]`): NO existe la venta día
  // a día en esta app, así que el reparto real no se puede calcular.
  // Consecuencia: si vendió casi todo en la primera quincena (siendo asesora),
  // esta fórmula le paga de más; si vendió casi todo en la segunda (ya
  // administradora), le paga de menos. Es aritméticamente consistente
  // (las dos partes suman el 100% de las ventas) y auditable, pero nadie debe
  // leerlo como "las ventas que hizo con cada cargo".
  // El día que se sincronicen ventas por día, ESTE es el bloque a cambiar.
  const { desde, hasta, diaCambio, diasMes } = datosCambioRol;
  const diasDesde = diaCambio - 1;              // días con rol anterior
  const diasHasta = diasMes - diasDesde;         // días con rol nuevo
  const fracDesde = diasDesde / diasMes;
  const fracHasta = diasHasta / diasMes;
  const pctDesde = desde === "admin" ? tramo.pctAdmin : tramo.pctAsesora;
  const pctHasta = hasta === "admin" ? tramo.pctAdmin : tramo.pctAsesora;
  const comDesde = Math.round(ventasMes * pctDesde * fracDesde);
  const comHasta = Math.round(ventasMes * pctHasta * fracHasta);
  return {
    comision: comDesde + comHasta,
    tramo,
    aplicaPiso,
    pasoPiso,
    proRata: {
      desde: { rol: desde, dias: diasDesde, frac: fracDesde, pct: pctDesde, comision: comDesde },
      hasta: { rol: hasta, dias: diasHasta, frac: fracHasta, pct: pctHasta, comision: comHasta },
    },
    detalle: `Pro-rata: ${diasDesde}d ${desde} + ${diasHasta}d ${hasta}`,
  };
}

// Compat con código anterior
export const TRAMOS = {
  asesora: TRAMOS_2026.map(t => ({ nombre: t.label, pct: t.pctAsesora, minVentas: t.min })),
  admin:   TRAMOS_2026.map(t => ({ nombre: t.label, pct: t.pctAdmin,   minVentas: t.min })),
};

export function tramoActual(ventasMes, rol) {
  const tabla = TRAMOS[rol === "admin" ? "admin" : "asesora"];
  let ganado = null;
  for (const t of tabla) {
    if (ventasMes >= t.minVentas) ganado = t;
  }
  return ganado;
}

export function siguienteTramo(ventasMes, rol) {
  const tabla = TRAMOS[rol === "admin" ? "admin" : "asesora"];
  for (const t of tabla) {
    if (ventasMes < t.minVentas) return t;
  }
  return null;
}

export function premioTramo(ventasMes, tramo) {
  if (!tramo) return 0;
  return Math.round(ventasMes * tramo.pct);
}

// ============================================================================
// ROL HISTÓRICO — qué era la vendedora en un mes CONCRETO
// ============================================================================
// FUENTE ÚNICA DE VERDAD. Antes esta función estaba DUPLICADA LITERALMENTE en
// src/valquirias/data/derivar.js y src/valquirias/admin/NominaComisiones.jsx,
// con un comentario que decía "si se toca una, tocar la otra". Dos copias de la
// fórmula que decide plata es una bomba de tiempo: vive aquí, al lado de
// `calcComisionMensual`, que es quien la consume.
//
// La consumen las dos rutas que traducen rol → pesos:
//   · derivar.js            → lo que la vendedora ve en su boletín
//   · NominaComisiones.jsx  → lo que el dueño paga
//
// La comisión depende del rol (asesora 1/2/3% vs administradora 2/4/6%). Usar
// el rol de HOY para los 12 meses del año significaba que ascender a una
// asesora le duplicaba retroactivamente TODA su comisión del año — sobre $19M
// son ~$190.000 inventados por cada mes ya pagado.
//
// `fechaAscensoAdmin` ("YYYY-MM-DD") llega desde systemlap por el sync
// (columna `fecha_ascenso_admin`, televentas-reportes/src/sync.js:129).
export function fechaAscenso(vend) {
  const raw = vend?.fechaAscensoAdmin;
  if (!raw) return null;
  const [y, m, d] = String(raw).slice(0, 10).split("-").map(Number);
  if (!y || !m) return null;
  return { año: y, mes: m, dia: d || 1 };
}

// Devuelve { rol, datosCambioRol, historico, degradada }
//  · ascenso POSTERIOR al mes  → asesora todo el mes
//  · ascenso DENTRO del mes    → datosCambioRol para que calcComisionMensual
//    aplique la pro-rata día a día
//  · ascenso ANTERIOR al mes   → manda el `rolTienda` de HOY (ver abajo)
//  · SIN fecha → se usa el rol actual. No es un supuesto alegre: es el único
//    dato que existe. Devolver null dejaría sin comisión a casi todo el roster,
//    porque hoy la mayoría de fichas no tiene la fecha cargada. El día que
//    systemlap la cargue, este mismo código empieza a hacer la historia solo.
export function rolDeMes(vend, año, mes) {
  const rolHoy = vend?.rolTienda === "admin" ? "admin" : "asesora";
  const asc = fechaAscenso(vend);
  if (!asc) return { rol: rolHoy, datosCambioRol: null, historico: false, degradada: false };

  // Ascenso posterior a este mes → todavía era asesora
  if (asc.año > año || (asc.año === año && asc.mes > mes)) {
    return { rol: "asesora", datosCambioRol: null, historico: true, degradada: false };
  }

  // ── Ascenso ANTERIOR a este mes ──────────────────────────────────────────
  // CRITERIO (importante, cuesta plata): NO se asume "admin para siempre".
  // Si la ficha hoy dice `rolTienda: "asesora"` pero trae `fechaAscensoAdmin`,
  // se está contradiciendo: la ascendieron y después la devolvieron a asesora.
  // No existe ninguna `fechaDegradacion` en el modelo, así que NO se puede
  // saber cuándo la devolvieron. Entre las dos opciones:
  //   (a) asumir admin para siempre → le paga 2/4/6% en TODOS los meses
  //       posteriores, incluido el mes en curso, contra lo que dice su ficha;
  //   (b) respetar el cargo que la ficha afirma HOY;
  // se elige (b): es el único dato verificable, y (a) le pagaría al dueño una
  // tarifa de administradora por alguien que hoy no lo es.
  // Consecuencia asumida y consciente: los meses entre el ascenso y la
  // degradación se liquidan como asesora. Cuando systemlap guarde la fecha de
  // degradación, este es el punto exacto donde se compara.
  if (asc.año < año || (asc.año === año && asc.mes < mes)) {
    return {
      rol: rolHoy,
      datosCambioRol: null,
      historico: rolHoy === "admin",   // el rol salió de la fecha sólo si sigue siendo admin
      degradada: rolHoy !== "admin",   // true = ascendida y luego devuelta a asesora
    };
  }

  // ── Ascenso DENTRO de este mes → pro-rata ────────────────────────────────
  // Se prorratea aunque hoy figure como asesora: ese mes SÍ hubo un ascenso,
  // y una degradación posterior no borra los días que trabajó como admin.
  const diasMes = new Date(año, mes, 0).getDate();
  const diaCambio = Math.min(Math.max(asc.dia, 1), diasMes);
  // Ascendió el día 1: no hay tramo de asesora que prorratear (calcComisionMensual
  // hace diasDesde = diaCambio - 1 = 0), así que es admin el mes entero.
  if (diaCambio <= 1) return { rol: "admin", datosCambioRol: null, historico: true, degradada: false };
  return {
    rol: "admin",
    datosCambioRol: { desde: "asesora", hasta: "admin", diaCambio, diasMes },
    historico: true,
    degradada: false,
  };
}

// Etiquetas de rol para textos que lee el dueño / la vendedora
export const ROL_LARGO = { admin: "administradora", asesora: "asesora" };
export const ROL_CORTO = { admin: "Admin", asesora: "Asesora" };
// 0.02 → "2%", 0.045 → "4.5%"
export const pctTexto = (pct) =>
  (pct === null || pct === undefined ? null : `${Math.round(pct * 1000) / 10}%`);

// Días restantes hasta fin del mes actual (hora Colombia)
// Ej: si hoy es día 15 y el mes tiene 31 → devuelve 16
export function diasParaFinMes() {
  const h = hoyColombia();
  const ultimoDia = new Date(h.año, h.mes, 0).getDate(); // día 0 del siguiente = último del actual
  return Math.max(0, ultimoDia - h.dia);
}

// Nombre del mes actual en español
export function nombreMesActual() {
  const nombres = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  return nombres[hoyColombia().mes - 1];
}

// Lunes de premio: true si HOY es lunes en hora Colombia
// Se usa para mostrar el card celebratorio de ganadoras de la semana pasada
export function esLunesEnColombia() {
  const now = new Date();
  const tz = "America/Bogota";
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(now);
  return wd === "Mon";
}

// Etiqueta de rango de semana (lun-dom) para mostrar
export function rangoSemanaAnterior() {
  const now = new Date();
  const tz = "America/Bogota";
  const wdMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(now);
  const hoyIdx = wdMap[wd] ?? 0;
  // Retroceder al domingo pasado
  const diasAtras = hoyIdx === 0 ? 7 : hoyIdx;
  const dom = new Date(now); dom.setDate(now.getDate() - diasAtras);
  const lun = new Date(dom); lun.setDate(dom.getDate() - 6);
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${lun.getDate()} ${meses[lun.getMonth()]} – ${dom.getDate()} ${meses[dom.getMonth()]}`;
}

// Auto-encendido martes/viernes 6pm-12am hora Colombia
export function estaEnVentanaAutoEncendido() {
  const now = new Date();
  const tz = "America/Bogota";
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", hour12: false });
  const parts = fmt.formatToParts(now);
  const wd = parts.find(p => p.type === "weekday")?.value;
  const hh = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
  const esMarViernes = wd === "Tue" || wd === "Fri";
  return esMarViernes && hh >= 18 && hh <= 23;
}

export function proximaVentana() {
  const now = new Date();
  const tz = "America/Bogota";
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(now);
  const hh = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hour12: false }).format(now), 10);
  if (wd === "Tue" || wd === "Fri") {
    if (hh < 18) return "hoy a las 6pm";
    if (hh > 23) return wd === "Tue" ? "el viernes a las 6pm" : "el martes a las 6pm";
  }
  // Otro día
  const orden = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hoyIdx = orden[wd] ?? 0;
  // Buscar próximo mar o vie
  for (let i = 1; i <= 7; i++) {
    const nextIdx = (hoyIdx + i) % 7;
    if (nextIdx === 2) return "el martes a las 6pm";
    if (nextIdx === 5) return "el viernes a las 6pm";
  }
  return "próximamente";
}
