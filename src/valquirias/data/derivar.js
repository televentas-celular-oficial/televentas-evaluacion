// Funciones para derivar datos "visibles" desde los datos crudos de Firestore.
// Objetivo: los tabs reciben datos ya calculados de la vendedora que se ve.

import { calcComisionMensual, hoyColombia, formatoK, fechaBonita, tramoActual, siguienteTramo, premioTramo, TRAMOS_2026 } from "../lib/helpers.js";

const MES_NOMBRES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

// ============================================================
// Ventas totales del mes por ciudad (para admin hero)
// ============================================================
export function derivarVentasTotalesMes(datos, año, mes) {
  const { metas, vendedoras } = datos;
  const claveMes = `${año}_${String(mes).padStart(2, "0")}`;
  const ventas = metas?.[claveMes]?.vendidas || {};
  let med = 0, bog = 0;
  (vendedoras || []).forEach(v => {
    if (v.eventual) return;
    const val = ventas[v.id] || 0;
    if (v.ciudad === "MED") med += val;
    else if (v.ciudad === "BOG") bog += val;
  });
  return { med, bog, total: med + bog };
}

// ============================================================
// Ranking del mes en curso, filtrado por ciudad
// ============================================================
export function derivarRankingMes(datos, ciudad, año, mes, miId) {
  const { metas, vendedoras } = datos;
  const claveMes = `${año}_${String(mes).padStart(2, "0")}`;
  const ventasDelMes = metas?.[claveMes]?.vendidas || {};

  const activasCiudad = (vendedoras || [])
    .filter(v => v.activa !== false && !v.eventual)
    .filter(v => !ciudad || v.ciudad === ciudad);

  const filas = activasCiudad.map(v => ({
    id: v.id,
    nombre: v.nombre,
    ciudad: v.ciudad,
    valor: ventasDelMes[v.id] || 0,
  }));

  filas.sort((a, b) => b.valor - a.valor);

  return filas.map((f, i) => {
    const n = i + 1;
    const gap = i > 0 ? `-${formatoK(filas[i - 1].valor - f.valor)}` : null;
    const esYo = f.id === miId;
    const medal = esYo ? "⭐" : "";
    return { ...f, n, gap, esYo, medal };
  });
}

// ============================================================
// Datos "Este mes" de una vendedora específica
// ============================================================
export function derivarMesDeVendedora(datos, vendedora, año, mes) {
  const claveMes = `${año}_${String(mes).padStart(2, "0")}`;
  const meta = datos.metas?.[claveMes]?.meta;
  const metaCiudad = typeof meta === "object" ? (meta[vendedora.ciudad] || 0) : (meta || 0);
  const ventasMes = datos.metas?.[claveMes]?.vendidas?.[vendedora.id] || 0;

  const rol = vendedora.rolTienda === "admin" ? "admin" : "asesora";
  const tramo = tramoActual(ventasMes, rol);
  const sig = siguienteTramo(ventasMes, rol);
  const ganado = tramo ? premioTramo(ventasMes, tramo) : 0;
  const faltaSig = sig ? Math.max(0, sig.minVentas - ventasMes) : 0;

  const calc = calcComisionMensual({
    ciudad: vendedora.ciudad,
    rol,
    ventasMes,
  });

  const hoy = hoyColombia();
  const ultimoDia = new Date(año, mes, 0).getDate();
  const dia = (hoy.año === año && hoy.mes === mes) ? hoy.dia : ultimoDia;

  const pctMeta = metaCiudad > 0 ? Math.round((ventasMes / metaCiudad) * 100) : 0;

  return {
    ventas: ventasMes,
    meta: metaCiudad,
    pctMeta,
    dia,
    diasMes: ultimoDia,
    tramo: tramo ? tramo.nombre : null,
    ganado: calc.comision,
    siguienteTramo: sig ? `${sig.nombre} (${rol === "admin" ? sig.pctAdmin * 100 : sig.pctAsesora * 100}%)` : null,
    faltaSiguiente: faltaSig,
    nota: 0, // TODO: calcular nota real cuando registros esté conectado
  };
}

// ============================================================
// Datos "Hoy" (día actual)
// ============================================================
export function derivarHoyDeVendedora(datos, vendedora) {
  const hoy = hoyColombia();
  return {
    fecha: fechaBonita(hoy.iso),
    ventasDia: 0,      // TODO: calcular desde ventas del día actual (requiere sync ampliada)
    efectivoDia: 0,    // TODO
    tickets: 0,        // TODO
  };
}

