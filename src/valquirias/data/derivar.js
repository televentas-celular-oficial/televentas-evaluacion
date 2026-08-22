// MOTOR DE DERIVACIÓN — Valquirias TLV
// ============================================================================
// Convierte los docs crudos de Firestore (registros / metas / vendedoras /
// snapshots / config) en los datos que pintan las pantallas.
//
// REGLA #1: los cálculos de nota NO se reimplementan aquí. Se delegan en
// src/lib/calculos.js (calcMes, calcNotaMensual, calcRanking, calcTrimestre,
// calcPremios), que es la fuente de verdad que usa la app clásica. Este archivo
// sólo FORMATEA y AGRUPA lo que esas funciones devuelven.
//
// REGLA #2: dato ausente ≠ cero. Si algo genuinamente no existe en Firestore
// (p.ej. ventas del día, que hoy no se sincronizan), se devuelve `null` y un
// flag `disponible:false` para que la UI diga "no disponible" en vez de pintar
// un $0 que la vendedora leería como "no vendí nada".
//
// FORMA DE LOS DATOS CRUDOS (recordatorio):
//   registros = { "4_2026-08-05": { vid, fecha, descanso, minutos, resenas,
//                                   tienda_orden|tienda_uniforme|tienda_deposito,
//                                   planilla, actitud, actitud_nota }, ... }
//   metas     = { "2026_08": { meta: {MED,BOG}|number, vendidas: { [vid]: n } } }
//   snapshots = { "2026_08": { vendedoras: { [vid]: {notaBase, notaFinal, ...} } } }
//   config    = { rankingVisible, premiosTrim: { "2026_Q3": {montoBase,...} } }
// ============================================================================

import {
  calcMes,
  calcNotaMensual,
  calcRanking,
  calcTrimestre,
  calcPremios,
  elegibilidadTrimestral,
  participantes,
  rosterCongeladoTrimestre,
  claveMes as claveMesLib,
  mesesTrimestre,
  metaParaCiudad,
  notaIndicador,
  indicadoresDelMes,
} from "../../lib/calculos.js";
import { getIndicadores, esFormulaV2, PESOS_TRIMESTRE } from "../../lib/constantes.js";
// El doc `televentas/efectivo` mezcla `_meta` con los días: `esDiaEfectivo` es
// el único filtro autorizado para recorrer sus llaves (fuente única).
import { esDiaEfectivo } from "./DatosContext.jsx";
import {
  calcComisionMensual,
  hoyColombia,
  formatoK,
  formatoPesos,
  fechaBonita,
  primerNombre,
  tramoActual,
  siguienteTramo,
  tramoParaVentas,
  tramosDe,
  PISO_MED,
  pisoAplica,
  resolverExtraSemanal,
  claveMesDeFecha,
  // Rol histórico: vive en helpers.js (fuente única), no duplicado aquí.
  rolDeMes,
  ROL_LARGO,
  pctTexto,
} from "../lib/helpers.js";

const MES_NOMBRES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// Salario base mensual 2026 (acordado con Luis)
export const SALARIO_BASE_MES = 2_000_000;
// Umbral del premio semanal de efectivo
export const UMBRAL_EFECTIVO_SEMANA = 2_500_000;
export const PREMIO_EFECTIVO_SEMANA = 50_000;

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

const dosDig = (n) => String(n).padStart(2, "0");
const claveMesLocal = (año, mes) => `${año}_${dosDig(mes)}`;
const claveRegistro = (vid, fechaISO) => `${vid}_${fechaISO}`;
const nombreMes = (mes) => MES_NOMBRES[mes - 1] || "";

// ----------------------------------------------------------------------------
// ROSTERS — hay TRES y confundirlos cuesta plata
// ----------------------------------------------------------------------------
//
//  1. Roster COMPLETO (`rosterCompleto`) — el crudo de Firestore, con inactivas
//     y eventuales. Es el roster de CÁLCULO: sin la ficha de alguien no hay
//     ciudad (→ meta null en calculos.js) ni rol (→ comisión inventada), así que
//     todos los meses que ya trabajó dejarían de poder reconstruirse. El worker
//     de systemlap marca `eventual = true` a quien sale de la operación
//     justamente "para NO perder su historial"
//     (televentas-reportes/src/sync.js:166). Es también el mismo conjunto que
//     CerrarMes.jsx congela en el snapshot.
//
//  2. Roster VIVO — quién participa HOY en un ranking abierto. Sale SIEMPRE de
//     `participantes()` (lib/calculos.js), nunca de un filtro escrito aquí.
//
//  3. Roster CONGELADO — quién participaba en un periodo YA CERRADO. Son las que
//     quedaron escritas en los snapshots. `participantes()` lo detecta solo y NO
//     les aplica `activa`/`eventual`: desactivar a alguien hoy no puede mover el
//     ranking de julio ni el premio de un trimestre cerrado.
//
// `rosterUtil` se mantiene sólo para (1). Para (2) y (3) → `rosterParticipa`.
function rosterUtil(datos, { incluirInactivas = false, incluirEventuales = incluirInactivas } = {}) {
  return (datos?.vendedoras || []).filter(v =>
    (incluirEventuales || !v.eventual) && (incluirInactivas || v.activa !== false)
  );
}

// El roster CRUDO completo — el que hay que pasarle siempre al motor.
const rosterCompleto = (datos) => rosterUtil(datos, { incluirInactivas: true });

// ÚNICA puerta de participación de este archivo. Delega en `participantes()`
// (lib/calculos.js), que es la misma función que usa la pantalla del dueño.
//   alcance: "semanal" | "mensual" | "trimestral"
//   extra:   { ciudad, año, mes, q }
function rosterParticipa(datos, alcance, extra = {}) {
  const completo = rosterCompleto(datos);
  return participantes(completo, alcance, {
    registros: datos?.registros || {},
    metas: datos?.metas || {},
    snapshots: datos?.snapshots || {},
    rosterCalculo: completo,
    ...extra,
  });
}

// ----------------------------------------------------------------------------
// ROL HISTÓRICO — vive en src/valquirias/lib/helpers.js (`rolDeMes`)
// ----------------------------------------------------------------------------
// Estaba duplicado literalmente aquí y en admin/NominaComisiones.jsx. Ahora hay
// UNA sola copia, junto a `calcComisionMensual`, que es quien la consume: la
// cifra que ve la vendedora y la que paga el dueño salen del mismo código.

// ----------------------------------------------------------------------------
// VERSIÓN DE FÓRMULA DE UN MES — del snapshot si está cerrado
// ----------------------------------------------------------------------------
// El cierre escribe `version` en el snapshot (CerrarMes.jsx). Leer
// `esFormulaV2(año, mes)` vivo para un mes cerrado significa que mover
// FECHA_CORTE_V2 reetiqueta meses ya publicados (un mes que la vendedora vio
// como 70/30 pasaría a pintarse 40/60).
function versionDeMes(datos, año, mes) {
  const v = datos?.snapshots?.[claveMesLocal(año, mes)]?.version;
  if (v === "v1" || v === "v2") return v;
  return esFormulaV2(año, mes) ? "v2" : "v1";
}

// Lee un campo numérico tolerando varios nombres posibles.
// Devuelve null si NINGUNO existe (dato ausente) — nunca 0 inventado.
function campoNum(obj, nombres) {
  if (!obj) return null;
  for (const n of nombres) {
    const v = obj[n];
    if (v === null || v === undefined || v === "") continue;
    const num = Number(v);
    if (!Number.isNaN(num)) return num;
  }
  return null;
}

const CAMPOS_VENTAS = ["ventas", "ventasDia", "ventas_dia", "vendido", "venta"];
const CAMPOS_EFECTIVO = ["efectivo", "efectivoDia", "efectivo_dia"];
const CAMPOS_TICKETS = ["tickets", "ticketsDia", "numTickets", "facturas"];

// Todos los registros de una vendedora en un mes, ordenados por fecha.
// Devuelve [{ fecha, reg }] — incluye los días de descanso.
export function registrosDeMes(registros, vid, año, mes) {
  const pref = `${vid}_${año}-${dosDig(mes)}`;
  return Object.entries(registros || {})
    .filter(([k]) => k.startsWith(pref))
    .map(([k, reg]) => ({ fecha: reg?.fecha || k.slice(String(vid).length + 1), reg }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// Fechas ISO (lun→dom) de la semana que contiene `isoRef`.
export function fechasSemanaDe(isoRef) {
  const base = new Date(`${isoRef}T12:00:00`);
  const dow = base.getDay();                 // 0=dom
  const offsetLunes = dow === 0 ? -6 : 1 - dow;
  const lunes = new Date(base);
  lunes.setDate(base.getDate() + offsetLunes);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lunes);
    d.setDate(lunes.getDate() + i);
    return `${d.getFullYear()}-${dosDig(d.getMonth() + 1)}-${dosDig(d.getDate())}`;
  });
}

// ¿El mes está cerrado (tiene snapshot) para esta vendedora?
function mesCerrado(datos, vid, año, mes) {
  const snap = datos?.snapshots?.[claveMesLocal(año, mes)];
  return !!(snap && snap.vendedoras && snap.vendedoras[vid]);
}

// ----------------------------------------------------------------------------
// ¿ESTE TRIMESTRE YA ESTÁ CERRADO?
// ----------------------------------------------------------------------------
// Cerrado = sus 3 meses tienen snapshot. Es la señal de "esto ya es historia":
// el roster y la ganadora quedan congelados y no se recalculan con el estado de
// hoy. `participantes()` lo detecta solo; esto es para poder pasárselo a
// `calcPremios`, que necesita saberlo para NO quitarle el premio de un trimestre
// pasado a quien salió de la operación después.
export function esTrimestreCerrado(datos, año, q) {
  return rosterCongeladoTrimestre(rosterCompleto(datos), año, q, datos?.snapshots || {}) !== null;
}
const trimestreCerrado = esTrimestreCerrado;

// Roster de la ciudad para un trimestre. Una sola llamada resuelve todo:
//  · trimestre EN CURSO → sólo activas, que entraron antes o el mismo día del
//    inicio del trimestre, y con los meses ya cerrados hechos (R1+R3+R4).
//  · trimestre CERRADO  → el roster congelado de sus snapshots, sin aplicar
//    `activa` (eso reescribiría la historia).
function rosterCiudadTrimestre(datos, ciudad, año, q) {
  return rosterParticipa(datos, "trimestral", { ciudad: ciudad || null, año, q });
}

function estadoDeNota(nota) {
  if (nota === null || nota === undefined) return "good";
  if (nota >= 4.9) return "star";
  if (nota >= 4.0) return "good";
  return "warn";
}

const plural = (n, sing, plu) => `${n} ${n === 1 ? sing : plu}`;

// "Lunes 4" — la etiqueta de día que usa el prototipo en el desglose día a día.
const DIAS_LARGOS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
function diaLargo(fechaISO) {
  const d = new Date(`${fechaISO}T12:00:00`);
  return `${DIAS_LARGOS[d.getDay()]} ${d.getDate()}`;
}

const dosDec = (n) => (n === null || n === undefined ? null : Math.round(n * 100) / 100);

// Nota que hay que alcanzar en el trimestre para el premio (regla del dueño).
export const META_NOTA_TRIMESTRE = 4.5;

// Acepta tanto el objeto vendedora como el id pelado.
const idDe = (v) => (v && typeof v === "object" ? v.id : v);

// Devuelve SIEMPRE un objeto vendedora (busca en el roster si llega un id).
// Si no está en el roster devuelve un objeto mínimo — nunca revienta.
function vendedoraDe(datos, v) {
  if (v && typeof v === "object") return v;
  const enRoster = rosterUtil(datos, { incluirInactivas: true }).find(x => x.id === v);
  return enRoster || { id: v, nombre: "", ciudad: null };
}

// Mes anterior a (año, mes) — cruza el cambio de año.
const mesAnterior = (año, mes) => (mes === 1 ? { año: año - 1, mes: 12 } : { año, mes: mes - 1 });

// Los 3 argumentos crudos que piden todas las funciones de calculos.js
function fuentes(datos) {
  return {
    registros: datos?.registros || {},
    metas: datos?.metas || {},
    snapshots: datos?.snapshots || {},
    roster: rosterUtil(datos, { incluirInactivas: true }),
  };
}

// ============================================================================
// TEXTOS DE DETALLE POR INDICADOR (lo que la clásica muestra bajo el nombre)
// ============================================================================
export function textoDetalleIndicador(indId, detalle, extra = {}) {
  const d = detalle || {};
  const dias = extra.dias || 0;

  if (indId === "puntualidad") {
    const diasTarde = d.diasTarde || 0;
    const graves = d.diasGraves || 0;
    const min = d.minutosAcum || 0;
    if (!diasTarde && !min) return "Sin retardos este mes ✅";
    const partes = [plural(diasTarde, "retardo", "retardos"), `${min} min acumulados`];
    if (graves > 0) partes.push(`${plural(graves, "día grave", "días graves")} (≥10 min)`);
    return partes.join(" · ");
  }

  if (indId === "resenas") {
    const total = d.totalResenas || 0;
    if (!total) return dias ? `Sin reseñas en ${plural(dias, "día", "días")}` : "Sin reseñas";
    const ratio = dias ? total / dias : 0;
    return `${plural(total, "reseña", "reseñas")} · ${ratio.toFixed(2)} por día`;
  }

  const nov = d.novedades || 0;
  if (indId === "tienda" || indId === "tienda_e") {
    return nov ? `${plural(nov, "día", "días")} con novedad en tienda` : "Tienda impecable ✅";
  }
  if (indId === "planilla") {
    return nov ? `${plural(nov, "día", "días")} sin planilla` : "Planilla al día ✅";
  }
  if (indId === "actitud") {
    return nov ? `${plural(nov, "día", "días")} con actitud regular o mala` : "Actitud siempre bien ✅";
  }
  if (indId === "celular") {
    return nov ? `${plural(nov, "día", "días")} con novedad de celular` : "Sin novedades de celular ✅";
  }
  if (indId === "uniforme") {
    return nov ? `${plural(nov, "día", "días")} sin uniforme correcto` : "Uniforme siempre correcto ✅";
  }
  return nov ? `${plural(nov, "día", "días")} con novedad` : "Sin novedades ✅";
}

