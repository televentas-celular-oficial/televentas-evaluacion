// Funciones de cálculo — Televentas Evaluación
// Maneja fórmulas V1 (abril y antes) y V2 (mayo en adelante)
// Si hay snapshot del mes (cerrado), usa esos valores en vez de calcular

import { INDICADORES_V1, INDICADORES_V2, esFormulaV2, getIndicadores, PESOS_TRIMESTRE } from "./constantes.js";

// ============================================================
// HELPERS
// ============================================================

export const fmtN = n => n === null || n === undefined ? "—" : Number(n).toFixed(2);
// Escala de nota del ADMIN y del INGRESO DIARIO (no de la vendedora: ella tiene
// la suya, sin rojo, en cada una de sus pantallas). Aquí el rojo sí es alarma.
export const colorN = n => n === null ? "var(--vk-secundario)" : n >= 4.5 ? "var(--vk-bien-texto)" : n >= 3.5 ? "var(--est-atencion)" : n >= 2.5 ? "var(--est-medio)" : "var(--est-alarma)";
export const bgN = n => n === null ? "var(--vk-fondo-hueco)" : n >= 4.5 ? "var(--vk-bien-fondo)" : n >= 3.5 ? "var(--est-atencion-fondo)" : n >= 2.5 ? "var(--est-medio-fondo)" : "var(--est-alarma-fondo)";
export const hoyStr = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};

export function trimestreActual() { return Math.ceil((new Date().getMonth() + 1) / 3); }
export function mesesTrimestre(q) { const b = (q - 1) * 3 + 1; return [b, b + 1, b + 2]; }

export const claveMes = (año, mes) => año + "_" + String(mes).padStart(2, "0");

// Día por defecto al ingresar — se usa según versión de fórmula
export function diaVacio(vid, año, mes) {
  if (esFormulaV2(año, mes)) {
    return {
      vid, descanso: false,
      minutos: 0, resenas: 0,
      // Tienda v2: 3 sub-checkboxes
      tienda_orden: "bien", tienda_uniforme: "bien", tienda_deposito: "bien",
      planilla: "bien",
      // Actitud v2: selector de 3 niveles + nota opcional
      actitud: "bien", actitud_nota: "",
    };
  }
  // V1 (legacy)
  return {
    vid, descanso: false,
    minutos: 0, resenas: 0,
    celular: "bien", uniforme: "bien", tienda_e: "bien", planilla: "bien",
  };
}

// ============================================================
// CÁLCULO DE NOTA DE INDICADOR DEL DÍA
// ============================================================

// V1 (legacy — abril y antes)
function notaIndicadorV1(reg, indId) {
  if (!reg || reg.descanso) return null;
  if (indId === "puntualidad") return reg.minutos >= 10 ? 1 : Math.round((5 - reg.minutos * 0.4) * 100) / 100;
  if (indId === "resenas") return reg.resenas >= 1 ? 5 : 1;
  if (indId === "celular") return reg.celular === "bien" ? 5 : 1;
  if (indId === "uniforme") return reg.uniforme === "bien" ? 5 : 1;
  if (indId === "tienda_e") return reg.tienda_e === "bien" ? 5 : 1;
  if (indId === "planilla") return reg.planilla === "bien" ? 5 : 1;
  return null;
}

// V2 — escala diaria igual a V1 para puntualidad y planilla, pero las que cambian son a nivel mensual
function notaIndicadorDiaV2(reg, indId) {
  if (!reg || reg.descanso) return null;
  if (indId === "puntualidad") return reg.minutos >= 10 ? 1 : Math.round((5 - reg.minutos * 0.4) * 100) / 100;
  // Reseñas se evalúa a nivel MENSUAL (ratio), no diario — devuelve null aquí
  if (indId === "resenas") return null;
  // Tienda: promedio de 3 checkboxes
  if (indId === "tienda") {
    const ok = (reg.tienda_orden === "bien" ? 1 : 0) +
               (reg.tienda_uniforme === "bien" ? 1 : 0) +
               (reg.tienda_deposito === "bien" ? 1 : 0);
    return Math.round(((ok / 3) * 4 + 1) * 100) / 100;  // 0/3=1, 1/3=2.33, 2/3=3.67, 3/3=5
  }
  if (indId === "planilla") return reg.planilla === "bien" ? 5 : 1;
  if (indId === "actitud") {
    if (reg.actitud === "bien" || !reg.actitud) return 5;
    if (reg.actitud === "regular") return 3;
    if (reg.actitud === "mal") return 1;
    return 5;
  }
  return null;
}

export function notaIndicador(reg, indId, año, mes) {
  return esFormulaV2(año, mes) ? notaIndicadorDiaV2(reg, indId) : notaIndicadorV1(reg, indId);
}

// Nota del día completa (no incluye reseñas en V2, se calcula aparte)
export function notaDia(reg, año, mes) {
  if (!reg || reg.descanso) return null;
  const inds = getIndicadores(año, mes);
  let suma = 0;
  let pesoUsado = 0;
  for (const ind of inds) {
    const nota = notaIndicador(reg, ind.id, año, mes);
    if (nota !== null) {
      suma += nota * ind.peso;
      pesoUsado += ind.peso;
    }
  }
  if (pesoUsado === 0) return null;
  // Si la versión es V2, las reseñas faltan (se calculan al mes), eso baja la "vista previa" del día. Aceptable.
  return Math.round((suma / pesoUsado) * 100) / 100;
}

// ============================================================
// CÁLCULO MENSUAL
// ============================================================

// Promedio ponderado de los indicadores del mes.
//
// MISMA FAMILIA QUE EL DEFECTO DE LAS VENTAS. Antes esto era:
//
//     suma(porInd[i.id] ?? 0 * peso) / totalPeso     ← totalPeso = 40 (V2) / 70 (V1)
//
// Un indicador sin dato entraba como CERO — por debajo del 1.00, que es el piso
// de la escala: ninguna nota real puede valer 0. Y encima seguía dividiendo por
// el peso completo, así que el hueco se pagaba dos veces. Con los pesos de hoy,
// a quien tuviera 4.50 en todo le habría salido 3.26 por perder puntualidad.
//
// Se normaliza por el peso REALMENTE usado, que es lo que ya hacía `notaDia`
// (`pesoUsado`, arriba) — el mes y el día no pueden promediar distinto.
//
// ⚠️ Es idéntico al cálculo anterior mientras TODOS los indicadores tengan
// dato, que es el caso normal: si nada es null, `usado === totalPeso` y la
// división es la misma. Sólo cambia el resultado en el caso que estaba roto.
// Hoy ese caso no se alcanza (con `dias.length > 0`, notaIndicador* devuelve
// número para los 5 ids de V2 y los 6 de V1); se vuelve alcanzable en cuanto se
// agregue o se renombre un indicador en constantes.js.
//
// Devuelve null si NINGÚN indicador tiene dato: sin nada medido no hay nota.
function notaBaseP(porInd, defs) {
  let suma = 0;
  let usado = 0;
  for (const i of defs) {
    const n = porInd[i.id];
    if (n === null || n === undefined) continue;
    suma += n * i.peso;
    usado += i.peso;
  }
  if (usado === 0) return null;
  return Math.round((suma / usado) * 100) / 100;
}