// ============================================================
// Datos "Esta semana" (efectivo) — TODO cuando sync traiga efectivo desglosado
// ============================================================
export function derivarSemanaDeVendedora(datos, vendedora) {
  return {
    efectivo: 0,
    gano50k: false,
    top3: [],
    rankingCiudad: [],
  };
}

// ============================================================
// Datos de trimestre
// ============================================================
export function derivarTrimestreDeVendedora(datos, vendedora) {
  const hoy = hoyColombia();
  const q = Math.ceil(hoy.mes / 3);
  return {
    q: `Q${q}`,
    año: hoy.año,
    nota: 0, // TODO: calcular con snapshots + mes actual
    posicion: 0,
    premio: null,
  };
}

// ============================================================
// Comportamiento
// ============================================================
export function derivarComportamientoDeVendedora(datos, vendedora) {
  return {
    notaTotal: 0, // TODO: calcular desde registros
    estado: "ok",
    resenas: 0,
    indicadores: [],
  };
}

// ============================================================
// Total ganado en el año (todos los meses cerrados + mes actual proyectado)
// ============================================================
export function derivarTotalAñoDeVendedora(datos, vendedora) {
  const hoy = hoyColombia();
  let salarioBase = 0;
  let premiosMensuales = 0;

  // Salario base: $2M × meses trabajados este año
  const mesesTrabajados = hoy.mes;
  salarioBase = mesesTrabajados * 2_000_000;

  // Premios mensuales: sumar comisión de cada mes con ventas
  for (let m = 1; m <= hoy.mes; m++) {
    const claveMes = `${hoy.año}_${String(m).padStart(2, "0")}`;
    const ventasMes = datos.metas?.[claveMes]?.vendidas?.[vendedora.id] || 0;
    if (ventasMes > 0) {
      const calc = calcComisionMensual({
        ciudad: vendedora.ciudad,
        rol: vendedora.rolTienda === "admin" ? "admin" : "asesora",
        ventasMes,
      });
      premiosMensuales += calc.comision;
    }
  }

  return {
    total: salarioBase + premiosMensuales,
    desglose: {
      salarioBase,
      premiosMensuales,
      premiosSemanales: 0,       // TODO
      premiosTrimestrales: 0,    // TODO
      reconocimientos: "",
    },
    proyeccion: (salarioBase + premiosMensuales) * (12 / Math.max(1, hoy.mes)),
  };
}

// ============================================================
// Foco del día (mensaje motivacional contextual)
// ============================================================
export function derivarFocoDelDia({ mes, ciudad, semana }) {
  // Pre-piso MED
  if (ciudad === "MED" && mes.ventas < 15_000_000) {
    const faltaPiso = 15_000_000 - mes.ventas;
    const diasQueQuedan = Math.max(1, mes.diasMes - mes.dia);
    const perDia = Math.ceil(faltaPiso / diasQueQuedan);
    return {
      msg: `Con ${formatoK(perDia)} más al día llegas al piso en ${diasQueQuedan} días 💪`,
      tipo: "piso",
    };
  }

  if (semana?.gano50k && semana?.top3?.[0]?.esYo) {
    return { msg: `Vas #1 del EXTRA de $50k. ¡Manténlo! 🔥`, tipo: "normal" };
  }

  if (semana && !semana.gano50k) {
    const falta = Math.max(0, 2_500_000 - (semana.efectivo || 0));
    return {
      msg: `Con ${formatoK(falta)} más en efectivo entras al club de los $50k semanales 💪`,
      tipo: "normal",
    };
  }

  return { msg: "Cada venta cuenta · cada cliente importa 💪", tipo: "normal" };
}

// ============================================================
// Todo-en-uno: ARMA los props para las tabs desde datos crudos + vendedora
// ============================================================
export function derivarDatosVendedora(datos, vendedora) {
  const hoy = hoyColombia();
  const mesData = derivarMesDeVendedora(datos, vendedora, hoy.año, hoy.mes);
  const semanaData = derivarSemanaDeVendedora(datos, vendedora);
  const hoyData = derivarHoyDeVendedora(datos, vendedora);
  const trimData = derivarTrimestreDeVendedora(datos, vendedora);
  const compData = derivarComportamientoDeVendedora(datos, vendedora);
  const añoData = derivarTotalAñoDeVendedora(datos, vendedora);
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
    proyeccion: añoData.proyeccion,
    desgloseAño: añoData.desglose,
    semanaCerrada: null, // TODO: solo lunes con snapshot de semana anterior
  };
}