// ----------------------------------------------------------------------------
// DETALLE CORTO POR INDICADOR — el textito del prototipo bajo el nombre
// ("1 día tarde · 2 minutos", "2 días sin llenar", "Sin observaciones").
// Es más seco que `textoDetalleIndicador` (que es el de la app clásica) porque
// el prototipo aprobado lo pinta en una línea de 11px al lado de la nota.
// ----------------------------------------------------------------------------
export function detalleCortoIndicador(indId, detalle) {
  const d = detalle || {};

  if (indId === "puntualidad") {
    const tarde = d.diasTarde || 0;
    const min = d.minutosAcum || 0;
    if (!tarde && !min) return "Sin retardos";
    return `${plural(tarde, "día tarde", "días tarde")} · ${plural(min, "minuto", "minutos")}`;
  }

  if (indId === "resenas") {
    const total = d.totalResenas || 0;
    return total ? `${plural(total, "reseña", "reseñas")} este mes` : "Sin reseñas este mes";
  }

  const nov = d.novedades || 0;
  if (!nov) return "Sin observaciones";
  if (indId === "planilla") return `${plural(nov, "día", "días")} sin llenar`;
  if (indId === "tienda" || indId === "tienda_e") return `${plural(nov, "día", "días")} con novedad en tienda`;
  if (indId === "actitud") return `${plural(nov, "día", "días")} con actitud regular o mala`;
  if (indId === "celular") return `${plural(nov, "día", "días")} con novedad de celular`;
  if (indId === "uniforme") return `${plural(nov, "día", "días")} sin uniforme`;
  return `${plural(nov, "día", "días")} con novedad`;
}

// Cómo se lee UN día para UN indicador concreto ("2 min tarde", "Sin llenar",
// "Orden ✓ Uniforme ✗ Depósito ✓"). Devuelve null en días de descanso.
function diaDeIndicador(indId, reg) {
  if (!reg || reg.descanso) return null;
  const marca = (v) => (v === "bien" || v === undefined || v === null ? "✓" : "✗");

  if (indId === "puntualidad") {
    const min = reg.minutos || 0;
    if (!min) return { texto: "A tiempo", estado: "ok" };
    return { texto: `${plural(min, "min tarde", "min tarde")}`, estado: min >= 10 ? "grave" : "mal" };
  }
  if (indId === "resenas") {
    const n = reg.resenas || 0;
    // Las reseñas no penalizan por día (la nota es el ratio del mes): nunca "mal".
    // Pero un día sin reseñas TAMPOCO es "ok": pintarlo verde le decía "bien"
    // a un día en que no consiguió ninguna. `cero` es el estado neutro — ni
    // logro ni falla — y la tira lo pinta hueco. (Luis, 21-ago-2026)
    return { texto: n ? plural(n, "reseña", "reseñas") : "Sin reseñas", estado: n ? "ok" : "cero" };
  }
  if (indId === "tienda") {
    const ok = reg.tienda_orden === "bien" && reg.tienda_uniforme === "bien" && reg.tienda_deposito === "bien";
    return {
      texto: `Orden ${marca(reg.tienda_orden)} Uniforme ${marca(reg.tienda_uniforme)} Depósito ${marca(reg.tienda_deposito)}`,
      estado: ok ? "ok" : "mal",
    };
  }
  if (indId === "planilla") {
    const ok = (reg.planilla || "bien") === "bien";
    // "Sin llenar" era falso: casi siempre SÍ se llenó, pero quedó mal
    // diligenciado. Lo que se marca es una novedad, no una ausencia.
    return { texto: ok ? "Al día" : "Novedad", estado: ok ? "ok" : "mal" };
  }
  if (indId === "actitud") {
    const a = reg.actitud || "bien";
    const nota = (reg.actitud_nota || "").trim();
    if (a === "bien") return { texto: "Bien", estado: "ok" };
    const et = a === "regular" ? "Regular" : "Mal";
    return { texto: nota ? `${et} · ${nota}` : et, estado: "mal" };
  }
  // V1 (abril 2026 y antes)
  if (indId === "celular" || indId === "uniforme" || indId === "tienda_e") {
    const ok = (reg[indId] || "bien") === "bien";
    return { texto: ok ? "Bien" : "Novedad", estado: ok ? "ok" : "mal" };
  }
  return null;
}

// Línea corta para el ranking por indicador (equivalente a infoDebajoNombre)
export function textoRankingIndicador(indId, detalle, extra = {}) {
  const d = detalle || {};
  if (indId === "puntualidad") {
    const partes = [`${d.diasTarde || 0} día(s) tarde`];
    if ((d.diasGraves || 0) > 0) partes.push(`${d.diasGraves} grave(s)`);
    partes.push(`${d.minutosAcum || 0} min acum.`);
    return partes.join(" · ");
  }
  if (indId === "resenas") return `${d.totalResenas || 0} reseñas totales`;
  if (indId === "general") return `${extra.dias || 0} días trabajados`;
  if (indId === "ventas") {
    // Cifras completas: la regla del dueño no tiene excepción por espacio.
    return `${formatoPesos(extra.real || 0)} de ${formatoPesos(extra.meta || 0)} (${extra.pct || 0}%)`;
  }
  return `${d.novedades || 0} días con novedad`;
}

// ============================================================================
// VENTAS TOTALES DEL MES POR CIUDAD (hero admin)
// ============================================================================
// ⚠️ NO es un ranking: es CONTABILIDAD. Suma sobre el roster COMPLETO a
// propósito. Si una vendedora se desactiva a mitad de mes, lo que vendió sigue
// siendo plata que entró a la ciudad; sacarla dejaría el total de MED/BOG por
// debajo de lo real. La regla R1 saca a las inactivas de los RANKINGS, no de las
// cifras de dinero (mismo criterio que la nómina de comisiones).
export function derivarVentasTotalesMes(datos, año, mes) {
  const ventas = datos?.metas?.[claveMesLocal(año, mes)]?.vendidas || {};
  let med = 0, bog = 0;
  rosterCompleto(datos).forEach(v => {
    const val = Number(ventas[v.id]) || 0;
    if (v.ciudad === "MED") med += val;
    else if (v.ciudad === "BOG") bog += val;
  });
  return { med, bog, total: med + bog };
}

// ============================================================================
// RANKING DE VENTAS DEL MES (el que ve la vendedora en Tab Hoy / Ranking)
// ============================================================================
export function derivarRankingMes(datos, ciudad, año, mes, miId) {
  const ventasDelMes = datos?.metas?.[claveMesLocal(año, mes)]?.vendidas || {};

  const filas = rosterParticipa(datos, "mensual", { ciudad, año, mes }).map(v => ({
    id: v.id,
    nombre: v.nombre,
    ciudad: v.ciudad,
    valor: Number(ventasDelMes[v.id]) || 0,
  }));

  filas.sort((a, b) => b.valor - a.valor);

  return filas.map((f, i) => ({
    ...f,
    n: i + 1,
    gap: i > 0 ? `-${formatoPesos(filas[i - 1].valor - f.valor)}` : null,
    esYo: f.id === miId,
    medal: f.id === miId ? "⭐" : "",
  }));
}

