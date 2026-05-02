// Constantes de la app — Televentas Evaluación
// Versión 2 (mayo 2026 en adelante)

// Vendedoras por defecto (se sobreescribe con Firebase si existe)
export const VENDEDORAS_DEFAULT = [
  { id: 1, nombre: "Lorena Castrillón", ciudad: "MED", activa: true, fechaIngreso: "2026-04-01" },
  { id: 2, nombre: "Dayana Restrepo", ciudad: "MED", activa: true, fechaIngreso: "2026-04-01" },
  { id: 3, nombre: "Jennifer Gómez", ciudad: "MED", activa: true, fechaIngreso: "2026-04-01" },
  { id: 4, nombre: "Durley Castaño", ciudad: "MED", activa: true, fechaIngreso: "2026-04-01" },
  { id: 5, nombre: "Manuela Arenas", ciudad: "MED", activa: true, fechaIngreso: "2026-04-01" },
  { id: 6, nombre: "Xiomara Neuta", ciudad: "BOG", activa: true, fechaIngreso: "2026-04-01" },
  { id: 7, nombre: "Luisa Chavarría", ciudad: "MED", activa: true, fechaIngreso: "2026-04-01" },
  { id: 8, nombre: "Elena Ricardo", ciudad: "MED", activa: true, fechaIngreso: "2026-04-01" },
  { id: 9, nombre: "Leydy Sánchez", ciudad: "BOG", activa: true, fechaIngreso: "2026-04-01" },
  { id: 10, nombre: "Jackeline Solorza", ciudad: "BOG", activa: true, fechaIngreso: "2026-04-01" },
  { id: 11, nombre: "Yessica Acevedo", ciudad: "BOG", activa: true, fechaIngreso: "2026-04-01" },
  { id: 12, nombre: "Vanessa González", ciudad: "BOG", activa: true, fechaIngreso: "2026-04-01" },
  { id: 13, nombre: "Alisson González", ciudad: "BOG", activa: true, fechaIngreso: "2026-04-01" },
  { id: 14, nombre: "Betzabeth Leal", ciudad: "MED", activa: true, fechaIngreso: "2026-04-01" },
];

// Colores de ciudad
export const COLOR_CIUDAD = { BOG: "#f59e0b", MED: "#10b981" };
export const LABEL_CIUDAD = { BOG: "Bogotá", MED: "Medellín" };

// Indicadores NUEVOS (mayo 2026 en adelante)
// Cada uno con peso 10% — total comportamiento 50%, ventas 50%
export const INDICADORES_V2 = [
  { id: "puntualidad", label: "Puntualidad", emoji: "⏰", peso: 10, color: "#3b82f6" },  // azul
  { id: "resenas", label: "Reseñas", emoji: "⭐", peso: 10, color: "#eab308" },           // amarillo
  { id: "tienda", label: "Tienda", emoji: "🏪", peso: 10, color: "#10b981" },              // verde
  { id: "planilla", label: "Planilla", emoji: "📋", peso: 10, color: "#a855f7" },          // púrpura
  { id: "actitud", label: "Actitud", emoji: "💪", peso: 10, color: "#ec4899" },            // rosa
];

// Indicadores VIEJOS (abril 2026 y antes — para retrocompatibilidad)
export const INDICADORES_V1 = [
  { id: "puntualidad", label: "Puntualidad", emoji: "⏰", peso: 15, color: "#3b82f6" },
  { id: "resenas", label: "Reseñas", emoji: "⭐", peso: 10, color: "#eab308" },
  { id: "celular", label: "Celular", emoji: "📱", peso: 10, color: "#06b6d4" },
  { id: "uniforme", label: "Uniforme", emoji: "👔", peso: 10, color: "#8b5cf6" },
  { id: "tienda_e", label: "Tienda", emoji: "🏪", peso: 10, color: "#10b981" },
  { id: "planilla", label: "Planilla", emoji: "📋", peso: 15, color: "#a855f7" },
];

// Color para Ventas (siempre naranja, marca)
export const COLOR_VENTAS = "#ea580c";

// Mes a partir del cual se aplica V2 (mayo 2026)
export const FECHA_CORTE_V2 = { año: 2026, mes: 5 };

// Verifica si para un mes dado se debe usar la fórmula nueva
export function esFormulaV2(año, mes) {
  if (año > FECHA_CORTE_V2.año) return true;
  if (año < FECHA_CORTE_V2.año) return false;
  return mes >= FECHA_CORTE_V2.mes;
}

// Devuelve la lista de indicadores según el mes
export function getIndicadores(año, mes) {
  return esFormulaV2(año, mes) ? INDICADORES_V2 : INDICADORES_V1;
}

// ===========================================
// ROLES Y AUTENTICACIÓN (Firebase Auth)
// ===========================================
// Los emails autorizados están aquí. Las contraseñas están en Firebase
// (no en este código). Las reglas de Firestore validan que solo estos
// emails puedan modificar datos.
export const EMAIL_ADMIN = "luisponce.tv@gmail.com";
export const EMAIL_OFICINA = "info@televentas.com";

// Devuelve el rol del usuario logueado
export function rolDe(user) {
  if (!user || !user.email) return null;
  const e = user.email.toLowerCase();
  if (e === EMAIL_ADMIN.toLowerCase()) return "admin";
  if (e === EMAIL_OFICINA.toLowerCase()) return "oficina";
  return "otro";
}

export const esAdmin = (user) => rolDe(user) === "admin";
export const esOficina = (user) => rolDe(user) === "oficina";
export const puedeIngresoVentas = (user) => {
  const r = rolDe(user);
  return r === "admin" || r === "oficina";
};
export const puedeAdmin = (user) => rolDe(user) === "admin";

// Pesos del trimestre (mes 1, mes 2, mes 3)
export const PESOS_TRIMESTRE = [0.20, 0.30, 0.50];

// Mensaje cuando el ranking está apagado
export const MSG_RANKING_OFF = "🚀 Cada venta cuenta. Cada cliente importa.\nTus calificaciones se publicarán pronto.";

// Nombres de meses
export const MES_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
