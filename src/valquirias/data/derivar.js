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
  claveMes as claveMesLib,
  mesesTrimestre,
  notaIndicador,
} from "../../lib/calculos.js";
import { getIndicadores, esFormulaV2, PESOS_TRIMESTRE } from "../../lib/constantes.js";
import {
  calcComisionMensual,
  hoyColombia,
  formatoK,
  formatoPesos,
  fechaBonita,
  tramoActual,
  siguienteTramo,
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

// Roster utilizable: nunca las eventuales (viven sólo en systemlap) y,
// por defecto, sólo las activas.
function rosterUtil(datos, { incluirInactivas = false } = {}) {
  return (datos?.vendedoras || []).filter(v =>
    !v.eventual && (incluirInactivas || v.activa !== false)
  );
}

function rosterCiudad(datos, ciudad, opts) {
  const r = rosterUtil(datos, opts);
  return ciudad ? r.filter(v => v.ciudad === ciudad) : r;
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

// Suma un campo sobre varios registros. Devuelve null si ningún registro lo trae.
function sumaOpcional(regs, nombres) {
  let hay = false;
  let total = 0;
  for (const r of regs) {
    const v = campoNum(r, nombres);
    if (v !== null) { hay = true; total += v; }
  }
  return hay ? total : null;
}

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

function estadoDeNota(nota) {
  if (nota === null || nota === undefined) return "good";
  if (nota >= 4.9) return "star";
  if (nota >= 4.0) return "good";
  return "warn";
}

const plural = (n, sing, plu) => `${n} ${n === 1 ? sing : plu}`;

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
    return nov ? `${plural(nov, "día", "días")} con actitud regular o mal` : "Actitud siempre bien ✅";
  }
  if (indId === "celular") {
    return nov ? `${plural(nov, "día", "días")} con novedad de celular` : "Sin novedades de celular ✅";
  }
  if (indId === "uniforme") {
    return nov ? `${plural(nov, "día", "días")} sin uniforme correcto` : "Uniforme siempre correcto ✅";
  }
  return nov ? `${plural(nov, "día", "días")} con novedad` : "Sin novedades ✅";
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
    return `${formatoK(extra.real || 0)} de ${formatoK(extra.meta || 0)} (${extra.pct || 0}%)`;
  }
  return `${d.novedades || 0} días con novedad`;
}