// ============================================================================
// "ESTE MES" DE UNA VENDEDORA — ventas, comisión y NOTA REAL
// ============================================================================
export function derivarMesDeVendedora(datos, vendedora, año, mes) {
  const vend = vendedoraDe(datos, vendedora);
  const roster = rosterUtil(datos, { incluirInactivas: true });
  const r = calcNotaMensual(
    datos?.registros || {},
    datos?.metas || {},
    vend.id,
    año,
    mes,
    datos?.snapshots || {},
    roster
  );

  // Rol de ESE mes, no el de hoy (ver rolDeMes): abrir el boletín de marzo
  // después de un ascenso no puede pagarle a marzo el porcentaje de admin.
  const { rol, datosCambioRol, historico: rolHistorico } = rolDeMes(vend, año, mes);

  // Sin ciudad NO se puede calcular comisión, y punto.
  // `calcComisionMensual` hace `aplicaPiso = ciudad === "MED"`, así que una
  // ciudad null se colaba como trato de Bogotá (sin piso) — justo al revés del
  // viejo fallback "MED" de calculos.js. La misma persona era de Medellín para
  // la nota y de Bogotá para la plata. Criterio unificado con el núcleo:
  // dato ausente → null, nunca un trato inventado (REGLA #2 de este archivo).
  const ciudad = vend.ciudad || null;
  const ciudadDesconocida = !ciudad;
  const ventasMes = r.real || 0;

  // --- Tramo actual y siguiente (sobre el TOTAL vendido, no sobre el excedente)
  // El tramo depende sólo de ventas y rol, no de la ciudad: se puede mostrar
  // aunque falte la ciudad. Lo que NO se puede es traducirlo a pesos.
  // El `año` va en las tres: de aquí salen la etiqueta del tramo, el "% sobre
  // todo lo vendido" y el "te faltan $X" — tres afirmaciones sobre plata que no
  // pueden contradecir a la comisión que se calcula abajo con la tabla de ESE año.
  const tramo = tramoActual(ventasMes, rol, año);
  const tramoTabla = tramoParaVentas(ventasMes, año);
  const sig = siguienteTramo(ventasMes, rol, año);
  const faltaSig = sig ? Math.max(0, sig.minVentas - ventasMes) : 0;

  // --- Comisión del mes (calcComisionMensual ya aplica el piso de Medellín y,
  //     si el ascenso cayó dentro del mes, la pro-rata día a día)
  const calc = ciudadDesconocida
    ? { comision: null, detalle: "Ciudad no disponible — comisión no calculable" }
    : calcComisionMensual({ ciudad, rol, ventasMes, datosCambioRol, año, mes });

  // --- Cómo se EXPLICA esa comisión en una línea -----------------------------
  // En un mes con cambio de rol, decir "4% sobre todo lo vendido" es falso: la
  // cifra salió de una pro-rata de DOS tarifas (unos días al 2% de asesora y el
  // resto al 4% de administradora), así que el porcentaje que se pinta y la
  // plata que se paga no cuadran a la vista. `comisionTexto` trae siempre la
  // frase verdadera; la UI la pinta tal cual en vez de armarla con `tramoInfo`.
  const pro = calc.proRata || null;
  const cambioRol = pro
    ? {
        diaCambio: datosCambioRol.diaCambio,
        diasMes: datosCambioRol.diasMes,
        desde: {
          rol: pro.desde.rol,
          rolLargo: ROL_LARGO[pro.desde.rol],
          dias: pro.desde.dias,
          pct: pro.desde.pct,
          pctTexto: pctTexto(pro.desde.pct),
          comision: pro.desde.comision,
        },
        hasta: {
          rol: pro.hasta.rol,
          rolLargo: ROL_LARGO[pro.hasta.rol],
          dias: pro.hasta.dias,
          pct: pro.hasta.pct,
          pctTexto: pctTexto(pro.hasta.pct),
          comision: pro.hasta.comision,
        },
        // "12 días como asesora al 2% + 19 días como administradora al 4%"
        texto:
          `${plural(pro.desde.dias, "día", "días")} como ${ROL_LARGO[pro.desde.rol]} al ${pctTexto(pro.desde.pct)}` +
          ` + ${plural(pro.hasta.dias, "día", "días")} como ${ROL_LARGO[pro.hasta.rol]} al ${pctTexto(pro.hasta.pct)}`,
      }
    : null;

  const comisionTexto = calc.comision === null
    ? null
    : (cambioRol ? cambioRol.texto : (tramo ? `${pctTexto(tramo.pct)} sobre todo lo vendido` : null));

  // Porcentaje EFECTIVO que terminó cobrando (comisión ÷ ventas). En un mes con
  // cambio de rol cae entre las dos tarifas: es el número que sí cuadra con la
  // plata. null si no hay ventas o no hay comisión calculable.
  const pctEfectivo = (calc.comision === null || !ventasMes) ? null : calc.comision / ventasMes;

  // --- Piso Medellín: BOG no tiene piso, gana desde el primer peso.
  //     Sin ciudad no hay piso que afirmar ni negar → null.
  // Mismo criterio que `calcComisionMensual`: el piso es de MED **y** del mes
  // en que ya regía. Este bloque lo calculaba aparte y se quedó por fuera del
  // arreglo del rol; ahora los dos leen la misma función.
  const aplicaPiso = pisoAplica(ciudad, año, mes);
  const superoPiso = !aplicaPiso || ventasMes >= PISO_MED;
  const primerTramo = tramosDe(año)[0];
  const pctPrimerTramo = rol === "admin" ? primerTramo.pctAdmin : primerTramo.pctAsesora;
  const piso = ciudadDesconocida ? null : {
    aplica: aplicaPiso,
    monto: aplicaPiso ? PISO_MED : 0,
    superado: superoPiso,
    falta: aplicaPiso && !superoPiso ? PISO_MED - ventasMes : 0,
    pct: aplicaPiso ? pctPrimerTramo : null,
    // Lo que ganaría el día que toque el piso justo (sirve para el "ahí ganas X%")
    comisionAlLlegar: aplicaPiso
      ? calcComisionMensual({ ciudad, rol, ventasMes: PISO_MED, datosCambioRol, año, mes }).comision
      : null,
  };

  // --- A cuánto saltaría la comisión si llega al siguiente tramo
  // OJO: `siguienteTramo`/`tramoActual` devuelven la tabla ya vista desde el rol
  // (`tramosDeRol`), que trae el pct en `.pct`. NO existen `.pctAdmin`/
  // `.pctAsesora` ahí — eso es de la tabla cruda — y leerlos daba NaN.
  const pctSig = sig ? sig.pct : null;
  const siguienteTramoInfo = sig
    ? {
        nombre: sig.nombre,
        pct: pctSig,
        pctTexto: `${Math.round(pctSig * 100)}%`,
        minVentas: sig.minVentas,
        falta: faltaSig,
        // Comisión en el instante exacto en que cruza el tramo (sobre TODO lo vendido)
        comisionAlLlegar: ciudadDesconocida
          ? null
          : calcComisionMensual({ ciudad, rol, ventasMes: sig.minVentas, datosCambioRol, año, mes }).comision,
      }
    : null;

  const hoy = hoyColombia();
  const ultimoDia = new Date(año, mes, 0).getDate();
  const dia = (hoy.año === año && hoy.mes === mes) ? hoy.dia : ultimoDia;

  // --------------------------------------------------------------------------
  // HASTA QUÉ DÍA HAY COMPORTAMIENTO REGISTRADO
  // --------------------------------------------------------------------------
  // El ingreso diario se llena CON RETRASO, por diseño de la casa: hoy se llena
  // el de ayer, y el lunes se llenan viernes, sábado y domingo. O sea que la
  // mitad de comportamiento de la nota SIEMPRE va unos días atrás de las ventas,
  // que llegan de systemlap cada 5 minutos.
  //
  // Un día sin registrar NO baja la nota: `calcMesV2` sólo promedia los días que
  // existen (lib/calculos.js). Pero sin decirlo, la vendedora ve una nota que se
  // mueve sola los lunes y cree que le perdieron días. Por eso se nombra la
  // fecha de corte, y por eso NO se nombra la de ventas: esa es siempre hoy.
  const prefReg = `${vend.id}_${año}-${String(mes).padStart(2, "0")}`;
  const fechasReg = Object.keys(datos?.registros || {})
    .filter(k => k.startsWith(prefReg))
    .map(k => k.slice(-10))
    .filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f))
    .sort();
  const ultimoRegistro = fechasReg.length ? fechasReg[fechasReg.length - 1] : null;

  return {
    año,
    mes,
    // "2026-08-20" | null — el último día con comportamiento registrado
    ultimoRegistro,
    // "miércoles 20" | null — el mismo dato, ya escrito para la pantalla
    ultimoRegistroTexto: ultimoRegistro ? diaLargo(ultimoRegistro).toLowerCase() : null,
    // true = el comportamiento va atrás de hoy (lo normal con este ritmo)
    comportamientoAtrasado: !!(
      ultimoRegistro &&
      hoy.año === año && hoy.mes === mes &&
      ultimoRegistro < hoy.iso
    ),
    nombreMes: nombreMes(mes),
    ciudad,
    // true = no se pudo determinar la ciudad → comisión y piso van en null a
    // propósito (no es un $0 real). Misma bandera que devuelve calculos.js.
    ciudadDesconocida,
    rol,                                        // rol de ESE mes
    rolHistorico,                               // true = salió de fechaAscensoAdmin
    ascensoEnEsteMes: !!datosCambioRol,         // true = comisión prorrateada
    ventas: ventasMes,
    // meta/pctMeta pueden venir null desde el núcleo (mes cerrado sin meta, o
    // ciudad desconocida). Un `|| 0` los convertía en "vendió el 0% de $0",
    // que es un dato falso, no un dato ausente.
    meta: r.meta ?? null,
    pctMeta: r.pct ?? null,
    dia,
    diasMes: ultimoDia,
    diasTrabajados: r.dias || 0,

    // --- Comisión (compat: `tramo` y `siguienteTramo` siguen siendo STRINGS,
    //     los usa TabHoy; lo estructurado va en *Info)
    tramo: tramo ? tramo.nombre : null,
    tramoInfo: tramo
      ? {
          nombre: tramo.nombre,
          pct: tramo.pct,
          pctTexto: `${Math.round(tramo.pct * 100)}%`,
          minVentas: tramo.minVentas,
          maxVentas: tramoTabla.max,
          // ⚠️ true = hubo cambio de rol este mes: `pct`/`pctTexto` son los del
          // rol FINAL y NO explican la comisión (es una pro-rata de dos
          // tarifas). Cuando esto es true, pintar `comisionTexto`, no `pctTexto`.
          mixto: !!cambioRol,
        }
      : null,
    ganado: calc.comision,
    comision: calc.comision,                    // alias legible
    comisionDetalle: calc.detalle,
    // Frase verdadera para pintar bajo la comisión:
    //  · mes normal          → "4% sobre todo lo vendido"
    //  · mes con cambio de rol → "12 días como asesora al 2% + 19 días como
    //    administradora al 4%"
    comisionTexto,
    // Desglose auditable de la pro-rata (null si no hubo cambio de rol)
    cambioRol,
    proRata: pro,
    pctEfectivo,                                // number | null (0.032 = 3.2%)
    pctEfectivoTexto: pctEfectivo === null ? null : `${(pctEfectivo * 100).toFixed(2).replace(/\.?0+$/, "")}%`,
    // (bug corregido: antes leía sig.pctAdmin/pctAsesora → "Tramo 2 (NaN%)" en TabHoy)
    siguienteTramo: sig ? `${sig.nombre} (${Math.round(pctSig * 100)}%)` : null,
    siguienteTramoInfo,
    faltaSiguiente: faltaSig,
    piso,

    // Notas REALES (antes eran 0)
    nota: r.notaFinal,               // number | null
    notaComportamiento: r.notaBase,  // number | null
    notaVentas: r.notaVentas,        // number | null
    bono: r.bono || 0,
    cerrado: !!r.cerrado,
    version: r.version,
    porInd: r.porInd || {},
    detalleInd: r.detalle || {},
    // Notas por indicador ya formateadas (sin desglose día a día: eso lo da
    // derivarIndicadoresMes, que es más caro y sólo lo pide la pantalla detalle)
    indicadores: derivarIndicadoresMes(datos, vend, año, mes, { conDias: false }),
  };
}

// ============================================================================
// "HOY" — día en curso
// ============================================================================
// Ventas/efectivo/tickets del día NO se sincronizan hoy a Firestore: viven en
// systemlap. Se leen del registro diario SI existen; si no, null + disponible:false.
// Lo que SÍ existe siempre en el registro son los indicadores del día.
export function derivarHoyDeVendedora(datos, vendedora, fechaISO) {
  const hoy = hoyColombia();
  const iso = fechaISO || hoy.iso;
  const [añoStr, mesStr] = iso.split("-");
  const año = parseInt(añoStr, 10);
  const mes = parseInt(mesStr, 10);

  const reg = datos?.registros?.[claveRegistro(vendedora.id, iso)] || null;

  const ventasDia = campoNum(reg, CAMPOS_VENTAS);
  const efectivoDia = campoNum(reg, CAMPOS_EFECTIVO);
  const tickets = campoNum(reg, CAMPOS_TICKETS);
  const disponible = ventasDia !== null || efectivoDia !== null || tickets !== null;

  return {
    fecha: fechaBonita(iso),
    fechaISO: iso,
    // null = "no disponible" (NO es un cero real)
    ventasDia,
    efectivoDia,
    tickets,
    disponible,
    // Indicadores del día — esto sí vive en `registros`
    registrado: !!reg,
    descanso: !!reg?.descanso,
    minutos: reg ? (reg.minutos || 0) : null,
    resenas: reg ? (reg.resenas || 0) : null,
    notaDia: reg ? notaIndicadorDiaSeguro(reg, año, mes) : null,
  };
}

// Nota ponderada del día usando los indicadores de la versión del mes.
function notaIndicadorDiaSeguro(reg, año, mes) {
  if (!reg || reg.descanso) return null;
  const inds = getIndicadores(año, mes);
  let suma = 0, peso = 0;
  for (const ind of inds) {
    const n = notaIndicador(reg, ind.id, año, mes);
    if (n !== null && n !== undefined) { suma += n * ind.peso; peso += ind.peso; }
  }
  return peso ? Math.round((suma / peso) * 100) / 100 : null;
}

// ============================================================================
// "ESTA SEMANA" — efectivo (premio de $50k)
// ============================================================================
// DE DÓNDE SALE LA PLATA: del documento `televentas/efectivo`, que escribe el
// worker (televentas-reportes/src/sync.js → syncEfectivo) leyendo la tabla
// `ventas` de Supabase. NO sale de `registros`: el único escritor de `registros`
// es Ingreso Diario, que guarda comportamiento (minutos, reseñas, tienda_*,
// planilla, actitud) y NUNCA dinero. Esta función leía `registros` buscando un
// campo `efectivo` que jamás existió, así que devolvía siempre lista vacía y el
// sub-tab "Semana de efectivo" salía en blanco.
//
// Las tres trampas del doc (las mismas que documenta MiCash.jsx):
//   1. `_meta` viaja MEZCLADA con los días → se filtra con `esDiaEfectivo()`.
//      Sumarla daría NaN.
//   2. Las llaves internas son el id de la ficha COMO STRING → `String(id)`.
//   3. QUE EXISTA la llave del día = ese día ya se procesó, y quien no aparece
//      dentro vendió $0 ese día (dato real). Que NO exista = el día todavía no
//      llegó, y eso NO es $0: si ningún día de la semana llegó, aquí no se arma
//      ranking (`disponible:false`, lista vacía) en vez de pintar ceros.
export function derivarSemanaDeVendedora(datos, vendedora, fechaISO) {
  const hoy = hoyColombia();
  const fechas = fechasSemanaDe(fechaISO || hoy.iso);
  const doc = datos?.efectivo && typeof datos.efectivo === "object" ? datos.efectivo : {};

  // Trampas 1 y 3: sólo los días de ESTA semana que el worker YA procesó.
  const diasConDato = fechas.filter(
    (f) => esDiaEfectivo(f) && doc[f] && typeof doc[f] === "object" && !Array.isArray(doc[f])
  );

  // Trampa 2: las llaves internas son el id COMO STRING.
  const efectivoDe = (vid) =>
    diasConDato.reduce((t, f) => t + (Number(doc[f]?.[String(vid)]) || 0), 0);

  // Ranking de la ciudad — sólo activas (R1). La semana no tiene snapshot:
  // siempre es roster VIVO. Sin un solo día procesado no hay ranking.
  const conDato = (diasConDato.length
    ? rosterParticipa(datos, "semanal", { ciudad: vendedora.ciudad })
    : [])
    .map(v => ({ id: v.id, nombre: v.nombre, ciudad: v.ciudad, valor: efectivoDe(v.id) }))
    .sort((a, b) => b.valor - a.valor || String(a.nombre).localeCompare(String(b.nombre)));

  // Ella puede no estar en el ranking (eventual / inactiva): ahí su efectivo es
  // null — "no compite", no "$0".
  const yo = conDato.find(f => String(f.id) === String(vendedora.id)) || null;
  const efectivo = yo ? yo.valor : null;              // number | null
  const disponible = efectivo !== null;

  const ganadoras = conDato.filter(f => f.valor >= UMBRAL_EFECTIVO_SEMANA);

  // Desempate del EXTRA: con empate al peso manda lo vendido en el MES DEL
  // DOMINGO que cierra la semana (fechas[6]) — la semana lun–dom puede cruzar
  // de mes. La métrica es `metas[clave].vendidas`, la misma del premio mensual.
  // Regla completa y por qué, en `resolverExtraSemanal` (lib/helpers.js).
  const vendidasMes = datos?.metas?.[claveMesDeFecha(fechas[6])]?.vendidas || {};
  const { ganadorasExtra, lider, empateExtra } = resolverExtraSemanal(
    ganadoras,
    f => f.valor,
    f => Number(vendidasMes[String(f.id)]) || 0
  );
  const idsExtra = new Set(ganadorasExtra.map(f => String(f.id)));

  const rankingCiudad = conDato.map((f, i) => ({
    ...f,
    n: i + 1,
    esYo: String(f.id) === String(vendedora.id),
    // Dinero completo, nunca abreviado: "$1.240.000", no "$1.24M".
    gap: i > 0 ? `-${formatoPesos(conDato[i - 1].valor - f.valor)}` : null,
    gano50k: f.valor >= UMBRAL_EFECTIVO_SEMANA,
    // El extra sólo existe si hay 2+ ganadoras (misma regla del reporte diario).
    // Con doble empate (efectivo Y ventas del mes) lo ganan todas las empatadas,
    // así que esto es un conjunto, no una sola.
    extra: idsExtra.has(String(f.id)),
  }));

  return {
    efectivo,                                   // null = no disponible
    disponible,
    meta: UMBRAL_EFECTIVO_SEMANA,
    gano50k: disponible && efectivo >= UMBRAL_EFECTIVO_SEMANA,
    faltaExtra: disponible ? Math.max(0, UMBRAL_EFECTIVO_SEMANA - efectivo) : null,
    desde: fechas[0],
    hasta: fechas[6],
    diasConDato,
    empateExtra,
    ganadorasExtra,
    lider,
    top3: rankingCiudad.slice(0, 3),
    rankingCiudad,
  };
}

