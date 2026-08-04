// Funciones para derivar datos "visibles" (ranking, comisión, foco, etc.)
// desde los datos crudos de Firestore (registros, metas, vendedoras, snapshots).
//
// Objetivo: TabHoy, TabRanking, etc. reciben ya los datos calculados.
// El resto de la app no necesita conocer la estructura interna.

import { calcNotaMensual, calcRanking, metaParaCiudad, calcTrimestre } from "../../lib/calculos.js";
import { calcComisionMensual, hoyColombia, formatoK } from "../lib/helpers.js";

// Devuelve el ranking del mes en curso, filtrado por ciudad
export function derivarRankingMes(datos, ciudad, año, mes) {
  const { registros, metas, vendedoras, snapshots } = datos;
  const claveMes = `${año}_${String(mes).padStart(2, "0")}`;
  const ventasDelMes = metas[claveMes]?.vendidas || {};

  const activasCiudad = vendedoras
    .filter(v => v.activa !== false)
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
    const medal = n === 1 ? "⭐" : "";
    return { ...f, n, medal };
  });
}

// Ventas totales del mes por ciudad (para admin hero)
export function derivarVentasTotalesMes(datos, año, mes) {
  const { metas, vendedoras } = datos;
  const claveMes = `${año}_${String(mes).padStart(2, "0")}`;
  const ventas = metas[claveMes]?.vendidas || {};
  let med = 0, bog = 0;
  vendedoras.forEach(v => {
    const val = ventas[v.id] || 0;
    if (v.ciudad === "MED") med += val;
    else if (v.ciudad === "BOG") bog += val;
  });
  return { med, bog, total: med + bog };
}

// Nómina de comisiones para un mes específico
export function derivarNominaComisiones(datos, año, mes) {
  const { metas, vendedoras } = datos;
  const claveMes = `${año}_${String(mes).padStart(2, "0")}`;
  const ventas = metas[claveMes]?.vendidas || {};

  return vendedoras
    .filter(v => v.activa !== false)
    .map(v => {
      const ventasMes = ventas[v.id] || 0;
      const rolTienda = v.rolTienda || "asesora";
      const calc = calcComisionMensual({
        ciudad: v.ciudad,
        rol: rolTienda,
        ventasMes,
        // TODO: pasar datosCambioRol si v.fechaAscensoAdmin cae en el mes
      });
      return { v: { ...v, rolTienda }, ventas: ventasMes, calc };
    });
}

// Foco del día — string motivador según el estado actual de la vendedora
export function derivarFocoDelDia({ mes, ciudad, semana }) {
  // Pre-piso MED
  if (ciudad === "MED" && mes.ventas < 15_000_000) {
    const faltaPiso = 15_000_000 - mes.ventas;
    const diasQueQuedan = mes.diasMes - mes.dia;
    const perDia = diasQueQuedan > 0 ? Math.ceil(faltaPiso / diasQueQuedan) : faltaPiso;
    return {
      msg: `Con ${formatoK(perDia)} más al día llegas al piso en ${diasQueQuedan} días 💪`,
      tipo: "piso",
    };
  }

  // Cerca del EXTRA de $50k (top 1 semanal)
  if (semana?.gano50k && semana?.top3?.[0]?.esYo) {
    return {
      msg: `Vas #1 del EXTRA de $50k. ¡Manténlo! 🔥`,
      tipo: "normal",
    };
  }

  // Aún no gana los $50k semanal
  if (semana && !semana.gano50k) {
    const falta = Math.max(0, 2_500_000 - (semana.efectivo || 0));
    return {
      msg: `Con ${formatoK(falta)} más en efectivo entras al club de los $50k semanales 💪`,
      tipo: "normal",
    };
  }

  return { msg: "Cada venta cuenta · cada cliente importa 💪", tipo: "normal" };
}