// V1 (legacy)
function calcMesV1(registros, vid, año, mes) {
  const pref = vid + "_" + año + "-" + String(mes).padStart(2, "0");
  const dias = Object.entries(registros).filter(([k, r]) => k.startsWith(pref) && !r.descanso).map(([, r]) => r);
  if (!dias.length) return { nota: null, dias: 0, porInd: {}, detalle: {} };
  const porInd = {};
  INDICADORES_V1.forEach(ind => {
    const ns = dias.map(r => notaIndicadorV1(r, ind.id)).filter(n => n !== null);
    porInd[ind.id] = ns.length ? Math.round(ns.reduce((a, b) => a + b, 0) / ns.length * 100) / 100 : null;
  });
  // Detalle por indicador (igual que V2 para consistencia en el ranking)
  const detalle = {
    puntualidad: {
      diasTarde: dias.filter(r => (r.minutos || 0) > 0).length,
      diasGraves: dias.filter(r => (r.minutos || 0) >= 10).length,
      minutosAcum: dias.reduce((s, r) => s + (r.minutos || 0), 0),
    },
    resenas: {
      totalResenas: dias.reduce((s, r) => s + (r.resenas || 0), 0),
    },
    celular: { novedades: dias.filter(r => r.celular === "mal").length },
    uniforme: { novedades: dias.filter(r => r.uniforme === "mal").length },
    tienda_e: { novedades: dias.filter(r => r.tienda_e === "mal").length },
    planilla: { novedades: dias.filter(r => r.planilla === "mal").length },
  };
  // Suma ponderada / suma de los pesos REALMENTE usados (ver notaBaseP).
  const notaBase = notaBaseP(porInd, INDICADORES_V1);
  return { nota: notaBase, dias: dias.length, porInd, detalle };
}

// V2 (mayo 2026 en adelante)
function calcMesV2(registros, vid, año, mes) {
  const pref = vid + "_" + año + "-" + String(mes).padStart(2, "0");
  const todosDias = Object.entries(registros).filter(([k]) => k.startsWith(pref)).map(([, r]) => r);
  const dias = todosDias.filter(r => !r.descanso);
  if (!dias.length) return { nota: null, dias: 0, porInd: {}, detalle: {} };

  const porInd = {};
  const detalle = {};

  // 1) Puntualidad: promedio + doble penalty
  const notasPunt = dias.map(r => notaIndicadorDiaV2(r, "puntualidad")).filter(n => n !== null);
  let notaPuntualidad = null;
  let diasTarde = 0, diasGraves = 0, minutosAcum = 0;
  if (notasPunt.length) {
    const promedio = notasPunt.reduce((a, b) => a + b, 0) / notasPunt.length;
    diasTarde = dias.filter(r => r.minutos > 0).length;
    diasGraves = dias.filter(r => r.minutos >= 10).length;
    minutosAcum = dias.reduce((s, r) => s + (r.minutos || 0), 0);
    const penaltyGrave = diasGraves * 0.3;
    const penaltyFreq = diasTarde * 0.05;
    notaPuntualidad = Math.max(1, Math.round((promedio - penaltyGrave - penaltyFreq) * 100) / 100);
  }
  porInd.puntualidad = notaPuntualidad;
  detalle.puntualidad = { diasTarde, diasGraves, minutosAcum };

  // 2) Reseñas: ratio mensual = total reseñas / días trabajados
  const totalResenas = dias.reduce((s, r) => s + (r.resenas || 0), 0);
  const ratio = totalResenas / dias.length;
  const notaResenas = Math.round(Math.min(5, 1 + ratio * 4) * 100) / 100;
  porInd.resenas = notaResenas;
  detalle.resenas = { totalResenas };

  // 3) Tienda: promedio diario de la nota de tienda (tienda v2 con checkboxes)
  const notasTienda = dias.map(r => notaIndicadorDiaV2(r, "tienda")).filter(n => n !== null);
  const notaTienda = notasTienda.length ? Math.round(notasTienda.reduce((a, b) => a + b, 0) / notasTienda.length * 100) / 100 : null;
  porInd.tienda = notaTienda;
  const novedadesTienda = dias.filter(r =>
    r.tienda_orden !== "bien" || r.tienda_uniforme !== "bien" || r.tienda_deposito !== "bien"
  ).length;
  detalle.tienda = { novedades: novedadesTienda };

  // 4) Planilla: igual que V1, promedio simple
  const notasPlan = dias.map(r => notaIndicadorDiaV2(r, "planilla")).filter(n => n !== null);
  const notaPlanilla = notasPlan.length ? Math.round(notasPlan.reduce((a, b) => a + b, 0) / notasPlan.length * 100) / 100 : null;
  porInd.planilla = notaPlanilla;
  const novedadesPlan = dias.filter(r => r.planilla === "mal").length;
  detalle.planilla = { novedades: novedadesPlan };

  // 5) Actitud: promedio simple
  const notasAct = dias.map(r => notaIndicadorDiaV2(r, "actitud")).filter(n => n !== null);
  const notaActitud = notasAct.length ? Math.round(notasAct.reduce((a, b) => a + b, 0) / notasAct.length * 100) / 100 : null;
  porInd.actitud = notaActitud;
  const novedadesActitud = dias.filter(r => r.actitud === "regular" || r.actitud === "mal").length;
  detalle.actitud = { novedades: novedadesActitud };

  // Nota base: promedio ponderado sobre los pesos realmente usados (ver notaBaseP).
  const notaBase = notaBaseP(porInd, INDICADORES_V2);

  return { nota: notaBase, dias: dias.length, porInd, detalle };
}

// Definiciones de indicadores que APLICAN a un mes.
// - Mes CERRADO (snapshot con `indicadores`): las del snapshot. El cierre las
//   guarda (CerrarMes.jsx) precisamente para que, si mañana se cambia un peso o
//   se renombra un id en constantes.js, el desglose de los meses ya cerrados NO
//   se reescriba solo.
// - Mes ABIERTO (o snapshot viejo que no guardó el campo): las vivas de
//   constantes.js.
// Firma: indicadoresDelMes(año, mes, snapshots) -> [{ id, label, emoji, peso, color }]
export function indicadoresDelMes(año, mes, snapshots) {
  const guardados = snapshots?.[claveMes(año, mes)]?.indicadores;
  if (Array.isArray(guardados) && guardados.length) return guardados;
  return getIndicadores(año, mes);
}