// ============================================================================
// TRIMESTRE — nota real (snapshots de meses cerrados + mes en curso)
// ============================================================================
export function derivarTrimestreDeVendedora(datos, vendedora, año, q) {
  const hoy = hoyColombia();
  const añoQ = año || hoy.año;
  const qNum = q || Math.ceil(hoy.mes / 3);
  const meses = mesesTrimestre(qNum);
  const roster = rosterCompleto(datos);
  const registros = datos?.registros || {};
  const metas = datos?.metas || {};
  const snapshots = datos?.snapshots || {};
  const congelado = trimestreCerrado(datos, añoQ, qNum);

  const mio = calcTrimestre(registros, metas, vendedora.id, añoQ, qNum, snapshots, roster);

  // Ranking trimestral de SU ciudad (MED y BOG no se mezclan).
  // `rosterCiudadTrimestre` YA aplicó R1+R3+R4: aquí sólo entra quien participa
  // de verdad. Quien está inactiva, entró con el trimestre arrancado o le falta
  // un mes ya cerrado no aparece — ni en la lista, ni aparte, ni en gris.
  // Trimestre CERRADO → roster congelado de los snapshots, sin tocar `activa`.
  const rankingCiudad = rosterCiudadTrimestre(datos, vendedora.ciudad, añoQ, qNum).map(v => {
    const t = calcTrimestre(registros, metas, v.id, añoQ, qNum, snapshots, roster);
    const realTrim = (t.datosMes || []).reduce((s, d) => s + (d?.real || 0), 0);
    return {
      id: v.id, nombre: v.nombre, ciudad: v.ciudad,
      notaTrim: t.notaTrim, realTrim,
      completo: t.completo,
      completoALaFecha: t.completoALaFecha,
      mesesConDatos: t.mesesConDatos,
      activa: v.activa !== false,
      eventual: v.eventual === true,
      fechaIngreso: v.fechaIngreso || null,
    };
  });
  const conNota = rankingCiudad
    .filter(v => v.notaTrim !== null)
    .sort((a, b) => (b.notaTrim - a.notaTrim) || (b.realTrim - a.realTrim));
  conNota.forEach((v, i) => { v.n = i + 1; });

  const posicion = conNota.find(v => v.id === vendedora.id)?.n ?? null;

  // Premios configurables desde Admin > Config Premios
  const cfg = datos?.config?.premiosTrim?.[`${añoQ}_Q${qNum}`] || {};
  const montoBase = Number(cfg.montoBase ?? 1_000_000);
  const montoExtra = Number(cfg.montoExtra ?? 1_000_000);

  // `{ año, q }`: sin eso calcPremios no puede resolver `entroTarde` desde
  // `fechaIngreso` y pagaría el millón a quien entró con el trimestre empezado.
  // `congelado`: trimestre ya cerrado → no se le quita el premio a quien salió
  // de la operación DESPUÉS del cierre. La ganadora de un trimestre cerrado no
  // cambia nunca.
  const premiosCiudad = calcPremios(conNota, { año: añoQ, q: qNum, congelado })[vendedora.ciudad === "BOG" ? "bog" : "med"];

  // Elegibilidad de ELLA — con el motivo, para que la pantalla pueda explicarlo
  // en vez de mostrar un premio en $0 sin decir por qué.
  const fichaMia = rosterCompleto(datos).find(x => x.id === vendedora.id);
  const miElegibilidad = elegibilidadTrimestral({
    activa: (fichaMia?.activa ?? vendedora.activa) !== false,
    eventual: (fichaMia?.eventual ?? vendedora.eventual) === true,
    fechaIngreso: fichaMia?.fechaIngreso ?? vendedora.fechaIngreso ?? null,
    completoALaFecha: mio.completoALaFecha,
    completo: mio.completo,
    mesesConDatos: mio.mesesConDatos,
  }, { año: añoQ, q: qNum, congelado });
  const ganoBase = premiosCiudad.conBono.some(v => v.id === vendedora.id);
  const ganoExtra = premiosCiudad.extraCiudad?.id === vendedora.id;
  const premioMonto = (ganoBase ? montoBase : 0) + (ganoExtra ? montoExtra : 0);

  const mesesTrim = meses.map((m, i) => {
    const nota = mio.notasMes[i];
    const cerrado = mesCerrado(datos, vendedora.id, añoQ, m);
    const enCurso = añoQ === hoy.año && m === hoy.mes;
    return {
      mes: m,
      nombre: nombreMes(m).charAt(0).toUpperCase() + nombreMes(m).slice(1),
      peso: Math.round(PESOS_TRIMESTRE[i] * 100),
      nota,
      cerrado,
      estado: nota === null ? "pendiente" : (cerrado ? "completo" : (enCurso ? "progreso" : "completo")),
    };
  });

  const ganadoras = [
    ...premiosCiudad.conBono.map(v => ({
      id: v.id, nombre: v.nombre, monto: montoBase,
      razon: `Nota trimestral ${v.notaTrim.toFixed(2)} (≥4.50)`,
    })),
    ...(premiosCiudad.extraCiudad ? [{
      id: premiosCiudad.extraCiudad.id,
      nombre: premiosCiudad.extraCiudad.nombre,
      monto: montoExtra,
      razon: `La mejor de ${vendedora.ciudad === "BOG" ? "Bogotá" : "Medellín"}`,
    }] : []),
  ];

  return {
    q: `Q${qNum}`,
    qNum,
    año: añoQ,
    nota: mio.notaTrim,                 // number | null — REAL
    notaTrim: mio.notaTrim,
    meta: 4.5,
    posicion,
    total: conNota.length,
    completo: mio.completo,
    mesesConDatos: mio.mesesConDatos,
    notasMes: mio.notasMes,
    mesesTrim,
    premio: premioMonto > 0 ? formatoPesos(premioMonto) : null,
    premioMonto,
    reconocimiento: cfg.reconocimiento || null,
    ganadoras,
    rankingCiudad: conNota,
    // Su propia elegibilidad, con el motivo exacto si no compite. Sale de la
    // MISMA función que usa calcPremios y que usa la pantalla del dueño.
    elegibilidad: miElegibilidad,
    compitePorPremio: miElegibilidad.compite,
    motivoNoCompite: miElegibilidad.motivo,
    textoNoCompite: miElegibilidad.texto,
  };
}

// ============================================================================
// COMPORTAMIENTO — el 40% de la nota, por indicador
// ============================================================================
export function derivarComportamientoDeVendedora(datos, vendedora, año, mes) {
  const hoy = hoyColombia();
  const a = año || hoy.año;
  const m = mes || hoy.mes;

  // `indicadores` = las definiciones que el núcleo USÓ realmente: las del
  // snapshot si el mes está cerrado, las vivas si está abierto. Antes esto era
  // `getIndicadores(a, m)`, o sea las constantes de HOY: cambiar un peso o
  // renombrar un id reescribía el desglose de meses ya publicados.
  const { nota, dias, porInd, detalle, cerrado, indicadores: defs } = calcMes(
    datos?.registros || {},
    vendedora.id,
    a,
    m,
    datos?.snapshots || {}
  );

  const pesoTotal = defs.reduce((s, i) => s + i.peso, 0);

  const indicadores = defs.map(def => {
    const n = porInd?.[def.id] ?? null;
    return {
      id: def.id,
      nombre: def.label,
      emoji: def.emoji,
      color: def.color,
      peso: def.peso,
      nota: n,
      detalle: n === null ? "Sin datos este mes" : textoDetalleIndicador(def.id, detalle?.[def.id], { dias }),
      estado: estadoDeNota(n),
      crudo: detalle?.[def.id] || {},
    };
  });

  const hayWarn = indicadores.some(i => i.estado === "warn");
  // Peso del comportamiento: 40% en V2, 70% en V1. La versión sale del
  // snapshot si el mes está cerrado (ver versionDeMes) — mover FECHA_CORTE_V2
  // no puede reetiquetar un mes que la vendedora ya vio.
  const factor = versionDeMes(datos, a, m) === "v2" ? 0.4 : 0.7;

  return {
    año: a,
    mes: m,
    notaTotal: nota,                       // number | null — REAL
    aporteNota: nota === null ? null : Math.round(nota * factor * 100) / 100,
    pesoComportamiento: Math.round(factor * 100),
    pesoTotalIndicadores: pesoTotal,
    dias,
    cerrado: !!cerrado,
    estado: nota === null ? "sin-datos" : (hayWarn ? "warn" : "ok"),
    // TabHoy pinta `comportamiento.resenas` como la nota ⭐ del indicador reseñas
    resenas: porInd?.resenas ?? null,
    totalResenas: detalle?.resenas?.totalResenas ?? null,
    indicadores,
    porInd: porInd || {},
    detalleCrudo: detalle || {},
  };
}

// ============================================================================
// RETARDOS — agregados + detalle día por día (esto último NO existía)
// ============================================================================
export function derivarRetardosDeVendedora(datos, vendedoraId, año, mes) {
  const hoy = hoyColombia();
  const a = año || hoy.año;
  const m = mes || hoy.mes;

  const todos = registrosDeMes(datos?.registros, vendedoraId, a, m);
  const trabajados = todos.filter(x => !x.reg?.descanso);

  const detallePorDia = trabajados
    .filter(x => (x.reg?.minutos || 0) > 0)
    .map(x => ({
      fecha: x.fecha,
      fechaBonita: fechaBonita(x.fecha),
      minutos: x.reg.minutos || 0,
      grave: (x.reg.minutos || 0) >= 10,
      nota: notaIndicador(x.reg, "puntualidad", a, m),
    }));

  const minutos = trabajados.reduce((s, x) => s + (x.reg?.minutos || 0), 0);
  const diasGraves = trabajados.filter(x => (x.reg?.minutos || 0) >= 10).length;

  // La nota mensual sale del motor oficial (incluye penalizaciones V2)
  const { porInd } = calcMes(datos?.registros || {}, vendedoraId, a, m, datos?.snapshots || {});

  return {
    año: a,
    mes: m,
    dias: detallePorDia.length,                 // días con algún retardo
    minutos,                                    // minutos acumulados del mes
    diasGraves,
    diasTrabajados: trabajados.length,
    promedioMin: trabajados.length ? Math.round((minutos / trabajados.length) * 10) / 10 : 0,
    nota: porInd?.puntualidad ?? null,
    detallePorDia,
    resumen: textoDetalleIndicador("puntualidad", { diasTarde: detallePorDia.length, diasGraves, minutosAcum: minutos }),
  };
}

// ============================================================================
// RANKING POR INDICADOR — "🏅 General", cada indicador, y "💰 Ventas"
// ============================================================================
// indicadorId: "general" | "ventas" | id de indicador (puntualidad, tienda, ...)
export function derivarRankingPorIndicador(datos, indicadorId = "general", ciudad = null, año, mes, miId = null) {
  const hoy = hoyColombia();
  const a = año || hoy.año;
  const m = mes || hoy.mes;
  const id = indicadorId || "general";

  const rk = calcRanking(
    datos?.registros || {},
    datos?.metas || {},
    a,
    m,
    // Roster COMPLETO a propósito: `calcRanking` decide adentro quién participa
    // (activas si el mes está abierto, el congelado del snapshot si ya cerró).
    // Pasarle sólo las activas rompía el roster congelado de los meses cerrados.
    rosterCompleto(datos),
    datos?.snapshots || {},
    ciudad || null
  );

  // Definiciones del mes (snapshot si está cerrado) — de aquí salen el emoji,
  // el color y el label con que se pinta la tarjeta del ranking.
  const defs = indicadoresDelMes(a, m, datos?.snapshots || {});
  const def = defs.find(d => d.id === id) || null;

  let lista;
  if (id === "general") {
    lista = rk.filter(v => v.notaFinal !== null).map(v => ({ ...v, nota: v.notaFinal, n: v.rankGen }));
  } else if (id === "ventas") {
    // Hace falta la meta Y las ventas. Sin `real` no hay % de meta que rankear:
    // `null / meta` da 0 en JS, así que quien no tiene dato entraba a la lista
    // por el sótano —con un 0% que nadie registró— en vez de quedar fuera.
    lista = rk.filter(v => v.meta > 0 && v.real !== null && v.real !== undefined)
      .sort((x, y) => (y.real / Math.max(y.meta, 1)) - (x.real / Math.max(x.meta, 1)))
      .map((v, i) => ({ ...v, nota: v.notaVentas, n: i + 1 }));
  } else {
    lista = rk.filter(v => v.porInd?.[id] !== null && v.porInd?.[id] !== undefined)
      .sort((x, y) => (y.porInd[id] ?? -1) - (x.porInd[id] ?? -1))
      .map((v, i) => ({ ...v, nota: v.porInd[id], n: i + 1 }));
  }

  return lista.map(v => ({
    id: v.id,
    nombre: v.nombre,
    ciudad: v.ciudad,
    n: v.n,
    nota: v.nota,
    esYo: miId != null && v.id === miId,
    // 👑 Estrella sólo en tabs de indicador (ni general ni ventas), como la clásica
    esEstrella: v.n === 1 && id !== "general" && id !== "ventas",
    color: def?.color || null,
    emoji: def?.emoji || (id === "ventas" ? "💰" : "🏅"),
    detalle: textoRankingIndicador(id, v.detalle?.[id], {
      dias: v.dias, real: v.real, meta: v.meta, pct: v.pct,
    }),
    real: v.real,
    meta: v.meta,
    pct: v.pct,
    dias: v.dias,
    cerrado: !!v.cerrado,
  }));
}

