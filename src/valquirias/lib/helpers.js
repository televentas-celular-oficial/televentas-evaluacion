// Helpers para Valquirias TLV — formato, fechas, cálculos rápidos

// $12.345.678 → "$12.3M" o "$12.345.678" según variante
export function formatoPesos(n, opts = {}) {
  const val = Number(n) || 0;
  if (opts.corto) {
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}k`;
    return `$${val}`;
  }
  return "$" + val.toLocaleString("es-CO");
}

export function formatoK(n) {
  const val = Number(n) || 0;
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
  if (min == null) return "sync desconocido";
  if (min < 1) return "actualizado hace segundos";
  if (min < 60) return `actualizado hace ${min} min`;
  const h = Math.floor(min / 60);
  return `actualizado hace ${h}h`;
}

// Confetti pieces (18 unidades)
export const CONFETTI_PIECES = Array.from({ length: 18 }, (_, i) => {
  const colores = ["#f472b6", "#fbbf24", "#34d399", "#60a5fa", "#a855f7", "#f97316", "#ec4899", "#10b981", "#eab308", "#06b6d4"];
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

// Tramos de comisión (2026 — fijo)
export const TRAMOS = {
  asesora: [
    { nombre: "META 1", pct: 0.01, minVentas: 15_000_000 },
    { nombre: "META 2", pct: 0.02, minVentas: 25_000_000 },
    { nombre: "META 3", pct: 0.03, minVentas: 35_000_000 },
  ],
  admin: [
    { nombre: "META 1", pct: 0.02, minVentas: 15_000_000 },
    { nombre: "META 2", pct: 0.04, minVentas: 25_000_000 },
    { nombre: "META 3", pct: 0.06, minVentas: 35_000_000 },
  ],
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