// API pública: calcula el mes (con switch viejo/nuevo)
// Devuelve también `indicadores`: las definiciones que se USARON, para que la
// capa de arriba (derivar.js, pantallas) no tenga que adivinar si el mes está
// cerrado ni volver a resolverlas contra las constantes vivas.
export function calcMes(registros, vid, año, mes, snapshots) {
  const indicadores = indicadoresDelMes(año, mes, snapshots);
  // Si hay snapshot, usar valores guardados (mes cerrado)
  if (snapshots) {
    const snapKey = claveMes(año, mes);
    const snap = snapshots[snapKey];
    if (snap && snap.vendedoras && snap.vendedoras[vid]) {
      const v = snap.vendedoras[vid];
      return {
        nota: v.notaBase ?? null,
        dias: v.dias ?? 0,
        porInd: v.porInd || {},
        detalle: v.detalle || {},
        cerrado: true,
        indicadores,
      };
    }
  }
  if (esFormulaV2(año, mes)) return { ...calcMesV2(registros, vid, año, mes), indicadores };
  return { ...calcMesV1(registros, vid, año, mes), indicadores };
}

// ============================================================
// BONO DE VENTAS (V2)
// ============================================================

// Bono escalonado por superar meta — solo si comp ≥ 4.5
export function bonoVentas(porcentajeMeta, notaComp) {
  if (notaComp === null || notaComp < 4.5) return 0;
  if (porcentajeMeta < 100) return 0;
  if (porcentajeMeta < 110) return 0.2;
  if (porcentajeMeta < 125) return 0.4;
  if (porcentajeMeta < 150) return 0.6;
  return 0.8;
}

// ============================================================
// CÁLCULO DE NOTA FINAL DEL MES (con ventas + bono)
// ============================================================

// Helper: obtiene la meta que aplica a una vendedora según su ciudad
// - metaField número (formato viejo): se aplica igual a todas las ciudades
// - metaField objeto {MED, BOG} (formato nuevo): cada ciudad usa su propia meta
export function metaParaCiudad(metaField, ciudad) {
  if (metaField == null) return 0;
  if (typeof metaField === "number") return metaField;
  if (typeof metaField === "object") return metaField[ciudad] || 0;
  return 0;
}

// ============================================================================
// ¿LLEGARON LAS VENTAS DE ESTA VENDEDORA? — "vendió $0" vs "todavía no llegó"
// ============================================================================
// Las dos cosas se veían igual (`vendidas[vid]` ausente) y el motor las resolvía
// con `?? 0`. Eso convertía un dato que NO existe en la peor venta posible, y
// con ella en la peor nota de ventas posible (1.00, el piso de la fórmula).
//
// LA SEÑAL. La escribe el worker `syncEvaluacion` (televentas-reportes/src/sync.js
// :304-310), y es explícita:
//
//     for (const sv of roster) {
//       if (!sv.activa) continue;
//       const m = byNorm[sv.k]; if (!m) continue;
//       const val = Math.round(net[sv.k] || 0);      // ← el 0 se ESCRIBE
//       if (vend[String(m.id)] !== val) vend[String(m.id)] = val;
//     }
//
// El worker recorre el roster completo y escribe un número por CADA vendedora
// activa, incluido el `0` de la que no vendió nada (`net[k] || 0`). O sea: si el
// mes ya se sincronizó, quien vendió $0 TIENE su clave con un 0 adentro. Por eso
// la presencia de la clave es la señal buena, y no hace falta conformarse con la
// señal de un nivel arriba ("el mapa tiene entradas de otras"):
//
//   · clave presente  → el dato llegó. Su valor manda, aunque sea 0 → nota 1.00,
//     que ahí sí es una calificación real y merecida.
//   · clave ausente   → NO llegó. No hay nota de ventas que calcular. null.
//
// Es además el MISMO predicado que ya usaba el resto de la app, así que esto
// unifica el criterio en vez de agregar uno nuevo:
//   · derivar.js:1904-1905  (ranking de ventas: `sinDato`)
//   · CerrarMes.jsx:172     (aviso "sin ventas" antes de congelar el mes)
//   · App.jsx:1721          (el mismo aviso en la app clásica)
// Antes, el núcleo decía 1.00 y esas tres capas decían "sin dato": la vendedora
// veía "tus ventas aún no están disponibles" al lado de una nota de 2.36.
//
// `mesSincronizado` (el mapa tiene alguna entrada) se conserva aparte porque
// distingue "no ha corrido el sync para NADIE" de "corrió, pero a ella le falta".
// Las dos dan nota null; sólo cambia qué se le explica y a quién hay que avisar.
export function ventasDelMes(metaInfo, vid) {
  const mapa = metaInfo && typeof metaInfo.vendidas === "object" && metaInfo.vendidas !== null
    ? metaInfo.vendidas
    : null;
  const mesSincronizado = !!mapa && Object.keys(mapa).length > 0;

  // Las claves de Firestore llegan como string (el doc es un JSON.stringify),
  // pero los id del roster son numéricos. Se prueban las dos formas.
  const crudo = mapa
    ? (Object.prototype.hasOwnProperty.call(mapa, vid) ? mapa[vid] : mapa[String(vid)])
    : undefined;

  // "" y null son huecos, no ceros (los deja el formulario viejo de digitación).
  const vacio = crudo === undefined || crudo === null || crudo === "";
  const num = vacio ? NaN : Number(crudo);
  const hay = !vacio && Number.isFinite(num);

  return { real: hay ? num : null, hay, mesSincronizado };
}