// Tabs disponibles para la UI del ranking por indicador (7 en V2, 8 en V1)
// `datos` es opcional sólo por compatibilidad con el único llamador de hoy
// (TabRankingIndicadores.jsx:66, que aún no lo pasa). Pasándolo, las tabs de un
// mes CERRADO salen de su snapshot igual que las tarjetas del ranking
// (derivarRankingPorIndicador); sin él se cae a las constantes vivas.
export function tabsRankingIndicador(año, mes, datos = null) {
  const hoy = hoyColombia();
  const defs = indicadoresDelMes(año || hoy.año, mes || hoy.mes, datos?.snapshots || null);
  return [
    // Estos dos colores viajan hasta el filo izquierdo de cada fila en el
    // ranking por indicador. Eran hex a mano — y "general" era MORADO.
    { id: "general", label: "General", emoji: "🏅", color: "var(--vk-titulo)" },
    ...defs.map(d => ({ id: d.id, label: d.label, emoji: d.emoji, color: d.color })),
    { id: "ventas", label: "Ventas", emoji: "💰", color: "var(--est-medio)" },
  ];
}

// ============================================================================
// TOTAL GANADO EN EL AÑO — desde datos reales, sin proyecciones inventadas
// ============================================================================
export function derivarTotalAñoDeVendedora(datos, vendedora, año) {
  const hoy = hoyColombia();
  const a = año || hoy.año;
  const hastaMes = a < hoy.año ? 12 : hoy.mes;

  // Mes de ingreso (si entró a mitad de año no se le cuentan meses previos)
  let mesInicio = 1;
  if (vendedora.fechaIngreso) {
    const [fy, fm] = String(vendedora.fechaIngreso).split("-").map(Number);
    if (fy === a) mesInicio = fm || 1;
    else if (fy > a) mesInicio = hastaMes + 1;   // no trabajó ese año
  }
  const mesesTrabajados = Math.max(0, hastaMes - mesInicio + 1);
  const salarioBase = mesesTrabajados * SALARIO_BASE_MES;

  // ⚠️ El rol NO se calcula una vez para los 12 meses: se resuelve mes por mes
  // contra `fechaAscensoAdmin` (ver rolDeMes). Con el rol de hoy, ascender a una
  // asesora le duplicaba retroactivamente la comisión de todo el año (1%→2%,
  // 2%→4%, 3%→6%) — plata que nunca se pagó apareciendo en meses ya cerrados.
  const ciudad = vendedora.ciudad || null;
  const ciudadDesconocida = !ciudad;   // sin ciudad no hay piso ni comisión (null, no 0)
  let premiosMensuales = 0;
  const meses = [];

  for (let m = mesInicio; m <= hastaMes; m++) {
    const ventasMes = Number(datos?.metas?.[claveMesLocal(a, m)]?.vendidas?.[vendedora.id]) || 0;
    // Rol que tenía en ESE mes; si el ascenso cayó dentro del mes,
    // `datosCambioRol` hace que calcComisionMensual prorratee día a día.
    const { rol, datosCambioRol, historico: rolHistorico } = rolDeMes(vendedora, a, m);
    const calcMesCom = (ciudadDesconocida || ventasMes <= 0)
      ? null
      // `a`/`m` son el año y el mes de ESTA vuelta del bucle: el piso de MED se
      // aplica sólo a los meses en que ya regía (ago-2026 en adelante).
      : calcComisionMensual({ ciudad, rol, ventasMes, datosCambioRol, año: a, mes: m });
    const comision = ciudadDesconocida ? null : (calcMesCom ? calcMesCom.comision : 0);
    if (comision !== null) premiosMensuales += comision;

    // Mismo criterio que `derivarMesDeVendedora`: en un mes con cambio de rol el
    // porcentaje del rol final NO explica la cifra (es pro-rata de dos tarifas).
    const proMes = calcMesCom?.proRata || null;
    const comisionTexto = proMes
      ? `${plural(proMes.desde.dias, "día", "días")} como ${ROL_LARGO[proMes.desde.rol]} al ${pctTexto(proMes.desde.pct)}` +
        ` + ${plural(proMes.hasta.dias, "día", "días")} como ${ROL_LARGO[proMes.hasta.rol]} al ${pctTexto(proMes.hasta.pct)}`
      : (calcMesCom?.pct !== undefined && calcMesCom?.pct !== null
          ? `${pctTexto(calcMesCom.pct)} sobre todo lo vendido`
          : null);

    const cerrado = mesCerrado(datos, vendedora.id, a, m);
    const snapV = datos?.snapshots?.[claveMesLocal(a, m)]?.vendedoras?.[vendedora.id];
    meses.push({
      año: a,
      mes: m,
      nombre: `${nombreMes(m).charAt(0).toUpperCase()}${nombreMes(m).slice(1)} ${a}`,
      ventas: ventasMes,
      comision,                                 // null = ciudad no disponible
      rol,                                      // el que tenía ESE mes
      rolHistorico,                             // true = salió de fechaAscensoAdmin
      ascensoEnEsteMes: !!datosCambioRol,       // true = comisión prorrateada
      comisionTexto,                            // frase verdadera del %, ver arriba
      nota: cerrado ? (snapV?.notaFinal ?? null) : null,
      cerrado,
    });
  }

  // Premios trimestrales: SOLO de trimestres realmente cerrados (los 3 meses
  // con snapshot). Nada de estimar el trimestre en curso.
  let premiosTrimestrales = 0;
  const trimestres = [];
  for (let q = 1; q <= Math.ceil(hastaMes / 3); q++) {
    const ms = mesesTrimestre(q);
    const cerrado = ms.every(m => m <= hastaMes && mesCerrado(datos, vendedora.id, a, m));
    if (!cerrado) continue;
    const t = derivarTrimestreDeVendedora(datos, vendedora, a, q);
    premiosTrimestrales += t.premioMonto || 0;
    trimestres.push({ q: t.q, nota: t.notaTrim, premio: t.premioMonto, reconocimiento: t.reconocimiento });
  }

  const total = salarioBase + premiosMensuales + premiosTrimestrales;

  return {
    año: a,
    total,
    // false = falta la comisión del año porque no se conoce la ciudad; el total
    // está incompleto, no es que haya ganado eso exactamente.
    totalCompleto: !ciudadDesconocida,
    mesesTrabajados,
    desglose: {
      salarioBase,
      // null (no 0) cuando no hay ciudad: sin ciudad no se sabe si aplica el
      // piso de $15.000.000 de Medellín, así que no hay comisión que afirmar.
      premiosMensuales: ciudadDesconocida ? null : premiosMensuales,
      premiosMensualesDisponible: !ciudadDesconocida,
      // El efectivo semanal no se sincroniza a Firestore → no se puede sumar.
      // null (no 0) para que la UI pueda decir "no disponible".
      premiosSemanales: null,
      premiosSemanalesDisponible: false,
      premiosTrimestrales,
      reconocimientos: trimestres.filter(t => t.reconocimiento).map(t => `${t.q}: ${t.reconocimiento}`).join(" · "),
    },
    meses,
    mesesCerrados: meses.filter(m => m.cerrado).reverse(),
    trimestres,
    // Sin proyección inventada: la UI muestra sólo lo que ya se ganó.
    proyeccion: null,
  };
}

// ============================================================================
// DETALLE COMPLETO DE UNA VENDEDORA EN UN MES (vista admin)
// ============================================================================
export function derivarDetalleVendedoraMes(datos, vendedora, año, mes) {
  const hoy = hoyColombia();
  const a = año || hoy.año;
  const m = mes || hoy.mes;

  const mesData = derivarMesDeVendedora(datos, vendedora, a, m);
  const comp = derivarComportamientoDeVendedora(datos, vendedora, a, m);
  const retardos = derivarRetardosDeVendedora(datos, vendedora.id, a, m);

  const rkGeneral = derivarRankingPorIndicador(datos, "general", vendedora.ciudad, a, m, vendedora.id);
  const posicionCiudad = rkGeneral.find(r => r.id === vendedora.id)?.n ?? null;

  const registros = registrosDeMes(datos?.registros, vendedora.id, a, m).map(({ fecha, reg }) => ({
    fecha,
    fechaBonita: fechaBonita(fecha),
    descanso: !!reg?.descanso,
    minutos: reg?.minutos || 0,
    resenas: reg?.resenas || 0,
    actitud: reg?.actitud ?? null,
    actitudNota: reg?.actitud_nota || "",
    planilla: reg?.planilla ?? null,
    tienda: {
      orden: reg?.tienda_orden ?? null,
      uniforme: reg?.tienda_uniforme ?? null,
      deposito: reg?.tienda_deposito ?? null,
    },
    nota: notaIndicadorDiaSeguro(reg, a, m),
  }));

  // La comisión NO se recalcula aquí: se reusa la de `derivarMesDeVendedora`,
  // que ya resuelve el rol de ESE mes (fechaAscensoAdmin + pro-rata) y devuelve
  // null si falta la ciudad. Recalcularla con `vendedora.rolTienda` (el rol de
  // hoy) hacía que la vista admin mostrara para un mes viejo el porcentaje del
  // cargo actual — el mismo bug de la comisión histórica, en otra pantalla.
  const comision = {
    comision: mesData.comision,
    detalle: mesData.comisionDetalle,
    // Frase verdadera + desglose de la pro-rata cuando hubo cambio de rol
    texto: mesData.comisionTexto,
    cambioRol: mesData.cambioRol,
  };

  return {
    vendedora,
    año: a,
    mes: m,
    rol: mesData.rol,                       // rol de ESE mes
    rolHistorico: mesData.rolHistorico,
    ascensoEnEsteMes: mesData.ascensoEnEsteMes,
    ciudadDesconocida: mesData.ciudadDesconocida,
    nombreMes: nombreMes(m),
    version: mesData.version,
    cerrado: mesData.cerrado,
    // Notas
    notaFinal: mesData.nota,
    notaComportamiento: mesData.notaComportamiento,
    notaVentas: mesData.notaVentas,
    bono: mesData.bono,
    // Ventas
    ventas: {
      real: mesData.ventas,
      meta: mesData.meta,
      pct: mesData.pctMeta,
      nota: mesData.notaVentas,
      comision: comision.comision,
      comisionDetalle: comision.detalle,
      comisionTexto: comision.texto,        // "N días como asesora al X% + …"
      cambioRol: comision.cambioRol,        // null si no hubo cambio de rol
      tramo: mesData.tramo,
      tramoInfo: mesData.tramoInfo,         // .mixto = true → no pintar el pct solo
    },
    // Comportamiento
    comportamiento: comp,
    indicadores: comp.indicadores,
    retardos,
    // Contexto
    diasTrabajados: mesData.diasTrabajados,
    diasRegistrados: registros.length,
    diasDescanso: registros.filter(r => r.descanso).length,
    posicionCiudad,
    totalCiudad: rkGeneral.length,
    registros,
  };
}

// ============================================================================
// POSICIÓN EN EL RANKING MENSUAL (por NOTA FINAL)
// ============================================================================
// Clásica: App.jsx:994-998 → "Posición en el ranking #X de N".
//
// ⚠️ DIFERENCIA DELIBERADA CON LA CLÁSICA: la clásica leía el ranking GLOBAL
// (App.jsx:480, sin filtro de ciudad) aunque la pantalla de rankings sí
// filtraba por ciudad. Desde agosto 2026 MED y BOG son 2 empresas separadas
// (ver calcPremios / calcRanking), así que aquí el default es la ciudad de la
// vendedora. El número global sigue disponible en `posicionGeneral/totalGeneral`,
// y se puede forzar con opts.ciudad (null = todas).
export function derivarPosicionRanking(datos, vendedora, año, mes, opts = {}) {
  const hoy = hoyColombia();
  const a = año || hoy.año;
  const m = mes || hoy.mes;
  const vend = vendedoraDe(datos, vendedora);
  const vid = vend.id;
  const { registros, metas, snapshots } = fuentes(datos);
  // Roster COMPLETO: quién participa lo decide `calcRanking` (activas si el mes
  // está abierto; el congelado del snapshot si ya cerró).
  const compiten = rosterCompleto(datos);

  const ciudadFiltro = "ciudad" in opts ? (opts.ciudad || null) : (vend.ciudad || null);

  const rk = calcRanking(registros, metas, a, m, compiten, snapshots, ciudadFiltro);
  const conNota = rk.filter(v => v.notaFinal !== null);
  const yo = conNota.find(v => v.id === vid);

  const rkGen = calcRanking(registros, metas, a, m, compiten, snapshots, null);
  const conNotaGen = rkGen.filter(v => v.notaFinal !== null);
  const yoGen = conNotaGen.find(v => v.id === vid);

  return {
    posicion: yo?.rankGen ?? null,               // null = sin nota este mes
    total: conNota.length,
    ciudad: ciudadFiltro,
    posicionGeneral: yoGen?.rankGen ?? null,     // el número que mostraba la clásica
    totalGeneral: conNotaGen.length,
  };
}

