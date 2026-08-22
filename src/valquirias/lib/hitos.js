// ============================================================================
// HITOS — qué celebración ya se le mostró a ELLA, en ESTE teléfono
// ============================================================================
// Aprobado por Luis el 22-ago-2026 (prototipo docs/prototipo-celebraciones.html).
//
// El problema que resuelve: una celebración que se repite cada vez que ella
// vuelve a la pantalla deja de ser una celebración. Ya pasa hoy con el confeti
// del lunes — `lunesCerrada` es un useState y el Home se desmonta al navegar,
// así que el confeti vuelve a caer cada vez que ella entra y sale.
//
// TRES DECISIONES QUE VALE LA PENA ENTENDER ANTES DE TOCAR ESTO:
//
// 1. LA MEMORIA GUARDA LO QUE SE CELEBRÓ, NUNCA LO QUE ELLA LOGRÓ.
//    El estado de la pantalla —la muesca blanca, la tarjeta crema— se deriva
//    en vivo del motor en cada render. Si una devolución la baja de tramo, eso
//    se deshace solo y en silencio. Aquí sólo vive "ya le mostré la fiesta del
//    escalón 2", que es una cosa distinta y que sí puede quedarse quieta.
//
// 2. SIEMBRA SILENCIOSA. La primera vez que no hay registro de un período se
//    anota el nivel de hoy SIN celebrar. Sin esto, el día que se publique la
//    función quince vendedoras reciben una fiesta por un tramo que cruzaron
//    hace tres semanas. El precio: si el cruce ocurre justo en la primerísima
//    apertura del mes, se pierde esa celebración. Se prefiere perder una a
//    inventar una. (La tarjeta del lunes NO siembra — ver `sembrar`.)
//
// 3. MONOTÓNICA DENTRO DEL PERÍODO. `cel` sólo sube. Si baja de tramo y vuelve
//    a subir, no hay segunda fiesta del mismo escalón: repetirla se leería
//    como burla.
//
// El período va DENTRO del valor y no en el nombre de la llave, para que la
// llave se recicle sola: si el período guardado no es el de hoy, se lee como
// cero y se sobrescribe. Así no se acumula basura en el teléfono y no hace
// falta ninguna rutina de barrido.
//
// El id de la vendedora va en el nombre de la llave porque en tienda se prestan
// el celular y en el mismo navegador entran varias.

import { lee, guarda } from "../auth/acceso.js";

// Respaldo en memoria para cuando el navegador bloquea el storage (Safari en
// modo privado): `lee` devuelve null siempre y sin esto la fiesta se repetiría
// en bucle dentro de la misma sesión. No sobrevive a un recargue, y está bien:
// lo peor que pasa es que la vea una vez más, y nada de lo que dice deja de ser
// verdad.
const enMemoria = new Map();

const llave = (nombre, vid) => `vk_hito_${nombre}_${vid}`;

function leerRegistro(nombre, vid) {
  const k = llave(nombre, vid);
  if (enMemoria.has(k)) return enMemoria.get(k);
  const crudo = lee("localStorage", k);
  if (!crudo) return null;
  try {
    const r = JSON.parse(crudo);
    return r && typeof r === "object" ? r : null;
  } catch {
    return null;  // basura de una versión vieja: se trata como si no hubiera
  }
}

// ¿Hay que celebrar? Es PURA: no escribe nada. Se puede llamar en el
// inicializador de un useState sin que StrictMode la ejecute dos veces cause
// daño, que es justo donde se usa.
//
// - nombre:  "mes" | "trim" | "lunes"
// - vid:     id de la vendedora
// - periodo: "2026-08" | "2026-Q3" | "2026-08-24"  (lo que hace única la ocasión)
// - nivel:   escalón alcanzado hoy. null/0 = no hay nada que celebrar.
// - sembrar: true (por defecto) = la primera vez de un período NO celebra, sólo
//            anota. false = la primera vez SÍ celebra; es lo correcto para la
//            tarjeta del lunes, que no arrastra nada viejo: la semana que cerró
//            cerró anoche.
export function hitoPendiente(nombre, vid, periodo, nivel, { sembrar = true } = {}) {
  if (vid == null || !periodo) return false;
  const n = Number(nivel);
  if (!Number.isFinite(n) || n <= 0) return false;

  const reg = leerRegistro(nombre, vid);
  const mismoPeriodo = reg && reg.p === periodo;
  if (!mismoPeriodo) return !sembrar;      // período nuevo: sembrar o celebrar
  return n > (Number(reg.cel) || 0);
}

// Anota hasta dónde se le celebró. Idempotente y monotónica dentro del período:
// llamarla de más no cambia nada. Va en un useEffect, después de pintar.
export function marcarHito(nombre, vid, periodo, nivel) {
  if (vid == null || !periodo) return;
  const n = Number(nivel);
  if (!Number.isFinite(n) || n <= 0) return;

  const reg = leerRegistro(nombre, vid);
  const previo = reg && reg.p === periodo ? Number(reg.cel) || 0 : 0;
  if (previo >= n) return;

  const k = llave(nombre, vid);
  const nuevo = { p: periodo, cel: n };
  enMemoria.set(k, nuevo);
  guarda("localStorage", k, JSON.stringify(nuevo));
}

// ---------------------------------------------------------------------------
// Los períodos, en un solo sitio para que "2026-08" no se escriba de dos formas
// distintas en dos archivos.
// ---------------------------------------------------------------------------
export const periodoMes = (año, mes) => `${año}-${String(mes).padStart(2, "0")}`;
export const periodoTrim = (año, q) => `${año}-Q${q}`;

// ---------------------------------------------------------------------------
// EL NIVEL DEL MES — en qué escalón de plata está HOY
// ---------------------------------------------------------------------------
// Se compara el arranque de su tramo contra los arranques de la tabla del año,
// no el nombre del tramo: los nombres son texto y la tabla cambia cada enero.
//
//   1  Medellín por debajo del piso — todavía gana $0
//   2  piso cruzado / tramo 1
//   3  tramo 2
//   4  tramo 3
//
// ⚠️ ARRANCA EN 1, NO EN 0, Y ESO IMPORTA. `marcarHito` ignora los niveles <= 0,
// así que un 0 nunca se guardaría: la vendedora de Medellín pasaría el mes bajo
// el piso sin dejar registro, y el día que lo cruzara se leería como "período
// nuevo" y la siembra silenciosa se comería justo la celebración más importante
// de las dos ciudades. Con el 1 sí queda registro, y el paso 1 → 2 celebra.
//
// En Bogotá no hay piso: entra directo en 2 y la siembra hace que estar en el
// tramo 1 nunca se anuncie, que es lo correcto — eso no es un logro.
//
// Sin ventas devuelve null: ni se celebra ni se siembra, porque el cero duro de
// `calcNotaMensual` fabricaría un tramo falso.
export function nivelDelMes({ hayVentas, tramoInfo, piso, tabla }) {
  if (!hayVentas || !Array.isArray(tabla) || !tabla.length) return null;
  if (piso && piso.aplica && !piso.superado) return 1;
  if (!tramoInfo) return null;
  const i = tabla.findIndex((t) => t.min === tramoInfo.minVentas);
  return i >= 0 ? i + 2 : null;
}