export function calcNotaMensual(registros, metas, vid, año, mes, snapshots, vendedoras) {
  const { nota: notaBase, dias, porInd, detalle, cerrado, indicadores } = calcMes(registros, vid, año, mes, snapshots);
  const metaInfo = metas[claveMes(año, mes)] || { meta: 0, vendidas: {} };

  // ------------------------------------------------------------------
  // Valores VIVOS — recalculados con las metas y el roster de HOY.
  // Sólo mandan cuando el mes está ABIERTO. Si el mes está cerrado se usan
  // los del snapshot (ver más abajo); estos quedan únicamente como fallback
  // para snapshots viejos que no guardaron el campo.
  // ------------------------------------------------------------------
  // `real` ahora es number | null. null = el dato no ha llegado (ver arriba).
  // NUNCA un 0 inventado: ese 0 era el que producía el 1.00.
  const { real, hay: hayVentas, mesSincronizado } = ventasDelMes(metaInfo, vid);

  // Ciudad de la vendedora: define QUÉ meta le aplica (MED y BOG tienen metas
  // distintas). Aquí había un fallback a "MED" para quien no estuviera en el
  // roster recibido: eso medía contra la meta de Medellín a cualquier vendedora
  // ausente del roster — p. ej. una de Bogotá que sale de la operación, se marca
  // eventual en systemlap y el roster la filtra. Quedaba evaluada contra la
  // ciudad equivocada sin que nada lo dijera.
  // Ahora: sin ciudad no hay meta. Preferimos "no disponible" (null) a un
  // número calculado contra la ciudad que no es.
  const vend = (vendedoras || []).find(v => v.id == vid);
  const ciudad = vend?.ciudad || null;
  const ciudadDesconocida = !ciudad;

  const meta = ciudadDesconocida ? null : metaParaCiudad(metaInfo.meta, ciudad);

  // Para calcular hace falta la meta Y las ventas. Falta cualquiera de las dos
  // y no hay porcentaje ni nota: hay "no disponible".
  const sePuedeCalcularVentas = meta > 0 && hayVentas;

  // pctExacto: para cálculos (bono, nota ventas) — mantiene precisión
  // pct: para mostrar en UI — redondeado a entero (null si no se puede calcular)
  const pctExacto = sePuedeCalcularVentas ? (real / meta) * 100 : 0;
  const pct = sePuedeCalcularVentas ? Math.round(pctExacto) : null;

  // ⚠️ EL DEFECTO QUE ESTO CIERRA. Antes bastaba `meta > 0`, y con `real`
  // forzado a 0 daba `1 + 0*4 = 1.00`: la nota más baja de la escala, idéntica
  // a la de quien no vendió nada en todo el mes. Con el 60% de peso de V2, una
  // vendedora con 4.80 de comportamiento veía 2.52 — por una venta que no
  // existe, no por una venta en cero. Ahora, sin dato no hay nota.
  let notaVentas = null;
  if (sePuedeCalcularVentas) {
    notaVentas = Math.min(5, Math.round((1 + (real / meta) * 4) * 100) / 100);
  }

  // Por qué no hay nota de ventas, en orden de prioridad. Lo usa la UI para
  // decirle a la vendedora QUÉ falta — y que no es algo que ella hizo mal.
  const motivoSinVentas = ciudadDesconocida ? "ciudadDesconocida"
    : !hayVentas ? (mesSincronizado ? "sinDatoSuyo" : "sinSincronizar")
    : !(meta > 0) ? "sinMeta"
    : null;

  // ------------------------------------------------------------------
  // Mes CERRADO: no se congela sólo la nota final, se congela TODO lo que la
  // vendedora vio ese día. Se devuelven los valores del snapshot, no los vivos.
  // ------------------------------------------------------------------
  if (cerrado && snapshots) {
    const snap = snapshots[claveMes(año, mes)];
    const v = snap?.vendedoras?.[vid];
    if (v) {
      // Regla: si el snapshot TIENE la clave, manda el snapshot — aunque su
      // valor sea null. Un `??` dejaría entrar el número recalculado de hoy
      // justo cuando el cierre guardó null (mes cerrado sin meta cargada), que
      // es el caso que hay que evitar: la vendedora vio "—" y hoy vería un %.
      // enSnap === false significa snapshot ANTERIOR a este cambio (el cierre
      // todavía no guardaba el campo): sólo ahí se cae al valor vivo, como
      // fallback de compatibilidad hacia atrás.
      const enSnap = k => Object.prototype.hasOwnProperty.call(v, k);
      // ⚠️ Estas tres líneas son el mes cerrado. No se tocan, no se recalculan y
      // no dependen de nada de lo de arriba cuando la clave está en el snapshot.
      const notaVentasCerrado = enSnap("notaVentas") ? v.notaVentas : notaVentas;
      const realCerrado = enSnap("real") ? v.real : real;
      return {
        notaBase, dias, porInd, detalle, cerrado: true,
        indicadores,
        notaVentas: notaVentasCerrado,
        notaFinal: v.notaFinal,
        bono: v.bono || 0,
        real: realCerrado,
        meta: enSnap("meta") ? v.meta : meta,
        pct: enSnap("pct") ? v.pct : pct,
        ciudadDesconocida,
        // Banderas informativas para la UI. Se derivan de la FOTO, no del estado
        // de hoy: un mes cerrado sin ventas cerró así y así se queda. No dicen
        // "está pendiente" (ya no llega nada), dicen "esa foto no tiene el dato".
        ventasPendientes: realCerrado === null || realCerrado === undefined,
        motivoSinVentas: notaVentasCerrado === null ? "cerradoSinVentas" : null,
        version: snap.version || (esFormulaV2(año, mes) ? "v2" : "v1"),
      };
    }
  }

  // ------------------------------------------------------------------
  // NOTA FINAL — o está completa, o no existe.
  // ------------------------------------------------------------------
  // Antes esto arrancaba en `notaFinal = notaBase` y, cuando faltaba la nota de
  // ventas, devolvía la de comportamiento COMO SI FUERA la final. En V2 eso es
  // presentar el 40% de la fórmula como si fuera el 100%: una nota que no se
  // puede comparar con la de las demás, pero que igual las rankeaba juntas.
  // Ahora falta una parte → no hay nota final. `notaBase` sigue saliendo aparte
  // y sigue siendo real: es lo que la pantalla debe mostrar mientras tanto.
  let notaFinal = null;
  let bono = 0;

  if (notaBase !== null && notaVentas !== null) {
    if (esFormulaV2(año, mes)) {
      // V2: pesos 40/60 (comportamiento/ventas), bono escalonado con filtro
      // Las ventas dominan porque sostienen la operación; el comportamiento
      // sigue siendo importante pero no debe poder compensar malas ventas.
      notaFinal = Math.round((notaBase * 0.4 + notaVentas * 0.6) * 100) / 100;
      bono = bonoVentas(pctExacto, notaBase);
      notaFinal = Math.round((notaFinal + bono) * 100) / 100;
    } else {
      // V1: pesos 70/30
      notaFinal = Math.round((notaBase * 70 + notaVentas * 30) / 100 * 100) / 100;
    }
  }

  return {
    notaBase, dias, porInd, detalle, cerrado: false,
    indicadores,
    notaVentas, notaFinal, bono,
    real, meta, pct,
    // constancia: true = no se pudo determinar la ciudad, así que meta/pct/
    // notaVentas van en null a propósito (no es un 0 real, es "no disponible")
    ciudadDesconocida,
    // true = el dato de ventas del mes no ha llegado (≠ vendió $0).
    ventasPendientes: !hayVentas,
    // true = el worker ya sincronizó el mes para ALGUIEN. Con esto la UI y el
    // admin distinguen "no ha corrido para nadie" de "corrió y a ella le falta".
    mesSincronizado,
    // null | "ciudadDesconocida" | "sinSincronizar" | "sinDatoSuyo" | "sinMeta"
    motivoSinVentas,
    version: esFormulaV2(año, mes) ? "v2" : "v1",
  };
}

// ============================================================
// RANKING MENSUAL
// ============================================================