// ============================================================================
// COMPARATIVO CON EL MES ANTERIOR
// ============================================================================
// Clásica: App.jsx:912 (calcNotaMensual del mes−1), 938-940 (compMes),
// 982-986 (render "↑ +0.15 vs mes anterior" / "↓ 0.08 vs mes anterior").
// Devuelve null si falta la nota final de cualquiera de los dos meses.
export function derivarComparativoMesAnterior(datos, vendedora, año, mes) {
  const hoy = hoyColombia();
  const a = año || hoy.año;
  const m = mes || hoy.mes;
  const vid = idDe(vendedora);
  const { registros, metas, snapshots, roster } = fuentes(datos);

  const prev = mesAnterior(a, m);

  const act = calcNotaMensual(registros, metas, vid, a, m, snapshots, roster);
  const ant = calcNotaMensual(registros, metas, vid, prev.año, prev.mes, snapshots, roster);

  if (act.notaFinal === null || act.notaFinal === undefined) return null;
  if (ant.notaFinal === null || ant.notaFinal === undefined) return null;

  const delta = Math.round((act.notaFinal - ant.notaFinal) * 100) / 100;
  const texto = `${delta >= 0 ? "↑ +" : "↓ "}${Math.abs(delta).toFixed(2)} vs mes anterior`;

  return {
    notaActual: act.notaFinal,
    notaPrevia: ant.notaFinal,
    delta,
    texto,
    // Extras de conveniencia para la UI (la clásica los calculaba inline)
    sube: delta >= 0,
    añoPrevio: prev.año,
    mesPrevio: prev.mes,
    nombreMesPrevio: nombreMes(prev.mes),
  };
}

// ============================================================================
// PROMEDIO POR INDICADOR EN EL TRIMESTRE
// ============================================================================
// Clásica: App.jsx:943-953 — cuando `esTrim`, promedia
// trimDatos.datosMes.map(d => d.porInd[ind.id]) de los 3 meses del trimestre,
// usando las definiciones de indicador del PRIMER mes del trimestre.
// notaPromedio = null cuando ningún mes del trimestre trae ese indicador.
//
// ⚠️ LEGACY — promedio SIMPLE. La pantalla nueva del prototipo usa
// `derivarIndicadoresTrimestre`, que promedia PONDERADO por 20/30/50 (igual que
// la nota del trimestre) y además trae la tendencia mes a mes. Esta se mantiene
// intacta sólo porque DetalleTrimestre.jsx (la pantalla vieja) ya muestra estos
// números y cambiarlos movería lo que la vendedora ya vio.
export function derivarPorIndicadorTrimestre(datos, vendedora, año, q) {
  const hoy = hoyColombia();
  const añoQ = año || hoy.año;
  const qNum = q || Math.ceil(hoy.mes / 3);
  const meses = mesesTrimestre(qNum);
  const vid = idDe(vendedora);
  const { registros, metas, snapshots, roster } = fuentes(datos);

  const t = calcTrimestre(registros, metas, vid, añoQ, qNum, snapshots, roster);
  // Definiciones del PRIMER mes del trimestre (se mantiene ese criterio legacy),
  // pero tomadas del snapshot si ese mes ya cerró, no de las constantes de hoy.
  const defs = indicadoresDelMes(añoQ, meses[0], snapshots);

  return defs.map(def => {
    const vals = (t.datosMes || [])
      .map(d => d?.porInd?.[def.id])
      .filter(n => n !== null && n !== undefined);
    const notaPromedio = vals.length
      ? Math.round((vals.reduce((x, y) => x + y, 0) / vals.length) * 100) / 100
      : null;
    return {
      id: def.id,
      nombre: def.label,
      emoji: def.emoji,
      peso: def.peso,
      notaPromedio,                 // number | null
      // Extras de conveniencia
      color: def.color,
      mesesConDatos: vals.length,   // 0..3
      notasMes: meses.map((_, i) => (t.datosMes?.[i]?.porInd?.[def.id] ?? null)),
      estado: estadoDeNota(notaPromedio),
    };
  });
}

// ============================================================================
// FRASE MOTIVACIONAL SEGÚN LA NOTA (boletín)
// ============================================================================
// Clásica: App.jsx:926-935. Umbrales y textos copiados literalmente.
// `metaNota` es 4.5 (el umbral del premio trimestral); parametrizado sólo por
// si algún día cambia — con el default el texto es idéntico al de la clásica.
// OJO: esto NO es derivarFocoDelDia (esa habla de ventas/piso/tramos).
export function derivarFraseMotivacionalNota(posicion, total, nota, metaNota = 4.5) {
  if (nota === null || nota === undefined) return "📊 Aún no hay datos de este mes.";
  if (posicion === 1) return "🌟 ¡Estás en el #1! Lidera el equipo este mes.";
  if (posicion !== null && posicion !== undefined && posicion <= 3) return "🥇 ¡Estás en el podio! Sigue así, cada día cuenta.";
  if (nota >= metaNota) return "⚡ ¡Estás cerca del premio del trimestre! Mantén el ritmo.";
  if (nota >= metaNota - 0.5 && nota < metaNota) return `🚀 ¡A solo ${(metaNota - nota).toFixed(2)} puntos del ${metaNota.toFixed(2)}! Sigue empujando.`;
  if (nota >= 3.5) return "💪 Vas bien — un esfuerzo extra te lleva al siguiente nivel.";
  if (nota >= 2.5) return `📌 Vas en ${nota.toFixed(2)}. Los días que quedan del mes son los que mueven esta nota.`;
  return `📌 Vas en ${nota.toFixed(2)}. Mira tus indicadores para ver dónde se está yendo la nota.`;
}

// ============================================================================
// PODIO TOP 3 DEL MES (por NOTA FINAL, no por ventas)
// ============================================================================
// Clásica: App.jsx:829-857 — usa `conDatos` = ranking de la ciudad filtrado a
// notaFinal !== null, que calcRanking ya devuelve ordenado por nota final
// (desempate por ventas). La clásica sólo pinta el podio con 3+ vendedoras con
// datos; aquí se devuelven las que haya (0..3) y la pantalla decide.
export function derivarPodioTop3(datos, ciudad, año, mes, miId = null) {
  const hoy = hoyColombia();
  const a = año || hoy.año;
  const m = mes || hoy.mes;
  const { registros, metas, snapshots } = fuentes(datos);

  // Roster COMPLETO: `calcRanking` filtra por su cuenta (vivo vs congelado).
  const rk = calcRanking(registros, metas, a, m, rosterCompleto(datos), snapshots, ciudad || null);
  const conDatos = rk.filter(v => v.notaFinal !== null).slice(0, 3);

  const MEDALLAS = ["🥇", "🥈", "🥉"];
  return conDatos.map((v, i) => ({
    n: i + 1,
    id: v.id,
    nombre: v.nombre,
    nota: v.notaFinal,
    ventas: v.real ?? null,
    esYo: miId != null && v.id === miId,
    // Extras de conveniencia
    nombreCorto: String(v.nombre || "").split(" ")[0],
    ciudad: v.ciudad,
    medalla: MEDALLAS[i],
    meta: v.meta ?? null,
    pct: v.pct ?? null,
    dias: v.dias ?? 0,
    cerrado: !!v.cerrado,
  }));
}

// ============================================================================
// BOLETÍN DE UN MES CONCRETO (habilita abrir CUALQUIER mes, no sólo el actual)
// ============================================================================
// Clásica: PantallaBoletin (App.jsx:899-1005) + chips de mes (App.jsx:804-812).
// Reúne en un solo objeto todo lo que esa pantalla necesita para un (año, mes).
export function derivarBoletinMes(datos, vendedora, año, mes) {
  const hoy = hoyColombia();
  const a = año || hoy.año;
  const m = mes || hoy.mes;
  const vend = vendedoraDe(datos, vendedora);
  const vid = vend.id;
  const { registros, metas, snapshots, roster } = fuentes(datos);

  const r = calcNotaMensual(registros, metas, vid, a, m, snapshots, roster);
  const comp = derivarComportamientoDeVendedora(datos, vend, a, m);
  const pos = derivarPosicionRanking(datos, vend, a, m);
  const comparativo = derivarComparativoMesAnterior(datos, vend, a, m);

  // La versión la manda el snapshot cuando el mes está cerrado (r.version viene
  // de calcNotaMensual). Con `esFormulaV2(a, m)` vivo, mover FECHA_CORTE_V2
  // reetiquetaba boletines ya publicados: un mes que la vendedora leyó como
  // "comportamiento 70% / ventas 30%" pasaría a decir 40/60 con las MISMAS notas.
  const esV2 = r.version === "v2";

  return {
    // Contexto
    año: a,
    mes: m,
    nombreMes: nombreMes(m),
    titulo: `${nombreMes(m)} ${a}`,
    version: r.version,                     // "v1" | "v2"
    cerrado: !!r.cerrado,
    hayDatos: r.notaFinal !== null && r.notaFinal !== undefined,

    // Notas (todas number | null — nunca 0 inventado)
    notaFinal: r.notaFinal ?? null,
    notaComportamiento: r.notaBase ?? null,
    notaVentas: r.notaVentas ?? null,
    bono: r.bono || 0,
    pesoComportamiento: esV2 ? 40 : 70,
    pesoVentas: esV2 ? 60 : 30,

    // Ventas del mes
    ventas: r.real ?? null,
    meta: r.meta ?? null,
    pctMeta: r.pct ?? null,

    // Comportamiento por indicador (con textos de detalle listos para pintar)
    porInd: r.porInd || {},
    detalleInd: r.detalle || {},
    indicadores: comp.indicadores,

    // Ranking
    posicion: pos.posicion,
    total: pos.total,
    posicionGeneral: pos.posicionGeneral,
    totalGeneral: pos.totalGeneral,

    // Días
    diasTrabajados: r.dias ?? 0,
    diasRegistrados: registrosDeMes(datos?.registros, vid, a, m).length,

    // Extras de la pantalla
    comparativo,                            // objeto | null
    frase: derivarFraseMotivacionalNota(pos.posicion, pos.total, r.notaFinal ?? null),
  };
}

// ############################################################################
// #                                                                          #
// #   API DEL PROTOTIPO APROBADO (docs/prototipo-3-perfiles.html)            #
// #   Todo lo de abajo es lo que consumen las pantallas nuevas de la         #
// #   vendedora: Mi cash semanal / Mi mes / Mi trimestre / detalle de        #
// #   indicador / rankings de ciudad.                                        #
// #                                                                          #
// ############################################################################

// ============================================================================
// 1) MI CASH SEMANAL — vive en vendedora/MiCash.jsx, NO aquí
// ============================================================================
// Aquí vivían `derivarSemanaEfectivo()` y `estadoEfectivoSemanal()`. Buscaban el
// efectivo en un campo (`efectivo` | `efectivoDia` | `efectivo_dia`) DENTRO de
// los registros diarios de Ingreso Diario. Ese campo nunca existió: Ingreso
// Diario sólo guarda comportamiento, y el worker escribe la plata en el
// documento aparte `televentas/efectivo`. Devolvían siempre `null`, y por eso el
// Home decía "Sin dato todavía" con el efectivo ya cargado en Firestore.
//
// NO LAS VUELVAS A CABLEAR. La única fuente del cash semanal es el doc
// `televentas/efectivo` (`datos.efectivo`), y quien lo lee es:
//   · `armarSemana()` / `ganadorasDe()`  → vendedora/MiCash.jsx (pantalla y Home)
//   · `derivarSemanaDeVendedora()`       → arriba en este archivo (Tab Ranking)
// ============================================================================

// ============================================================================
// 4) MIS INDICADORES DEL MES — nota, detalle concreto y día por día
// ============================================================================
// Meses CERRADOS: `calcMes` devuelve el snapshot tal cual (nota y detalle no se
// recalculan). El desglose día a día se lee de `registros`, que es la
// observación en crudo — mirar los días NO mueve la nota del snapshot.
export function derivarIndicadoresMes(datos, vendedora, año, mes, opts = {}) {
  const { conDias = true } = opts;
  const hoy = hoyColombia();
  const vend = vendedoraDe(datos, vendedora);
  const a = año || hoy.año;
  const m = mes || hoy.mes;

  // `indicadores` = las definiciones que usó el núcleo: snapshot si el mes está
  // cerrado, constantes vivas si está abierto. Con `getIndicadores(a, m)` un
  // cambio de peso o de id hoy repintaba el desglose de meses ya cerrados.
  const { porInd, detalle, dias, cerrado, indicadores: defs } = calcMes(
    datos?.registros || {},
    vend.id,
    a,
    m,
    datos?.snapshots || {}
  );

  const registrosMes = conDias ? registrosDeMes(datos?.registros, vend.id, a, m) : [];

  return defs.map(def => {
    const nota = porInd?.[def.id] ?? null;

    const diasInd = conDias
      ? registrosMes
          .map(({ fecha, reg }) => {
            if (!reg || reg.descanso) return null;
            const d = diaDeIndicador(def.id, reg);
            if (!d) return null;
            return {
              fecha,
              etiqueta: diaLargo(fecha),          // "Lunes 4"
              fechaBonita: fechaBonita(fecha),    // "lun 4 ago"
              texto: d.texto,
              estado: d.estado,                   // "ok" | "mal" | "grave"
              nota: notaIndicador(reg, def.id, a, m),
            };
          })
          .filter(Boolean)
      : null;

    return {
      id: def.id,
      nombre: def.label,
      emoji: def.emoji,
      color: def.color,
      peso: def.peso,
      nota,                                        // number | null
      detalle: nota === null ? "Sin datos este mes" : detalleCortoIndicador(def.id, detalle?.[def.id]),
      estado: estadoDeNota(nota),
      crudo: detalle?.[def.id] || {},
      dias: diasInd,                               // array | null (si conDias:false)
      diasTrabajados: dias || 0,
      cerrado: !!cerrado,
    };
  });
}