// ============================================================================
// VENTAS TOTALES DEL MES POR CIUDAD (hero admin)
// ============================================================================
export function derivarVentasTotalesMes(datos, año, mes) {
  const ventas = datos?.metas?.[claveMesLocal(año, mes)]?.vendidas || {};
  let med = 0, bog = 0;
  rosterUtil(datos, { incluirInactivas: true }).forEach(v => {
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

  const filas = rosterCiudad(datos, ciudad).map(v => ({
    id: v.id,
    nombre: v.nombre,
    ciudad: v.ciudad,
    valor: Number(ventasDelMes[v.id]) || 0,
  }));

  filas.sort((a, b) => b.valor - a.valor);

  return filas.map((f, i) => ({
    ...f,
    n: i + 1,
    gap: i > 0 ? `-${formatoK(filas[i - 1].valor - f.valor)}` : null,
    esYo: f.id === miId,
    medal: f.id === miId ? "⭐" : "",
  }));
}

// ============================================================================
// "ESTE MES" DE UNA VENDEDORA — ventas, comisión y NOTA REAL
// ============================================================================
export function derivarMesDeVendedora(datos, vendedora, año, mes) {
  const roster = rosterUtil(datos, { incluirInactivas: true });
  const r = calcNotaMensual(
    datos?.registros || {},
    datos?.metas || {},
    vendedora.id,
    año,
    mes,
    datos?.snapshots || {},
    roster
  );

  const rol = vendedora.rolTienda === "admin" ? "admin" : "asesora";
  const ventasMes = r.real || 0;
  const tramo = tramoActual(ventasMes, rol);
  const sig = siguienteTramo(ventasMes, rol);
  const faltaSig = sig ? Math.max(0, sig.minVentas - ventasMes) : 0;
  const calc = calcComisionMensual({ ciudad: vendedora.ciudad, rol, ventasMes });

  const hoy = hoyColombia();
  const ultimoDia = new Date(año, mes, 0).getDate();
  const dia = (hoy.año === año && hoy.mes === mes) ? hoy.dia : ultimoDia;

  return {
    año,
    mes,
    nombreMes: nombreMes(mes),
    ventas: ventasMes,
    meta: r.meta || 0,
    pctMeta: r.pct || 0,
    dia,
    diasMes: ultimoDia,
    diasTrabajados: r.dias || 0,
    tramo: tramo ? tramo.nombre : null,
    ganado: calc.comision,
    comisionDetalle: calc.detalle,
    siguienteTramo: sig ? `${sig.nombre} (${(rol === "admin" ? sig.pctAdmin : sig.pctAsesora) * 100}%)` : null,
    faltaSiguiente: faltaSig,
    // Notas REALES (antes eran 0)
    nota: r.notaFinal,               // number | null
    notaComportamiento: r.notaBase,  // number | null
    notaVentas: r.notaVentas,        // number | null
    bono: r.bono || 0,
    cerrado: !!r.cerrado,
    version: r.version,
    porInd: r.porInd || {},
    detalleInd: r.detalle || {},
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
export function derivarSemanaDeVendedora(datos, vendedora, fechaISO) {
  const hoy = hoyColombia();
  const fechas = fechasSemanaDe(fechaISO || hoy.iso);
  const registros = datos?.registros || {};

  const efectivoDe = (vid) => {
    const regs = fechas.map(f => registros[claveRegistro(vid, f)]).filter(Boolean);
    return sumaOpcional(regs, CAMPOS_EFECTIVO);
  };

  const efectivo = efectivoDe(vendedora.id);          // number | null
  const disponible = efectivo !== null;

  // Ranking de la ciudad — sólo con quienes tengan el dato
  const conDato = rosterCiudad(datos, vendedora.ciudad)
    .map(v => ({ id: v.id, nombre: v.nombre, ciudad: v.ciudad, valor: efectivoDe(v.id) }))
    .filter(f => f.valor !== null)
    .sort((a, b) => b.valor - a.valor);

  const ganadoras = conDato.filter(f => f.valor >= UMBRAL_EFECTIVO_SEMANA);

  const rankingCiudad = conDato.map((f, i) => ({
    ...f,
    n: i + 1,
    esYo: f.id === vendedora.id,
    gap: i > 0 ? `-${formatoK(conDato[i - 1].valor - f.valor)}` : null,
    gano50k: f.valor >= UMBRAL_EFECTIVO_SEMANA,
    // El extra sólo existe si hay 2+ ganadoras (misma regla del reporte diario)
    extra: ganadoras.length >= 2 && ganadoras[0]?.id === f.id,
  }));

  return {
    efectivo,                                   // null = no disponible
    disponible,
    meta: UMBRAL_EFECTIVO_SEMANA,
    gano50k: disponible && efectivo >= UMBRAL_EFECTIVO_SEMANA,
    faltaExtra: disponible ? Math.max(0, UMBRAL_EFECTIVO_SEMANA - efectivo) : null,
    desde: fechas[0],
    hasta: fechas[6],
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
  const roster = rosterUtil(datos, { incluirInactivas: true });
  const registros = datos?.registros || {};
  const metas = datos?.metas || {};
  const snapshots = datos?.snapshots || {};

  const mio = calcTrimestre(registros, metas, vendedora.id, añoQ, qNum, snapshots, roster);

  // Ranking trimestral de SU ciudad (MED y BOG no se mezclan)
  const rankingCiudad = rosterCiudad(datos, vendedora.ciudad).map(v => {
    const t = calcTrimestre(registros, metas, v.id, añoQ, qNum, snapshots, roster);
    const realTrim = (t.datosMes || []).reduce((s, d) => s + (d?.real || 0), 0);
    return { id: v.id, nombre: v.nombre, ciudad: v.ciudad, notaTrim: t.notaTrim, realTrim, completo: t.completo };
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

  const premiosCiudad = calcPremios(conNota)[vendedora.ciudad === "BOG" ? "bog" : "med"];
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
  };
}

// ============================================================================
// COMPORTAMIENTO — el 40% de la nota, por indicador
// ============================================================================
export function derivarComportamientoDeVendedora(datos, vendedora, año, mes) {
  const hoy = hoyColombia();
  const a = año || hoy.año;
  const m = mes || hoy.mes;

  const { nota, dias, porInd, detalle, cerrado } = calcMes(
    datos?.registros || {},
    vendedora.id,
    a,
    m,
    datos?.snapshots || {}
  );

  const defs = getIndicadores(a, m);
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
  const factor = esFormulaV2(a, m) ? 0.4 : 0.7;

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
    rosterUtil(datos),          // sólo activas compiten
    datos?.snapshots || {},
    ciudad || null
  );

  const defs = getIndicadores(a, m);
  const def = defs.find(d => d.id === id) || null;

  let lista;
  if (id === "general") {
    lista = rk.filter(v => v.notaFinal !== null).map(v => ({ ...v, nota: v.notaFinal, n: v.rankGen }));
  } else if (id === "ventas") {
    lista = rk.filter(v => v.meta > 0)
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
export function tabsRankingIndicador(año, mes) {
  const hoy = hoyColombia();
  const defs = getIndicadores(año || hoy.año, mes || hoy.mes);
  return [
    { id: "general", label: "General", emoji: "🏅", color: "#7c3aed" },
    ...defs.map(d => ({ id: d.id, label: d.label, emoji: d.emoji, color: d.color })),
    { id: "ventas", label: "Ventas", emoji: "💰", color: "#ea580c" },
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

  const rol = vendedora.rolTienda === "admin" ? "admin" : "asesora";
  let premiosMensuales = 0;
  const meses = [];

  for (let m = mesInicio; m <= hastaMes; m++) {
    const ventasMes = Number(datos?.metas?.[claveMesLocal(a, m)]?.vendidas?.[vendedora.id]) || 0;
    const comision = ventasMes > 0
      ? calcComisionMensual({ ciudad: vendedora.ciudad, rol, ventasMes }).comision
      : 0;
    premiosMensuales += comision;

    const cerrado = mesCerrado(datos, vendedora.id, a, m);
    const snapV = datos?.snapshots?.[claveMesLocal(a, m)]?.vendedoras?.[vendedora.id];
    meses.push({
      año: a,
      mes: m,
      nombre: `${nombreMes(m).charAt(0).toUpperCase()}${nombreMes(m).slice(1)} ${a}`,
      ventas: ventasMes,
      comision,
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
    mesesTrabajados,
    desglose: {
      salarioBase,
      premiosMensuales,
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

  const rol = vendedora.rolTienda === "admin" ? "admin" : "asesora";
  const comision = calcComisionMensual({ ciudad: vendedora.ciudad, rol, ventasMes: mesData.ventas });

  return {
    vendedora,
    año: a,
    mes: m,
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
      tramo: mesData.tramo,
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
  const compiten = rosterUtil(datos);            // sólo activas compiten

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
export function derivarPorIndicadorTrimestre(datos, vendedora, año, q) {
  const hoy = hoyColombia();
  const añoQ = año || hoy.año;
  const qNum = q || Math.ceil(hoy.mes / 3);
  const meses = mesesTrimestre(qNum);
  const vid = idDe(vendedora);
  const { registros, metas, snapshots, roster } = fuentes(datos);

  const t = calcTrimestre(registros, metas, vid, añoQ, qNum, snapshots, roster);
  const defs = getIndicadores(añoQ, meses[0]);

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
  if (nota >= 2.5) return "✨ Cada día es una nueva oportunidad. ¡Tú puedes!";
  return "💖 Mañana es otra oportunidad. ¡Cuentas con nosotros!";
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

  const rk = calcRanking(registros, metas, a, m, rosterUtil(datos), snapshots, ciudad || null);
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

  const esV2 = esFormulaV2(a, m);

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
      msg: `Con ${formatoK(perDia)} más al día llegas al piso en ${diasQueQuedan} días 💪`,
      tipo: "piso",
    };
  }

  // Sólo hablamos de efectivo semanal si el dato REALMENTE existe
  if (semana?.disponible) {
    if (semana.gano50k && semana.top3?.[0]?.esYo) {
      return { msg: "Vas #1 del EXTRA de $50k. ¡Manténlo! 🔥", tipo: "normal" };
    }
    if (!semana.gano50k) {
      const falta = Math.max(0, UMBRAL_EFECTIVO_SEMANA - (semana.efectivo || 0));
      return {
        msg: `Con ${formatoK(falta)} más en efectivo entras al club de los $50k semanales 💪`,
        tipo: "normal",
      };
    }
  }

  // Contexto de meta del mes cuando no hay dato semanal
  if (mes?.meta > 0 && mes?.pctMeta < 100) {
    const falta = Math.max(0, mes.meta - mes.ventas);
    const diasQueQuedan = Math.max(1, (mes.diasMes || 30) - (mes.dia || 1));
    return {
      msg: `Vas al ${mes.pctMeta}% de la meta · con ${formatoK(Math.ceil(falta / diasQueQuedan))} al día la cierras 💪`,
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
  const mesData = derivarMesDeVendedora(datos, vendedora, hoy.año, hoy.mes);
  const semanaData = derivarSemanaDeVendedora(datos, vendedora);
  const hoyData = derivarHoyDeVendedora(datos, vendedora);
  const trimData = derivarTrimestreDeVendedora(datos, vendedora, hoy.año, Math.ceil(hoy.mes / 3));
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
    // La semana cerrada necesita efectivo histórico que hoy no está en Firestore
    semanaCerrada: null,
  };
}

// Compat: nombre corto usado por la clave de mes en otros módulos
export { claveMesLib as claveMes };