// calcRanking acepta un filtro opcional por ciudad ("MED" | "BOG" | null=todas)
// Cuando ciudad != null, solo se calcula/rankea el subconjunto de esa ciudad —
// necesario porque ahora son 2 empresas separadas.
//
// ⚠️ `vendedoras` DEBE ser el roster COMPLETO (inactivas incluidas). Quién
// participa lo decide `participantes()` aquí adentro, no el llamador:
//  · mes ABIERTO  → sólo activas (regla R1 del dueño).
//  · mes CERRADO  → el roster CONGELADO del snapshot. Desactivar a alguien hoy
//    NO puede sacarla del ranking de julio ni correr los puestos de las demás.
// Antes esto filtraba `activa !== false` siempre, también sobre meses cerrados:
// ese era exactamente el defecto de "reescribir la historia".
// El roster completo se sigue pasando a `calcNotaMensual` para poder resolver
// la ciudad (y con ella la meta) de cualquiera.
export function calcRanking(registros, metas, año, mes, vendedoras, snapshots, ciudad = null) {
  const filtradas = participantes(vendedoras, "mensual", { año, mes, ciudad, snapshots });
  const datos = filtradas.map(v => {
    const r = calcNotaMensual(registros, metas, v.id, año, mes, snapshots, vendedoras);
    return { ...v, ...r };
  });
  // Ordenar por nota final descendente, desempate por ventas.
  // Quien no tiene nota final va SIEMPRE al final — no compite por puesto.
  const sorted = [...datos].sort((a, b) => {
    const sinA = a.notaFinal === null || a.notaFinal === undefined;
    const sinB = b.notaFinal === null || b.notaFinal === undefined;
    if (sinA !== sinB) return sinA ? 1 : -1;
    return ((b.notaFinal ?? -1) - (a.notaFinal ?? -1)) || ((b.real ?? 0) - (a.real ?? 0));
  });

  // El puesto se numera SOLO entre las que tienen nota. Esto NO cambia los
  // números que salían antes: con `?? -1`, las sin nota ya quedaban al final y
  // las demás ya recibían 1..k por índice. Se escribe explícito porque ahora las
  // filas sin nota son muchas más (todo un mes sin sincronizar), y un contador
  // aparte no depende de que el orden y el `-1` sigan coincidiendo.
  let puesto = 0;
  sorted.forEach(v => {
    const sinNota = v.notaFinal === null || v.notaFinal === undefined;
    v.rankGen = sinNota ? null : ++puesto;
    // Bandera explícita para la UI: no es que vaya de última, es que le falta
    // un dato del sistema. Quien pinte una fila sin `rankGen` debe usar esto.
    v.pendienteVentas = sinNota && !!v.ventasPendientes;
  });
  return sorted;
}

// ============================================================
// TRIMESTRE Y PREMIOS
// ============================================================

// Meses del trimestre que YA están CERRADOS oficialmente (tienen snapshot).
// Es el único conjunto de meses que se le puede exigir a alguien:
//  · el mes EN CURSO todavía no terminó → exigirlo dejaría sin premios a todo
//    el mundo en cualquier trimestre en curso (la vista "tiempo real"),
//  · un mes que NUNCA se cerró (p. ej. el trimestre arrancó antes de que la app
//    estuviera operando) no puede descalificar a nadie: no es culpa de ella.
// Devuelve los ÍNDICES (0,1,2) dentro del trimestre.
function mesesExigiblesTrimestre(año, q, snapshots) {
  return mesesTrimestre(q)
    .map((m, i) => (snapshots?.[claveMes(año, m)]?.vendedoras ? i : -1))
    .filter(i => i >= 0);
}

// Calcula la nota trimestral de una vendedora (con pesos 20/30/50)
export function calcTrimestre(registros, metas, vid, año, q, snapshots, vendedoras) {
  const meses = mesesTrimestre(q);
  const datosMes = meses.map(m => calcNotaMensual(registros, metas, vid, año, m, snapshots, vendedoras));
  const notas = datosMes.map(d => d.notaFinal);
  const conDatos = notas.filter(n => n !== null);
  const exigibles = mesesExigiblesTrimestre(año, q, snapshots);

  if (!conDatos.length) return {
    notaTrim: null, notasMes: notas, datosMes, mesesConDatos: 0,
    completo: false,
    // ⚠️ Esto NO puede ser un `false` fijo. `completoALaFecha` significa "tiene
    // dato en todos los meses del trimestre que YA cerraron", y cuando todavía
    // no ha cerrado ninguno la lista de exigibles está vacía → nadie le debe
    // nada a nadie y la respuesta es `true`. Con el `false` de antes, un
    // trimestre recién arrancado dejaba a TODAS en "mesIncompleto" y el ranking
    // trimestral salía vacío el trimestre entero. (Sin nota igual no se cobra
    // premio: calcPremios exige `notaTrim !== null`.)
    completoALaFecha: exigibles.every(i => notas[i] !== null),
    mesesExigibles: exigibles.length,
  };

  const sumPesos = notas.reduce((s, n, i) => n !== null ? s + PESOS_TRIMESTRE[i] : s, 0);
  const notaTrim = Math.round(notas.reduce((s, n, i) => n !== null ? s + n * PESOS_TRIMESTRE[i] : s, 0) / sumPesos * 100) / 100;

  return {
    notaTrim,
    notasMes: notas,
    datosMes,
    mesesConDatos: conDatos.length,
    // completo: los 3 meses del trimestre con dato. Sirve para la etiqueta
    // "x/3 meses" y para saber si el trimestre ya es FINAL.
    completo: conDatos.length === 3,
    // completoALaFecha: tiene dato en TODOS los meses ya cerrados del trimestre.
    // Es el criterio de PREMIOS (ver calcPremios): no castiga por meses que
    // todavía no ocurrieron, pero sí deja fuera a quien no hizo el trimestre.
    completoALaFecha: exigibles.every(i => notas[i] !== null),
    mesesExigibles: exigibles.length,
  };
}