// ============================================================================
// 3) MI TRIMESTRE EN VIVO — cerrados por snapshot + el mes en curso parcial
// ============================================================================
// ⚠️ REGLA DEL DUEÑO: los meses cerrados NO se recalculan. `calcNotaMensual`
// devuelve `notaFinal` del snapshot cuando existe, así que un trimestre
// completamente cerrado da EXACTAMENTE la ponderación de sus snapshots
// (20/30/50, suma de pesos = 1). Aquí sólo se formatea.
export function derivarTrimestreEnVivo(datos, vendedora, año, q) {
  const hoy = hoyColombia();
  const vend = vendedoraDe(datos, vendedora);
  const añoQ = año || hoy.año;
  const qNum = q || Math.ceil(hoy.mes / 3);
  const meses = mesesTrimestre(qNum);
  const { registros, metas, snapshots, roster } = fuentes(datos);

  // Ponderación 20/30/50 normalizada por los pesos que tienen dato — la hace
  // calcTrimestre, que es la fuente de verdad compartida con la app clásica.
  const t = calcTrimestre(registros, metas, vend.id, añoQ, qNum, snapshots, roster);

  let enCurso = null;
  let pesosConDato = 0;

  const mesesTrim = meses.map((mm, i) => {
    const nota = t.notasMes[i] ?? null;
    const cerrado = mesCerrado(datos, vend.id, añoQ, mm);
    const esEnCurso = añoQ === hoy.año && mm === hoy.mes;
    const yaPaso = añoQ < hoy.año || (añoQ === hoy.año && mm < hoy.mes);
    const diasMes = new Date(añoQ, mm, 0).getDate();
    const dia = esEnCurso ? hoy.dia : (yaPaso ? diasMes : 0);

    if (nota !== null) pesosConDato += PESOS_TRIMESTRE[i];

    const estado = cerrado ? "cerrado"
      : esEnCurso ? "curso"
      : yaPaso ? "abierto"
      : "pendiente";

    const etiquetaEstado = cerrado ? "cerrado"
      : esEnCurso ? `en curso · día ${dia} de ${diasMes}`
      : yaPaso ? "sin cerrar"
      : "aún no empieza";

    const fila = {
      mes: mm,
      año: añoQ,
      nombre: nombreMes(mm).charAt(0).toUpperCase() + nombreMes(mm).slice(1),
      peso: PESOS_TRIMESTRE[i],
      pesoPct: Math.round(PESOS_TRIMESTRE[i] * 100),
      nota,
      cerrado,
      enCurso: esEnCurso,
      estado,
      etiquetaEstado,
      dia,
      diasMes,
      pctMes: diasMes ? Math.round((dia / diasMes) * 100) : 0,
    };
    if (esEnCurso) enCurso = fila;
    return fila;
  });

  const nota = t.notaTrim;
  const cerradoCompleto = mesesTrim.every(x => x.cerrado);

  // ¿PARTICIPA en ESTE trimestre? Regla del dueño (R3/R4): quien entró con el
  // trimestre ya arrancado no participa y ni siquiera aparece en el ranking
  // trimestral. Sale de `elegibilidadTrimestral` (lib/calculos.js) — la MISMA
  // función que usa `participantes()`, `calcPremios` y la pantalla del dueño.
  // La pantalla usa esto para NO mostrarle una tabla en la que no está.
  const fichaVend = rosterCompleto(datos).find(x => x.id === vend.id) || vend;
  const eleg = elegibilidadTrimestral({
    activa: fichaVend.activa !== false,
    eventual: fichaVend.eventual === true,
    fechaIngreso: fichaVend.fechaIngreso || null,
    completoALaFecha: t.completoALaFecha,
    completo: t.completo,
    mesesConDatos: t.mesesConDatos,
  }, { año: añoQ, q: qNum, congelado: trimestreCerrado(datos, añoQ, qNum) });

  return {
    año: añoQ,
    q: `Q${qNum}`,
    qNum,
    ciudad: vend.ciudad,
    // ¿Participa en el trimestre? Si es `false`, la pantalla NO le muestra el
    // ranking (no está en él) y le explica por qué. Su nota personal se sigue
    // calculando: le sirve de referencia y su mes y su semana no cambian.
    compite: eleg.compite,
    participa: eleg.compite,               // alias legible
    motivoNoCompite: eleg.motivo,          // null | "inactiva" | "eventual" | "entroTarde" | "mesIncompleto"
    textoNoCompite: eleg.texto,
    fechaIngreso: eleg.fechaIngreso,
    elegibilidad: eleg,
    nota,                                   // number | null — EN VIVO
    meta: META_NOTA_TRIMESTRE,
    falta: nota === null ? null : Math.max(0, dosDec(META_NOTA_TRIMESTRE - nota)),
    llegaAMeta: nota !== null && nota >= META_NOTA_TRIMESTRE,
    mesesConDatos: t.mesesConDatos,
    pesosConDato: dosDec(pesosConDato),     // 0.5 cuando sólo van jul+ago
    completo: t.completo,                   // los 3 meses tienen nota
    cerradoCompleto,                        // los 3 meses tienen SNAPSHOT
    meses: mesesTrim,
    // ------------------------------------------------------------------
    // VENTAS DEL TRIMESTRE — la mitad más pesada de la nota, que la pantalla
    // no estaba mostrando (regla del dueño, 21-ago-2026).
    // ------------------------------------------------------------------
    // No es un cálculo nuevo: es EXACTAMENTE el mismo promedio ponderado que
    // `derivarIndicadoresTrimestre` ya hace con cada indicador de
    // comportamiento — suma(nota_mes × peso) / suma(pesos con dato). Y la nota
    // de ventas de cada mes ya viene calculada en `datosMes[i].notaVentas`
    // (calcNotaMensual: `1 + (vendido/meta) × 4`, topada en 5.00).
    //
    // La barra de cada mes es lo vendido contra la meta DE ESE MES: las metas
    // cambian mes a mes, así que una sola barra del trimestre tendría que
    // escoger una meta y ninguna sería la correcta.
    ventas: (() => {
      const filas = mesesTrim.map((mm, i) => {
        const d = t.datosMes?.[i] || null;
        const nota = d?.notaVentas ?? null;
        const real = d?.real ?? null;
        const metaMes = d?.meta ?? null;
        return {
          mes: mm.mes,
          nombre: mm.nombre,
          nota,
          real,
          meta: metaMes,
          // pct real (puede pasar de 100). La barra lo topa al pintar.
          pct: (metaMes > 0 && real !== null) ? Math.round((real / metaMes) * 100) : null,
          cerrado: mm.cerrado,
        };
      });
      let suma = 0, pesos = 0;
      filas.forEach((f, i) => {
        if (f.nota !== null && f.nota !== undefined) {
          suma += f.nota * PESOS_TRIMESTRE[i];
          pesos += PESOS_TRIMESTRE[i];
        }
      });
      return { promedio: pesos ? dosDec(suma / pesos) : null, meses: filas };
    })(),
    notasMes: t.notasMes,
    // "agosto va en el día 5 de 31"
    enCurso,                                // fila del mes en curso | null
    mesEnCurso: enCurso ? enCurso.mes : null,
    nombreMesEnCurso: enCurso ? enCurso.nombre : null,
    dia: enCurso ? enCurso.dia : null,
    diasMes: enCurso ? enCurso.diasMes : null,
    pctMes: enCurso ? enCurso.pctMes : null,
  };
}

// ============================================================================
// 5) MIS INDICADORES EN EL TRIMESTRE — el mismo indicador, mes a mes
// ============================================================================
// El promedio es PONDERADO por 20/30/50 sobre los meses que tienen dato
// (igual que la nota del trimestre), no un promedio simple.
// Las definiciones de indicador se toman del ÚLTIMO mes del trimestre, que es
// la versión de fórmula con la que va a cerrar (importa sólo en Q2/2026, donde
// abril es V1 y mayo/junio son V2).
export function derivarIndicadoresTrimestre(datos, vendedora, año, q) {
  const hoy = hoyColombia();
  const vend = vendedoraDe(datos, vendedora);
  const añoQ = año || hoy.año;
  const qNum = q || Math.ceil(hoy.mes / 3);
  const meses = mesesTrimestre(qNum);
  const { registros, metas, snapshots, roster } = fuentes(datos);

  const t = calcTrimestre(registros, metas, vend.id, añoQ, qNum, snapshots, roster);
  // Definiciones del ÚLTIMO mes del trimestre (la versión con la que cierra).
  // Si ese mes ya está cerrado, salen de su snapshot, no de las constantes de
  // hoy — el trimestre publicado no se repinta solo.
  const defs = indicadoresDelMes(añoQ, meses[2], snapshots);

  const contextoMeses = meses.map((mm, i) => {
    const cerrado = mesCerrado(datos, vend.id, añoQ, mm);
    const esEnCurso = añoQ === hoy.año && mm === hoy.mes;
    const diasMes = new Date(añoQ, mm, 0).getDate();
    return {
      mes: mm,
      nombre: nombreMes(mm).charAt(0).toUpperCase() + nombreMes(mm).slice(1),
      peso: PESOS_TRIMESTRE[i],
      pesoPct: Math.round(PESOS_TRIMESTRE[i] * 100),
      cerrado,
      enCurso: esEnCurso,
      dia: esEnCurso ? hoy.dia : 0,
      diasMes,
    };
  });

  const indicadores = defs.map(def => {
    const notasMes = meses.map((_, i) => t.datosMes?.[i]?.porInd?.[def.id] ?? null);

    // Promedio ponderado por los pesos del trimestre que tienen dato
    let suma = 0, pesos = 0;
    notasMes.forEach((n, i) => {
      if (n !== null && n !== undefined) { suma += n * PESOS_TRIMESTRE[i]; pesos += PESOS_TRIMESTRE[i]; }
    });
    const promedio = pesos ? dosDec(suma / pesos) : null;

    // Tendencia: último mes con dato vs el anterior con dato
    const conDato = notasMes
      .map((n, i) => ({ n, i }))
      .filter(x => x.n !== null && x.n !== undefined);
    const ult = conDato[conDato.length - 1] || null;
    const prev = conDato.length >= 2 ? conDato[conDato.length - 2] : null;
    const delta = ult && prev ? dosDec(ult.n - prev.n) : null;
    const tendencia = delta === null ? null : (delta > 0 ? "sube" : delta < 0 ? "baja" : "igual");

    const nombrePrev = prev ? contextoMeses[prev.i].nombre.toLowerCase() : null;
    const texto = tendencia === null
      ? (ult ? "Primer mes con datos" : "Sin datos en el trimestre")
      : tendencia === "igual"
        ? `Igual que ${nombrePrev}`
        : tendencia === "sube"
          ? `▲ subiendo · ${nombrePrev} ${prev.n.toFixed(2)}`
          : `▼ bajando · ${nombrePrev} ${prev.n.toFixed(2)}`;

    return {
      id: def.id,
      nombre: def.label,
      emoji: def.emoji,
      color: def.color,
      peso: def.peso,
      notasMes,                                    // [n|null, n|null, n|null]
      promedio,                                    // number | null — PONDERADO
      mesesConDatos: conDato.length,
      pesosConDato: dosDec(pesos),
      notaUltimo: ult ? ult.n : null,
      mesUltimo: ult ? meses[ult.i] : null,
      notaPrevio: prev ? prev.n : null,
      mesPrevio: prev ? meses[prev.i] : null,
      delta,                                       // number | null
      tendencia,                                   // "sube"|"baja"|"igual"|null
      texto,
      estado: estadoDeNota(promedio),
    };
  });

  return { año: añoQ, q: `Q${qNum}`, qNum, meses: contextoMeses, indicadores };
}

// ============================================================================
// 6a) RANKING DEL MES DE SU CIUDAD — por VENTAS
// ============================================================================
// Fuente: metas[YYYY_MM].vendidas, que es lo único que el sync de systemlap
// escribe. Si el mes todavía no existe en `metas`, no hay dato: disponible:false
// y filas vacías (no un ranking de ceros).
export function derivarRankingMesCiudad(datos, vendedora, año, mes) {
  const hoy = hoyColombia();
  const vend = vendedoraDe(datos, vendedora);
  const a = año || hoy.año;
  const m = mes || hoy.mes;

  const docMes = datos?.metas?.[claveMesLocal(a, m)] || null;
  const ciudad = vend.ciudad;

  if (!docMes) {
    return {
      disponible: false, ciudad, año: a, mes: m, nombreMes: nombreMes(m),
      meta: null, filas: [], miPosicion: null, misVentas: null, total: 0,
      arriba: null, faltaParaSubir: null, esPrimera: false, totalCiudad: null,
    };
  }

  const vendidas = docMes.vendidas || {};
  // Mes ABIERTO → sólo activas (R1). Mes CERRADO → el roster congelado del
  // snapshot, para que desactivar a alguien hoy no borre su fila de julio.
  const crudas = rosterParticipa(datos, "mensual", { ciudad, año: a, mes: m }).map(v => {
    const raw = vendidas[v.id] ?? vendidas[String(v.id)];
    const ventas = raw === null || raw === undefined || raw === "" ? null : Number(raw);
    return {
      id: v.id,
      nombre: v.nombre,
      nombreCorto: primerNombre(v.nombre),
      ciudad: v.ciudad,
      rol: v.rolTienda === "admin" ? "admin" : "asesora",
      ventas,                                  // number | null (null = sin dato)
      sinDato: ventas === null,
    };
  });

  // Sin dato va al final — nunca se mezcla con un 0 real.
  crudas.sort((x, y) => {
    if (x.sinDato !== y.sinDato) return x.sinDato ? 1 : -1;
    return (y.ventas || 0) - (x.ventas || 0);
  });

  const filas = crudas.map((f, i) => ({
    ...f,
    n: f.sinDato ? null : i + 1,
    esYo: f.id === vend.id,
    medalla: !f.sinDato && i < 3 ? ["🥇", "🥈", "🥉"][i] : null,
  }));

  const yo = filas.find(f => f.esYo) || null;
  const conDato = filas.filter(f => !f.sinDato);
  const arriba = yo && yo.n && yo.n > 1 ? conDato[yo.n - 2] : null;

  return {
    disponible: true,
    ciudad,
    año: a,
    mes: m,
    nombreMes: nombreMes(m),
    meta: metaParaCiudad(docMes.meta, ciudad) || 0,
    filas,
    miPosicion: yo ? yo.n : null,
    misVentas: yo ? yo.ventas : null,
    total: conDato.length,
    arriba,
    // "Con $X más pasas a Fulana" — +1 peso para quedar por encima, no empatada
    faltaParaSubir: arriba && yo && !yo.sinDato ? Math.max(1, arriba.ventas - yo.ventas + 1) : null,
    esPrimera: !!(yo && yo.n === 1),
    totalCiudad: conDato.reduce((s, f) => s + (f.ventas || 0), 0),
  };
}

