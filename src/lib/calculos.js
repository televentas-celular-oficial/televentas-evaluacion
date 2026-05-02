// Funciones de cálculo — Televentas Evaluación
// Maneja fórmulas V1 (abril y antes) y V2 (mayo en adelante)
// Si hay snapshot del mes (cerrado), usa esos valores en vez de calcular

import { INDICADORES_V1, INDICADORES_V2, esFormulaV2, getIndicadores, PESOS_TRIMESTRE } from "./constantes.js";

// ============================================================
// HELPERS
// ============================================================

export const fmtN = n => n === null || n === undefined ? "—" : Number(n).toFixed(2);
export const colorN = n => n === null ? "#475569" : n >= 4.5 ? "#059669" : n >= 3.5 ? "#d97706" : n >= 2.5 ? "#ea580c" : "#dc2626";
export const bgN = n => n === null ? "#f1f5f9" : n >= 4.5 ? "#d1fae5" : n >= 3.5 ? "#fef3c7" : n >= 2.5 ? "#ffedd5" : "#fee2e2";
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

// V1 (legacy)
function calcMesV1(registros, vid, año, mes) {
  const pref = vid + "_" + año + "-" + String(mes).padStart(2, "0");
  const dias = Object.entries(registros).filter(([k, r]) => k.startsWith(pref) && !r.descanso).map(([, r]) => r);
  if (!dias.length) return { nota: null, dias: 0, porInd: {} };
  const porInd = {};
  INDICADORES_V1.forEach(ind => {
    const ns = dias.map(r => notaIndicadorV1(r, ind.id)).filter(n => n !== null);
    porInd[ind.id] = ns.length ? Math.round(ns.reduce((a, b) => a + b, 0) / ns.length * 100) / 100 : null;
  });
  // Suma ponderada / suma de pesos = 70 (V1)
  const totalPeso = INDICADORES_V1.reduce((s, i) => s + i.peso, 0);
  const notaBase = Math.round(INDICADORES_V1.reduce((s, i) => s + (porInd[i.id] ?? 0) * i.peso, 0) / totalPeso * 100) / 100;
  return { nota: notaBase, dias: dias.length, porInd };
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

  // Nota base: promedio ponderado (todos los pesos son 10, total 50)
  const totalPeso = INDICADORES_V2.reduce((s, i) => s + i.peso, 0); // 50
  const notaBase = Math.round(INDICADORES_V2.reduce((s, i) => s + (porInd[i.id] ?? 0) * i.peso, 0) / totalPeso * 100) / 100;

  return { nota: notaBase, dias: dias.length, porInd, detalle };
}

// API pública: calcula el mes (con switch viejo/nuevo)
export function calcMes(registros, vid, año, mes, snapshots) {
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
      };
    }
  }
  if (esFormulaV2(año, mes)) return calcMesV2(registros, vid, año, mes);
  return calcMesV1(registros, vid, año, mes);
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

export function calcNotaMensual(registros, metas, vid, año, mes, snapshots) {
  const { nota: notaBase, dias, porInd, detalle, cerrado } = calcMes(registros, vid, año, mes, snapshots);
  const metaInfo = metas[claveMes(año, mes)] || { meta: 0, vendidas: {} };
  const real = metaInfo.vendidas?.[vid] ?? 0;
  const meta = metaInfo.meta || 0;
  const pct = meta > 0 ? Math.round((real / meta) * 100) : 0;

  let notaVentas = null;
  if (meta > 0) {
    notaVentas = Math.min(5, Math.round((1 + (real / meta) * 4) * 100) / 100);
  }

  // Si hay snapshot, usar nota final del snapshot
  if (cerrado && snapshots) {
    const snap = snapshots[claveMes(año, mes)];
    const v = snap?.vendedoras?.[vid];
    if (v) {
      return {
        notaBase, dias, porInd, detalle, cerrado: true,
        notaVentas: v.notaVentas ?? notaVentas,
        notaFinal: v.notaFinal,
        bono: v.bono || 0,
        real, meta, pct,
        version: snap.version || (esFormulaV2(año, mes) ? "v2" : "v1"),
      };
    }
  }

  let notaFinal = notaBase;
  let bono = 0;

  if (esFormulaV2(año, mes)) {
    // V2: pesos 50/50, bono escalonado con filtro
    if (notaBase !== null && notaVentas !== null) {
      // Comportamiento (50%) + Ventas (50%)
      const compNorm = notaBase; // notaBase ya está sobre 5
      const ventasNorm = notaVentas;
      notaFinal = Math.round((compNorm * 0.5 + ventasNorm * 0.5) * 100) / 100;
      bono = bonoVentas(pct, notaBase);
      notaFinal = Math.round((notaFinal + bono) * 100) / 100;
    } else if (notaBase !== null) {
      notaFinal = notaBase; // Sin ventas todavía: solo nota base
    }
  } else {
    // V1: pesos 70/30
    if (notaBase !== null && notaVentas !== null) {
      notaFinal = Math.round((notaBase * 70 + notaVentas * 30) / 100 * 100) / 100;
    }
  }

  return {
    notaBase, dias, porInd, detalle, cerrado: false,
    notaVentas, notaFinal, bono,
    real, meta, pct,
    version: esFormulaV2(año, mes) ? "v2" : "v1",
  };
}