// ############################################################################
// #                                                                          #
// #   QUIÉN PARTICIPA — UNA SOLA PUERTA PARA TODAS LAS PANTALLAS             #
// #                                                                          #
// ############################################################################
//
// REGLA DEL DUEÑO (18-ago-2026), TEXTUAL:
//   "Si yo en systemlap paso una vendedora de activa a desactivada, sencillamente
//    ya esa asesora se va de todos los rankings. (…) Sencillamente se guardan los
//    datos de ella para siempre pero ya no está participando ni en semanal ni en
//    mensual ni en nada. (…) Y obvio si ingresó a mitad de mes pues aparecerá en
//    el ranking mensual pero en el trimestral no está participando y ni debe
//    aparecer."
//
// TRADUCCIÓN A CÓDIGO:
//   R1. `activa === false` → fuera de TODO ranking EN VIVO (semanal, mensual,
//       trimestral) y de todos los premios. Sin sección aparte, sin listarla.
//   R2. Sus datos históricos se conservan para siempre. No se borra nada.
//   R3. El trimestral sólo incluye a quien está activa Y entró antes o el mismo
//       día en que arrancó el trimestre Y tiene datos de los meses del trimestre
//       que ya cerraron (los descansos cuentan como datos).
//   R4. Quien entró con el trimestre ya arrancado NO APARECE en el trimestral.
//       Ni listada, ni en sección aparte, ni en gris.
//   R5. Al arrancar el trimestre siguiente ya compite normalmente.
//
// ----------------------------------------------------------------------------
// ⚠️ ROSTER VIVO vs ROSTER CONGELADO — LA SEPARACIÓN QUE PROTEGE LA HISTORIA
// ----------------------------------------------------------------------------
// Un mes o un trimestre YA CERRADO no cambia nunca. Su ranking se lee del
// snapshot, con el roster que quedó escrito allí. `activa` y `eventual` son
// datos de HOY: aplicarlos sobre un periodo cerrado significaría que desactivar
// a alguien esta tarde borra su fila de julio y corre los puestos de las demás.
// Eso es reescribir la historia y está prohibido.
//
//   · ROSTER VIVO      → periodo ABIERTO. Se filtra por `activa`/`eventual` (R1).
//   · ROSTER CONGELADO → periodo CERRADO (hay snapshot). El universo son las que
//     quedaron escritas en el snapshot. NO se filtra por `activa` ni `eventual`.
//
// Lo que sí se aplica en los dos casos son las reglas DETERMINISTAS del
// trimestre (R3/R4): `fechaIngreso <= inicioTrimestre` y "tiene los meses
// exigibles". No dependen del estado de hoy, así que no mueven nada al pasar el
// tiempo — dan el mismo resultado hoy que el día del cierre.
//
// ----------------------------------------------------------------------------
// `entroTarde` NO ES `completoALaFecha` — y la diferencia es plata
// ----------------------------------------------------------------------------
// · `completoALaFecha` (lo calcula calcTrimestre) = "tiene nota en TODOS los
//   meses del trimestre que YA cerraron". Mira los DATOS.
// · `entroTarde` = "su fechaIngreso es posterior al primer día del trimestre".
//   Mira el CALENDARIO.
// Una vendedora que ingresó el 5 de julio con Q3 arrancando el 1 de julio puede
// tener nota en los tres meses y pasar `completoALaFecha` sin problema — pero
// entró con el trimestre arrancado y queda fuera igual. Ninguna implica a la
// otra: para participar hay que cumplir LAS DOS.

// Primer día del trimestre, en ISO. Mismo string con que compara la app clásica
// (App.jsx:1377): "2026-07-01" para Q3/2026.
export function inicioTrimestre(año, q) {
  return año + "-" + String((q - 1) * 3 + 1).padStart(2, "0") + "-01";
}

// ¿Entró con el trimestre ya arrancado?
// Criterio EXACTO de la app clásica (App.jsx:1380-1381):
//   elegible    = !fechaIngreso || fechaIngreso <= inicioTrim
//   entró tarde =  fechaIngreso && fechaIngreso >  inicioTrim
// SIN `fechaIngreso` = ELEGIBLE. Un dato que falta no descalifica a nadie.
export function entroTardeAlTrimestre(fechaIngreso, año, q) {
  if (!fechaIngreso) return false;
  return String(fechaIngreso) > inicioTrimestre(año, q);
}

// Alcances válidos. Semanal y mensual sólo miran R1; el trimestral suma R3+R4.
export const ALCANCES = ["semanal", "mensual", "trimestral"];

// Motivos por los que alguien NO participa. Orden de prioridad: el motivo que se
// reporta es el primero de esta lista que se cumpla.
export const MOTIVOS_NO_PARTICIPA = ["inactiva", "eventual", "entroTarde", "mesIncompleto"];

// Compat con el nombre viejo (lo usaba la UI del bloque "Solo ranking mensual",
// que ya no existe). Se conserva sólo para no romper imports externos.
export const MOTIVOS_NO_COMPITE = MOTIVOS_NO_PARTICIPA;

const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// "2026-07-05" → "5 de julio de 2026". Si no parsea, devuelve el string crudo.
export function fechaLarga(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return String(iso || "");
  const mes = MESES_LARGOS[Number(m[2]) - 1];
  if (!mes) return String(iso);
  return `${Number(m[3])} de ${mes} de ${m[1]}`;
}

// Trimestre hecho, según la fila del ranking.
// Preferimos `completoALaFecha` (lo calcula calcTrimestre). Si la fila viene de
// un llamador viejo que no lo trae, caemos a `completo` (3 de 3): es el criterio
// ESTRICTO, nunca paga de más.
const trimestreHecho = v => v?.completoALaFecha ?? v?.completo ?? false;

// ----------------------------------------------------------------------------
// ROSTERS CONGELADOS — quiénes quedaron escritas en los snapshots
// ----------------------------------------------------------------------------
// Devuelven `null` cuando el periodo NO está cerrado: ahí manda el roster vivo,
// que es lo correcto para un mes/trimestre en curso.

// `construirSnapshot` (CerrarMes.jsx) escribe una entrada por CADA vendedora del
// roster de entonces, incluidas las que ya estaban inactivas y no trabajaron ni
// un día. Estar en el snapshot no es lo mismo que haber participado: el roster
// congelado son las que tienen rastro real de ese mes.
function participoEnSnapshot(r) {
  if (!r) return false;
  return (r.dias || 0) > 0
    || (r.notaFinal !== null && r.notaFinal !== undefined)
    || (r.notaBase !== null && r.notaBase !== undefined)
    || (Number(r.real) || 0) > 0;
}

function idsDelSnapshot(snap) {
  return Object.entries(snap.vendedoras)
    .filter(([, r]) => participoEnSnapshot(r))
    .map(([k]) => String(k));
}

export function rosterCongeladoMes(vendedoras, año, mes, snapshots) {
  const snap = snapshots?.[claveMes(año, mes)];
  if (!snap || !snap.vendedoras) return null;
  const ids = new Set(idsDelSnapshot(snap));
  return (vendedoras || []).filter(v => ids.has(String(v.id)));
}

export function rosterCongeladoTrimestre(vendedoras, año, q, snapshots) {
  if (!año || !q) return null;
  const snaps = mesesTrimestre(q).map(m => snapshots?.[claveMes(año, m)]);
  if (snaps.some(s => !s || !s.vendedoras)) return null;
  const ids = new Set();
  snaps.forEach(s => idsDelSnapshot(s).forEach(k => ids.add(k)));
  return (vendedoras || []).filter(v => ids.has(String(v.id)));
}

// ¿Hay roster congelado para este alcance? La semana nunca se congela (no tiene
// snapshot), así que siempre va en vivo.
function rosterCongelado(vendedoras, alcance, ctx) {
  const { año = null, mes = null, q = null, snapshots = null } = ctx || {};
  if (!snapshots) return null;
  if (alcance === "mensual") return rosterCongeladoMes(vendedoras, año, mes, snapshots);
  if (alcance === "trimestral") return rosterCongeladoTrimestre(vendedoras, año, q, snapshots);
  return null;
}