// ============================================================================
// 6b) RANKING DEL TRIMESTRE DE SU CIUDAD — por NOTA TRIMESTRAL EN VIVO
// ============================================================================
// Misma nota en vivo de derivarTrimestreEnVivo para todas las de la ciudad.
// MED y BOG nunca se mezclan (son 2 empresas separadas).
export function derivarRankingTrimestreCiudad(datos, vendedora, año, q) {
  const hoy = hoyColombia();
  const vend = vendedoraDe(datos, vendedora);
  const añoQ = año || hoy.año;
  const qNum = q || Math.ceil(hoy.mes / 3);
  const { registros, metas, snapshots, roster } = fuentes(datos);

  // ⚠️ EL FILTRO YA ESTÁ HECHO: `rosterCiudadTrimestre` → `participantes()`.
  // Lo que llega aquí es EXACTAMENTE quien participa en el trimestral (R1+R3+R4).
  // Quien está inactiva, quien entró con el trimestre ya arrancado y quien no
  // tiene los meses ya cerrados NO llega — no hay que marcarla ni listarla
  // aparte: "ni debe aparecer". Por eso ya no existe `soloRankingMensual`.
  //
  // Trimestre CERRADO → roster congelado de sus snapshots: el `club` y el
  // `hayExtra` del millón extra no pueden moverse porque hoy se desactivó a
  // alguien.
  const crudas = rosterCiudadTrimestre(datos, vend.ciudad, añoQ, qNum).map(v => {
    const t = calcTrimestre(registros, metas, v.id, añoQ, qNum, snapshots, roster);
    const ventasTrim = (t.datosMes || []).reduce((s, d) => s + (d?.real || 0), 0);
    return {
      id: v.id,
      nombre: v.nombre,
      nombreCorto: primerNombre(v.nombre),
      ciudad: v.ciudad,
      nota: t.notaTrim,                      // number | null
      ventasTrim,
      mesesConDatos: t.mesesConDatos,
      completo: t.completo,
      completoALaFecha: t.completoALaFecha,
      activa: v.activa !== false,
      eventual: v.eventual === true,
      fechaIngreso: v.fechaIngreso || null,
      compite: true,                         // por construcción
    };
  });

  const conNota = crudas
    .filter(v => v.nota !== null)
    .sort((x, y) => (y.nota - x.nota) || (y.ventasTrim - x.ventasTrim));

  const filas = conNota.map((f, i) => ({
    ...f,
    n: i + 1,
    esYo: f.id === vend.id,
    // Todas las de esta lista participan, así que llegar a 4.50 es premio.
    ganaPremio: f.nota >= META_NOTA_TRIMESTRE,
    llegaAlUmbral: f.nota >= META_NOTA_TRIMESTRE,
    medalla: i < 3 ? ["🥇", "🥈", "🥉"][i] : null,
  }));

  const sinNota = crudas
    .filter(v => v.nota === null)
    .map(f => ({ ...f, n: null, esYo: f.id === vend.id, ganaPremio: false, llegaAlUmbral: false, medalla: null }));

  const yo = filas.find(f => f.esYo) || null;
  const arriba = yo && yo.n > 1 ? filas[yo.n - 2] : null;
  const club = filas.filter(f => f.ganaPremio);

  return {
    ciudad: vend.ciudad,
    año: añoQ,
    q: `Q${qNum}`,
    qNum,
    meta: META_NOTA_TRIMESTRE,
    filas,                                    // sólo las que tienen nota
    sinNota,                                  // las que aún no tienen nota
    miPosicion: yo ? yo.n : null,
    miNota: yo ? yo.nota : null,
    total: filas.length,
    arriba,
    faltaParaSubir: arriba && yo ? dosDec(arriba.nota - yo.nota) : null,
    esPrimera: !!(yo && yo.n === 1),
    club,
    clubCount: club.length,
    // El EXTRA de ciudad sólo se activa si 2+ llegan a 4.50 (regla de calcPremios).
    // Todas las de la lista participan, así que el conteo es el de la disputa real.
    hayExtra: club.length >= 2,
    // ¿ELLA está en este ranking? Si no aparece en ninguna de las dos listas es
    // porque no participa en el trimestral (R1/R3/R4). La pantalla usa esto para
    // no mostrarle una tabla donde no está; el motivo exacto lo trae
    // `derivarTrimestreEnVivo().motivoNoCompite`.
    yoAparezco: !!(yo || sinNota.find(f => f.esYo)),
  };
}

// ============================================================================
// RANKING DE UN INDICADOR EN EL TRIMESTRE
// ============================================================================
// Los indicadores del MES ya tenían ranking (`derivarRankingPorIndicador`); los
// del trimestre no, y la vendedora no podía saber cómo va en puntualidad contra
// las demás en el Q. (Regla del dueño, 22-ago-2026: misma dinámica que el mes.)
//
// NO se inventa una regla nueva: la nota trimestral de UN indicador es el mismo
// promedio ponderado que ya calcula `derivarIndicadoresTrimestre` para ella
// —suma(nota_mes × peso) / suma(pesos con dato)— aplicado a cada participante.
//
// El universo es el MISMO que el del ranking trimestral general
// (`derivarRankingTrimestreCiudad` → `participantes()`), así que quien no
// compite en el trimestre tampoco aparece aquí. Dos pantallas no pueden nombrar
// participantes distintos.
export function derivarRankingIndicadorTrimestre(datos, indicadorId, ciudad, año, q, miId = null) {
  const hoy = hoyColombia();
  const añoQ = año || hoy.año;
  const qNum = q || Math.ceil(hoy.mes / 3);
  const meses = mesesTrimestre(qNum);

  // Quiénes compiten: exactamente los del ranking trimestral de esa ciudad.
  const base = derivarRankingTrimestreCiudad(datos, { id: null, ciudad }, añoQ, qNum);
  const universo = [...(base.filas || []), ...(base.sinNota || [])];
  if (!universo.length) return { disponible: false, filas: [] };

  const fichas = new Map(rosterCompleto(datos).map(v => [String(v.id), v]));

  const crudas = universo.map(f => {
    const ficha = fichas.get(String(f.id)) || { id: f.id, nombre: f.nombre, ciudad: f.ciudad };
    const t = calcTrimestre(
      datos?.registros || {}, datos?.metas || {}, ficha.id, añoQ, qNum,
      datos?.snapshots || {}, rosterCompleto(datos)
    );
    // La nota de ESE indicador en cada mes, ponderada igual que el trimestre.
    let suma = 0, pesos = 0;
    meses.forEach((_, i) => {
      const n = t.datosMes?.[i]?.porInd?.[indicadorId];
      if (n !== null && n !== undefined) { suma += n * PESOS_TRIMESTRE[i]; pesos += PESOS_TRIMESTRE[i]; }
    });
    return {
      id: ficha.id,
      nombre: ficha.nombre,
      nombreCorto: primerNombre(ficha.nombre),
      nota: pesos ? dosDec(suma / pesos) : null,
    };
  });

  const conNota = crudas.filter(f => f.nota !== null)
    .sort((x, y) => (y.nota - x.nota) || String(x.nombre).localeCompare(String(y.nombre)));

  const filas = conNota.map((f, i) => ({
    ...f,
    n: i + 1,
    esYo: miId !== null && String(f.id) === String(miId),
    medalla: i < 3 ? ["🥇", "🥈", "🥉"][i] : null,
  }));

  const yo = filas.find(f => f.esYo) || null;
  const arriba = yo && yo.n > 1 ? filas[yo.n - 2] : null;

  return {
    disponible: filas.length > 0,
    filas,
    miPosicion: yo ? yo.n : null,
    miNota: yo ? yo.nota : null,
    total: filas.length,
    arriba,
    // "Con 0.12 más pasas a Laura" — el mismo criterio que el ranking del mes.
    faltaParaSubir: arriba && yo ? dosDec(arriba.nota - yo.nota) : null,
    esPrimera: !!(yo && yo.n === 1),
  };
}

// ============================================================================
// FOCO DEL DÍA (mensaje motivacional contextual)
// ============================================================================
export function derivarFocoDelDia({ mes, ciudad, semana }) {
  // Pre-piso MED
  if (ciudad === "MED" && (mes?.ventas || 0) < 15_000_000) {
    const faltaPiso = 15_000_000 - (mes?.ventas || 0);
    const diasQueQuedan = Math.max(1, (mes?.diasMes || 30) - (mes?.dia || 1));
    const perDia = Math.ceil(faltaPiso / diasQueQuedan);
    return {
      msg: `Con ${formatoPesos(perDia)} más al día llegas al piso en ${diasQueQuedan} días 💪`,
      tipo: "piso",
    };
  }

  // Sólo hablamos de efectivo semanal si el dato REALMENTE existe
  if (semana?.disponible) {
    if (semana.gano50k && semana.top3?.[0]?.esYo) {
      return { msg: "Vas #1 del EXTRA de $50.000. ¡Manténlo! 🔥", tipo: "normal" };
    }
    if (!semana.gano50k) {
      const falta = Math.max(0, UMBRAL_EFECTIVO_SEMANA - (semana.efectivo || 0));
      return {
        msg: `Con ${formatoPesos(falta)} más en efectivo entras al club de los $50.000 semanales 💪`,
        tipo: "normal",
      };
    }
  }

  // Contexto de meta del mes cuando no hay dato semanal
  if (mes?.meta > 0 && mes?.pctMeta < 100) {
    const falta = Math.max(0, mes.meta - mes.ventas);
    const diasQueQuedan = Math.max(1, (mes.diasMes || 30) - (mes.dia || 1));
    return {
      msg: `Vas al ${mes.pctMeta}% de la meta · con ${formatoPesos(Math.ceil(falta / diasQueQuedan))} al día la cierras 💪`,
      tipo: "normal",
    };
  }

  return { msg: "Cada venta cuenta · cada cliente importa 💪", tipo: "normal" };
}

// ============================================================================
// AGREGADOR — arma los props de las tabs (firma estable: la usa ValquiriasApp)
// ============================================================================
export function derivarDatosVendedora(datos, vendedora) {
  const hoy = hoyColombia();
  const q = Math.ceil(hoy.mes / 3);
  const mesData = derivarMesDeVendedora(datos, vendedora, hoy.año, hoy.mes);
  const semanaData = derivarSemanaDeVendedora(datos, vendedora);
  const hoyData = derivarHoyDeVendedora(datos, vendedora);
  const trimData = derivarTrimestreDeVendedora(datos, vendedora, hoy.año, q);
  const compData = derivarComportamientoDeVendedora(datos, vendedora, hoy.año, hoy.mes);
  const añoData = derivarTotalAñoDeVendedora(datos, vendedora, hoy.año);
  const rankingMes = derivarRankingMes(datos, vendedora.ciudad, hoy.año, hoy.mes, vendedora.id);

  const foco = derivarFocoDelDia({ mes: mesData, ciudad: vendedora.ciudad, semana: semanaData });

  return {
    vendedora,
    hoy: hoyData,
    foco: foco.msg,
    focoTipo: foco.tipo,
    semana: semanaData,
    mes: mesData,
    rankingMes,
    trimestre: trimData,
    comportamiento: compData,
    totalAño: añoData.total,
    proyeccion: añoData.proyeccion,     // null a propósito (no se inventa)
    desgloseAño: añoData.desglose,
    mesesCerrados: añoData.mesesCerrados,
    // La semana cerrada necesita efectivo histórico: el doc `televentas/efectivo`
    // sólo guarda 14 días (semana en curso + la anterior), así que aquí no se
    // ofrece historia. La semana pasada la arma `ganadorasDe()` en MiCash.jsx.
    semanaCerrada: null,

    // --- Pantallas del prototipo aprobado ---
    // El cash semanal NO se deriva aquí: lo lee `armarSemana()` (MiCash.jsx)
    // directamente del doc `televentas/efectivo`. Ver la lápida de la sección
    // "1) MI CASH SEMANAL" más arriba.
    trimestreVivo: derivarTrimestreEnVivo(datos, vendedora, hoy.año, q),
    rankingMesCiudad: derivarRankingMesCiudad(datos, vendedora, hoy.año, hoy.mes),
    rankingTrimCiudad: derivarRankingTrimestreCiudad(datos, vendedora, hoy.año, q),
  };
}

// Compat: nombre corto usado por la clave de mes en otros módulos
export { claveMesLib as claveMes };