// ============================================================
// RANKING MENSUAL
// ============================================================

export function calcRanking(registros, metas, año, mes, vendedoras, snapshots) {
  const activas = vendedoras.filter(v => v.activa !== false);
  const datos = activas.map(v => {
    const r = calcNotaMensual(registros, metas, v.id, año, mes, snapshots);
    return { ...v, ...r };
  });
  // Ordenar por nota final descendente, desempate por ventas
  const sorted = [...datos].sort((a, b) =>
    ((b.notaFinal ?? -1) - (a.notaFinal ?? -1)) || ((b.real ?? 0) - (a.real ?? 0))
  );
  sorted.forEach((v, i) => { v.rankGen = v.notaFinal !== null ? i + 1 : null; });
  return sorted;
}

// ============================================================
// TRIMESTRE Y PREMIOS
// ============================================================

// Calcula la nota trimestral de una vendedora (con pesos 20/30/50)
export function calcTrimestre(registros, metas, vid, año, q, snapshots) {
  const meses = mesesTrimestre(q);
  const datosMes = meses.map(m => calcNotaMensual(registros, metas, vid, año, m, snapshots));
  const notas = datosMes.map(d => d.notaFinal);
  const conDatos = notas.filter(n => n !== null);
  if (!conDatos.length) return { notaTrim: null, notasMes: notas, datosMes, mesesConDatos: 0, completo: false };

  const sumPesos = notas.reduce((s, n, i) => n !== null ? s + PESOS_TRIMESTRE[i] : s, 0);
  const notaTrim = Math.round(notas.reduce((s, n, i) => n !== null ? s + n * PESOS_TRIMESTRE[i] : s, 0) / sumPesos * 100) / 100;

  return {
    notaTrim,
    notasMes: notas,
    datosMes,
    mesesConDatos: conDatos.length,
    completo: conDatos.length === 3,
  };
}

// Calcula los premios trimestrales según las reglas nuevas
export function calcPremios(rankingTrim) {
  // rankingTrim: array de { vid, nombre, ciudad, notaTrim, ... }
  const conNota = rankingTrim.filter(v => v.notaTrim !== null);
  if (!conNota.length) return { mejorMED: null, mejorBOG: null, conBono: [], extraNacional: null };

  // Mejor de cada ciudad (sin filtro de nota)
  const med = conNota.filter(v => v.ciudad === "MED").sort((a, b) => b.notaTrim - a.notaTrim);
  const bog = conNota.filter(v => v.ciudad === "BOG").sort((a, b) => b.notaTrim - a.notaTrim);
  const mejorMED = med[0] || null;
  const mejorBOG = bog[0] || null;

  // Las que pasan ≥4.5
  const conBono = conNota.filter(v => v.notaTrim >= 4.5);

  // Extra nacional: si 2+ pasan 4.5, la #1 nacional (la de mayor nota, desempate por ventas) gana +$1M
  let extraNacional = null;
  if (conBono.length >= 2) {
    const ordenado = [...conBono].sort((a, b) =>
      (b.notaTrim - a.notaTrim) || ((b.realTrim ?? 0) - (a.realTrim ?? 0))
    );
    extraNacional = ordenado[0];
  }

  return { mejorMED, mejorBOG, conBono, extraNacional };
}