// Datos del trimestre de UNA vendedora, para poder exigir R3.
// Si la fila ya los trae calculados (las pantallas los pasan así), se usan tal
// cual. Si no, se calculan con el motor. Si no hay ni fuentes ni datos, se
// devuelve null: sin información NO se descalifica a nadie.
function datosTrimestreDe(v, ctx) {
  if (typeof v?.completoALaFecha === "boolean") {
    return { completoALaFecha: v.completoALaFecha, mesesConDatos: v.mesesConDatos ?? null };
  }
  if (typeof v?.completo === "boolean") {
    return { completoALaFecha: v.completo, mesesConDatos: v.mesesConDatos ?? null };
  }
  const { registros, metas, snapshots, año, q, rosterCalculo } = ctx || {};
  if (!registros || !metas || !año || !q) return null;
  const t = calcTrimestre(registros, metas, v.id, año, q, snapshots || {}, rosterCalculo || []);
  return { completoALaFecha: t.completoALaFecha, mesesConDatos: t.mesesConDatos };
}

// ----------------------------------------------------------------------------
// EL PREDICADO ÚNICO
// ----------------------------------------------------------------------------
// Devuelve `null` si participa, o el motivo por el que no.
//
// ctx = { año, mes, q, snapshots, registros, metas, rosterCalculo, congelado }
//   · `congelado: true` → periodo cerrado: NO se aplican `activa`/`eventual`
//     (son datos de hoy y reescribirían la historia). `participantes()` lo
//     deduce solo mirando los snapshots; sólo hay que pasarlo a mano cuando se
//     evalúa una fila suelta fuera de esa función.
export function motivoNoParticipa(v, alcance, ctx = {}) {
  const { año = null, q = null, congelado = false } = ctx;

  // R1 — sólo sobre el roster VIVO. Ver el bloque "ROSTER VIVO vs CONGELADO".
  if (!congelado) {
    if (v?.activa === false) return "inactiva";
    if (v?.eventual === true) return "eventual";
  }

  if (alcance !== "trimestral") return null;

  // R4 — calendario. Determinista: da lo mismo hoy que el día del cierre, así
  // que se aplica también sobre periodos cerrados.
  const entroTarde = typeof v?.entroTarde === "boolean"
    ? v.entroTarde
    : (año && q ? entroTardeAlTrimestre(v?.fechaIngreso, año, q) : false);
  if (entroTarde) return "entroTarde";

  // R3 — datos de los 3 meses, EVALUADO A LA FECHA: los meses que todavía no
  // cerraron no se exigen (ver mesesExigiblesTrimestre). Sin esto, el trimestre
  // en curso quedaría vacío todos los días hasta el 30 de septiembre.
  const t = datosTrimestreDe(v, ctx);
  if (t && !t.completoALaFecha) return "mesIncompleto";

  return null;
}

// ----------------------------------------------------------------------------
// participantes(vendedoras, alcance, contexto)
// ----------------------------------------------------------------------------
// LA función. La usan TODAS las pantallas: no hay un segundo filtro en ningún
// otro archivo. Que existieran dos fue justo lo que hizo que la pantalla del
// dueño y la de la vendedora nombraran ganadoras distintas.
//
// `vendedoras` DEBE ser el roster COMPLETO (inactivas y eventuales incluidas):
// es lo único que permite reconstruir el roster congelado de un periodo cerrado.
// Filtrar antes de llamar rompe justamente la protección de la historia.
//
// contexto:
//   { año, mes, q,            — periodo
//     ciudad,                 — "MED" | "BOG" | null (MED y BOG no se mezclan)
//     snapshots,              — para detectar si el periodo ya cerró
//     registros, metas,       — para poder exigir R3 en el trimestral
//     rosterCalculo,          — roster completo para resolver ciudad al calcular
//     congelado }             — forzar modo histórico (normalmente se deduce)
export function participantes(vendedoras, alcance, ctx = {}) {
  const base = Array.isArray(vendedoras) ? vendedoras : [];
  const { ciudad = null } = ctx;

  const forzado = ctx.congelado === true;
  const congeladoRoster = forzado ? base : rosterCongelado(base, alcance, ctx);
  const esCongelado = forzado || congeladoRoster !== null;
  const universo = congeladoRoster || base;

  const enCiudad = ciudad ? universo.filter(v => v.ciudad === ciudad) : universo;
  const ctxFull = {
    ...ctx,
    congelado: esCongelado,
    rosterCalculo: ctx.rosterCalculo || base,
  };
  return enCiudad.filter(v => motivoNoParticipa(v, alcance, ctxFull) === null);
}

// Estado de participación de UNA vendedora/fila, con el texto para la UI.
// Se construye sobre `motivoNoParticipa`, así que no puede divergir de
// `participantes`. La usan la pantalla del dueño y la de la vendedora.
//
// Firma: elegibilidadTrimestral(v, ctx) con ctx = { año, q, congelado, ... }.
// Se acepta también la firma vieja (v, año, q) para no romper llamadores.
export function elegibilidadTrimestral(v, ctxOAño, qOpcional) {
  const ctx = (ctxOAño && typeof ctxOAño === "object")
    ? ctxOAño
    : { año: ctxOAño ?? null, q: qOpcional ?? null };

  const motivo = motivoNoParticipa(v, "trimestral", ctx);
  const fechaIngreso = v?.fechaIngreso ?? null;
  const t = datosTrimestreDe(v, ctx);
  const mesesConDatos = v?.mesesConDatos ?? t?.mesesConDatos ?? null;

  let texto = null;
  if (motivo === "inactiva") {
    texto = "Ya no está activa · No participa en el trimestre";
  } else if (motivo === "eventual") {
    texto = "Eventual · No participa en el trimestre";
  } else if (motivo === "entroTarde") {
    texto = fechaIngreso
      ? `Ingresó ${fechaLarga(fechaIngreso)} · Compite desde el próximo trimestre`
      : "Ingresó con el trimestre ya empezado · Compite desde el próximo trimestre";
  } else if (motivo === "mesIncompleto") {
    texto = mesesConDatos !== null
      ? `Le falta un mes ya cerrado del trimestre (${mesesConDatos}/3)`
      : "Le falta un mes ya cerrado del trimestre";
  }

  return {
    compite: motivo === null,
    motivo,                 // null | "inactiva" | "eventual" | "entroTarde" | "mesIncompleto"
    motivos: motivo ? [motivo] : [],
    inactiva: motivo === "inactiva",
    eventual: motivo === "eventual",
    entroTarde: motivo === "entroTarde",
    mesIncompleto: motivo === "mesIncompleto",
    fechaIngreso,
    mesesConDatos,
    texto,                  // null si participa
  };
}

