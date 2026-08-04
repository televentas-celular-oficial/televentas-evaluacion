// Constantes de la app — Televentas Evaluación
// Versión 2 (mayo 2026 en adelante)

// Vendedoras por defecto (se sobreescribe con Firebase si existe)
// Roster REAL 2026-08 según Luis:
// - 13 activas: 6 MED + 7 BOG
// - 3 inactivas: Elena, Betzabeth (MED) + Vanessa (BOG)
// - Laura Sánchez NO está aquí (es eventual, solo en systemlap)
// - rolTienda: "admin" (administradora) o "asesora" — determina tramos de comisión
// - Emails ya cargados (para whitelist de Magic Link)
export const VENDEDORAS_DEFAULT = [
  // MEDELLÍN — 3 admin + 3 asesoras
  { id: 1,  nombre: "Angie Lorena Castrillón Quintana",   ciudad: "MED", rolTienda: "admin",   email: "castrillonlorena9@gmail.com",       activa: true, fechaIngreso: "2026-04-01" },
  { id: 2,  nombre: "Dayana Alejandra Restrepo Torres",   ciudad: "MED", rolTienda: "admin",   email: "dayana.aleja.2020@gmail.com",       activa: true, fechaIngreso: "2026-04-01" },
  { id: 3,  nombre: "Jennifer Andrea Gómez Moreno",       ciudad: "MED", rolTienda: "asesora", email: "jennifergomezm1011@gmail.com",      activa: true, fechaIngreso: "2026-04-01" },
  { id: 4,  nombre: "Durley Omaira Castaño García",       ciudad: "MED", rolTienda: "admin",   email: "durleycastanogarcia1026@gmail.com", activa: true, fechaIngreso: "2026-04-01" },
  { id: 5,  nombre: "Manuela Arenas Flórez",              ciudad: "MED", rolTienda: "asesora", email: "manuelaflorez2120@gmail.com",       activa: true, fechaIngreso: "2026-04-01" },
  { id: 7,  nombre: "Luisa Fernanda Chavarría Chavarría", ciudad: "MED", rolTienda: "asesora", email: "luixa.fer96@gmail.com",             activa: true, fechaIngreso: "2026-04-01" },

  // BOGOTÁ — 5 admin + 2 asesoras
  { id: 6,  nombre: "Beatriz Xiomara Neuta Umaña",        ciudad: "BOG", rolTienda: "admin",   email: "xiomineuta@gmail.com",                          activa: true, fechaIngreso: "2026-04-01" },
  { id: 9,  nombre: "Leydy Juliet Sánchez Ballesteros",   ciudad: "BOG", rolTienda: "admin",   email: "leydysanchez738@gmail.com",                     activa: true, fechaIngreso: "2026-04-01" },
  { id: 10, nombre: "Mary Jacqueline Solorza Rodríguez",  ciudad: "BOG", rolTienda: "admin",   email: "mjakyrs@hotmail.com",                           activa: true, fechaIngreso: "2026-04-01" },
  { id: 11, nombre: "Yesica Yusney Acevedo Barreto",      ciudad: "BOG", rolTienda: "admin",   email: "yesidiana320@gmail.com",                        activa: true, fechaIngreso: "2026-04-01" },
  { id: 13, nombre: "Alisson Nicol González Medina",      ciudad: "BOG", rolTienda: "admin",   email: "alissonnicolgonzalesmedina2005@gmail.com",      activa: true, fechaIngreso: "2026-04-01" },
  { id: 15, nombre: "Norvy Johanna Pérez Pacheco",        ciudad: "BOG", rolTienda: "asesora", email: "norvyjohanna37@gmail.com",                      activa: true, fechaIngreso: "2026-06-01" },
  { id: 16, nombre: "Paula Liseth Camacho López",         ciudad: "BOG", rolTienda: "asesora", email: "paulaliseth.camacholopez8@gmail.com",           activa: true, fechaIngreso: "2026-06-01" },

  // INACTIVAS — se mantienen en el roster para preservar histórico
  { id: 8,  nombre: "Elena Ricardo",     ciudad: "MED", rolTienda: "asesora", activa: false, fechaIngreso: "2026-04-01" },
  { id: 14, nombre: "Betzabeth Leal",    ciudad: "MED", rolTienda: "admin",   activa: false, fechaIngreso: "2026-04-01" },
  { id: 12, nombre: "Vanessa González",  ciudad: "BOG", rolTienda: "asesora", activa: false, fechaIngreso: "2026-04-01" },
];

// Colores de ciudad
export const COLOR_CIUDAD = { BOG: "#f59e0b", MED: "#10b981" };
export const LABEL_CIUDAD = { BOG: "Bogotá", MED: "Medellín" };

// Indicadores NUEVOS (mayo 2026 en adelante)
// Pesos ponderados — total comportamiento 40%, ventas 60%
// Puntualidad pesa más (más objetiva, base de la disciplina)
// Reseñas pesa menos (es la que más se "farmea")
export const INDICADORES_V2 = [
  { id: "puntualidad", label: "Puntualidad", emoji: "⏰", peso: 11, color: "#3b82f6" },  // azul — la más importante
  { id: "tienda", label: "Tienda", emoji: "🏪", peso: 9, color: "#10b981" },              // verde
  { id: "planilla", label: "Planilla", emoji: "📋", peso: 9, color: "#a855f7" },          // púrpura
  { id: "actitud", label: "Actitud", emoji: "💪", peso: 6, color: "#ec4899" },             // rosa
  { id: "resenas", label: "Reseñas", emoji: "⭐", peso: 5, color: "#eab308" },             // amarillo — la menos determinante
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

// ===========================================
// TOKENS DE ACCESO POR CIUDAD (URL ?c=)
// ===========================================
// Las vendedoras acceden con un link que incluye ?c=<token>. Los tokens
// son intencionalmente opacos (nada que revele "med" o "bog") para que
// una vendedora de una ciudad no pueda adivinar el link de la otra.
// Para ROTAR los tokens (si alguno se filtra), cambia las claves aquí y
// los links viejos dejan de funcionar inmediatamente.
export const CIUDAD_TOKENS = {
  "team-valquirias": "MED",  // Medellín
  "team-bacata":     "BOG",  // Bogotá (Bacatá = nombre muisca original)
};

// Helper inverso: dado "MED" → "team-valquirias" (para armar el link a compartir)
export function tokenParaCiudad(ciudad) {
  return Object.entries(CIUDAD_TOKENS).find(([, c]) => c === ciudad)?.[0] || "";
}

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