// ¿El premio BASE de $1.000.000 (nota ≥4.50) exige haber hecho el trimestre?
//
// DECISIÓN (agosto 2026): SÍ, el mismo requisito que el extra.
//  · La nota trimestral se normaliza por los meses CON dato (ver calcTrimestre):
//    quien sólo tiene el mes 3 sale con la nota de ese mes tal cual. Pagar el
//    millón por un mes suelto vale lo mismo que pagarlo por tres sostenidos, y
//    es imposible de explicarle a las otras 12.
//  · El requisito es "completoALaFecha", no "3 de 3": los meses que todavía no
//    se han cerrado NO se exigen, así que el trimestre en curso sigue mostrando
//    premios en tiempo real y nadie pierde por un mes que aún no ocurrió.
//  · OJO: este requisito NO cubre a quien entró a mitad de trimestre. Ella
//    puede tener los tres meses y pasar `completoALaFecha` sin problema. A esa
//    la deja fuera `entroTarde`, que es una condición APARTE (ver el bloque
//    "QUIÉN PARTICIPA" arriba). Confundir las dos fue exactamente el error que
//    costaba $1.000.000.
//  · Contrapartida asumida: quien falta un mes cerrado completo (incapacidad,
//    licencia) pierde el premio base. Si el dueño decide que ese caso sí debe
//    cobrar, se cambia esta constante a false — vale para TODAS las pantallas,
//    que es lo importante: admin y vendedora nunca pueden diferir.
export const PREMIO_BASE_EXIGE_TRIMESTRE_COMPLETO = true;

// Calcula los premios trimestrales — SEPARADO POR CIUDAD (agosto 2026+)
// MED y BOG son 2 empresas independientes: nada se mezcla.
// Para cada ciudad, la regla es la misma:
// - Cada vendedora con nota trimestral ≥ 4.50 gana $1.000.000
// - Si 2+ pasan 4.50 en la ciudad, la #1 de esa ciudad gana $1.000.000 EXTRA
// - Si nadie pasa 4.50 en la ciudad, esa ciudad no entrega premio
//
// FILTROS QUE SON PLATA — todos los resuelve `elegibilidadTrimestral`, que a su
// vez es `motivoNoParticipa`. Aquí NO hay un segundo criterio:
//  1. INACTIVAS / EVENTUALES (R1) — sólo mientras el trimestre está EN CURSO.
//  2. ENTRÓ TARDE AL TRIMESTRE (`fechaIngreso > inicioTrimestre`, R4).
//  3. TRIMESTRE HECHO (`completoALaFecha`, R3). El extra SIEMPRE lo exige; el
//     base lo exige según PREMIO_BASE_EXIGE_TRIMESTRE_COMPLETO (hoy true).
//
// ⚠️ TRIMESTRE CERRADO: pasar `ctx.congelado = true`.
// Un trimestre cerrado tiene ganadora definitiva. `activa` y `eventual` son
// datos de HOY: si se aplicaran, la vendedora que ganó Q2 y renunció en julio
// perdería su premio de Q2 retroactivamente el día que el worker la marca
// eventual. Con `congelado` esos dos filtros no corren; los del calendario y
// los datos (2 y 3) sí, porque son deterministas y dan lo mismo hoy que el día
// del cierre.
//
// ------------------------------------------------------------
// EL EXTRA DE CIUDAD VA A LA MEJOR QUE PARTICIPA
// ------------------------------------------------------------
// Con la regla nueva del dueño, quien no participa ni siquiera llega hasta aquí:
// `participantes()` la sacó del ranking antes. Los filtros de abajo quedan como
// segunda barrera —si algún llamador pasa filas sin filtrar, no se paga de más—
// y para que el umbral de "2+ llegaron a 4.50" cuente sólo a quien puede cobrar:
// quien no puede ganar no puede crear la competencia que dispara el extra.
//
// Filas esperadas: { id, ciudad, notaTrim, realTrim, completoALaFecha|completo,
//                    mesesConDatos?, activa?, eventual?, fechaIngreso?, entroTarde? }
// `ctx` = { año, q, congelado } — año/q hacen falta para resolver `entroTarde`
// desde `fechaIngreso`. Si no llegan (llamador viejo, p. ej. la app clásica de
// src/App.jsx, que ya filtra por fechaIngreso ANTES de llamar), se respeta el
// booleano `entroTarde` de la fila y, si tampoco está, se asume que no entró
// tarde: el comportamiento de ese llamador no cambia.
export function calcPremios(rankingTrim, ctx = {}) {
  const { año = null, q = null, congelado = false } = ctx;
  const elCtx = { año, q, congelado };
  const nuevo = () => ({
    conBono: [], extraCiudad: null, sinPremioPorIncompleto: [],
    eventualesExcluidas: [], entroTardeExcluidas: [], noCompiten: [],
  });
  const resultado = { med: nuevo(), bog: nuevo() };

  for (const ciudad of ["MED", "BOG"]) {
    const key = ciudad.toLowerCase(); // "med" o "bog"
    const deCiudad = (rankingTrim || []).filter(v => v.ciudad === ciudad && v.notaTrim !== null);
    const conEstado = deCiudad.map(v => ({ v, el: elegibilidadTrimestral(v, elCtx) }));

    // Reporte para la UI: quién quedó fuera y POR QUÉ. Normalmente viene vacío,
    // porque `participantes()` ya filtró antes de llegar aquí.
    resultado[key].noCompiten = conEstado
      .filter(x => !x.el.compite)
      .map(x => ({ ...x.v, noCompite: x.el }));

    // Quien no participa sale del universo de premios ANTES de contar nada: ni
    // cobra, ni desplaza, ni cuenta para el "2+ llegaron a 4.50".
    const enCiudad = conEstado
      .filter(x => !x.el.inactiva && !x.el.eventual && !x.el.entroTarde)
      .map(x => x.v);

    resultado[key].eventualesExcluidas = conEstado
      .filter(x => (x.el.eventual || x.el.inactiva) && x.v.notaTrim >= 4.5).map(x => x.v);
    resultado[key].entroTardeExcluidas = conEstado
      .filter(x => x.el.entroTarde && x.v.notaTrim >= 4.5)
      .map(x => ({ ...x.v, noCompite: x.el }));

    if (!enCiudad.length) continue;

    // Las que pasan ≥4.50 en esta ciudad
    const llegan = enCiudad.filter(v => v.notaTrim >= 4.5);
    const conBono = PREMIO_BASE_EXIGE_TRIMESTRE_COMPLETO ? llegan.filter(trimestreHecho) : llegan;
    resultado[key].conBono = conBono;
    // Llegaron a 4.50 pero no hicieron el trimestre: se reportan para que la
    // pantalla pueda decir POR QUÉ no están en la lista de premios.
    resultado[key].sinPremioPorIncompleto = llegan.filter(v => !trimestreHecho(v));

    // Extra de ciudad: si 2+ ganan el premio base, la mejor gana $1M extra.
    // El extra exige trimestre hecho aunque el base no lo exija.
    if (conBono.length >= 2) {
      const candidatas = conBono.filter(trimestreHecho);
      if (candidatas.length) {
        const ordenado = [...candidatas].sort((a, b) =>
          (b.notaTrim - a.notaTrim) || ((b.realTrim ?? 0) - (a.realTrim ?? 0))
        );
        resultado[key].extraCiudad = ordenado[0];
      }
    }
  }

  return resultado;
}
