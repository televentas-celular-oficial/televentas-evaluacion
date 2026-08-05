// Valquirias TLV — entry point del rediseño
// Estructura: Auth Magic Link → decide rol → renderiza vista correspondiente
// - vendedora: bottom nav 4 tabs + detalles
// - oficina (Carolina): TODO — vista de ingreso diario (fase 2)
// - admin (Luis): TODO — panel admin (fase 2)
//
// Datos: por ahora usa un mock para poder verse funcionando end-to-end.
// La integración con Firestore real se hace después de validar la UI.

import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../firebase.js";
import { rolDe } from "../lib/constantes.js";

import LoginMagicLink from "./auth/LoginMagicLink.jsx";
import PantallaBloqueada from "./PantallaBloqueada.jsx";
import BottomNav from "./common/BottomNav.jsx";
import TeamHeader from "./common/TeamHeader.jsx";
import ConfettiRain from "./common/ConfettiRain.jsx";
import TabHoy from "./tabs/TabHoy.jsx";
import TabRanking from "./tabs/TabRanking.jsx";
import TabMiAno from "./tabs/TabMiAno.jsx";
import TabComo from "./tabs/TabComo.jsx";
import DetalleTrimestre from "./detalles/DetalleTrimestre.jsx";
import DetalleComportamiento from "./detalles/DetalleComportamiento.jsx";
import IngresoDiario from "./oficina/IngresoDiario.jsx";
import AdminHome from "./admin/AdminHome.jsx";
import { DatosProvider, useDatos } from "./data/DatosContext.jsx";
import { estaEnVentanaAutoEncendido, hoyColombia, fechaBonita, esLunesEnColombia, rangoSemanaAnterior, diasParaFinMes, nombreMesActual } from "./lib/helpers.js";

import "./valquirias.css";

// ===========================================================================
// DATOS MOCK (Durley Castaño, líder MED, admin — replica el celular 1 del mockup)
// Cuando conectemos Firestore, esto se calcula desde vendidas + registros + snapshots
// ===========================================================================
function datosMockDurley() {
  return {
    // rolTienda: "admin" (administradora) o "asesora" — determina tramos de comisión
    // rolApp: se determina por Firebase Auth (Luis=admin, Carolina=oficina, resto=vendedora)
    vendedora: { id: 4, nombre: "Durley Castaño", ciudad: "MED", rolTienda: "admin" },
    hoy: {
      fecha: fechaBonita(hoyColombia().iso) + " · 3:14pm",
      ventasDia: 850_000,
      efectivoDia: 340_000,
      tickets: 2,
    },
    foco: "Vende $340k más y mantienes el #1 del EXTRA de $50k 🔥",
    focoTipo: "normal",
    semana: {
      efectivo: 3_400_000,
      gano50k: true,
      // Top 3 para el mini-ranking dentro de TabHoy
      top3: [
        { n: 1, nombre: "Durley", valor: 3_400_000, esYo: true },
        { n: 2, nombre: "Lorena", valor: 3_100_000, gap: "-$300k" },
        { n: 3, nombre: "Elena",  valor: 2_900_000, gap: "-$500k" },
      ],
      // Ranking completo de la ciudad para el sub-tab "Sem ef." en TabRanking
      rankingCiudad: [
        { n: 1, nombre: "Durley",    valor: 3_400_000, esYo: true, gano50k: true,  extra: true  },
        { n: 2, nombre: "Lorena",    valor: 3_100_000, gano50k: true },
        { n: 3, nombre: "Elena",     valor: 2_900_000, gano50k: true },
        { n: 4, nombre: "Luisa",     valor: 2_600_000, gano50k: true },
        { n: 5, nombre: "Dayana",    valor: 2_400_000, gano50k: false },
        { n: 6, nombre: "Jennifer",  valor: 1_800_000, gano50k: false },
        { n: 7, nombre: "Manuela",   valor: 1_200_000, gano50k: false },
        { n: 8, nombre: "Betzabeth", valor:   900_000, gano50k: false },
      ],
    },
    mes: {
      ventas: 22_500_000,
      dia: 15,
      diasMes: 31,
      tramo: "META 2 (4%)",
      ganado: 900_000,
      siguienteTramo: "META 3 (6%) = $2.36M",
      faltaSiguiente: 16_900_000,
      nota: 4.32,
      pctMeta: 68,
    },
    rankingMes: [
      { n: 1, nombre: "Durley", valor: 22_500_000, esYo: true,  medal: "⭐" },
      { n: 2, nombre: "Lorena", valor: 18_300_000, gap: "-$4.2M" },
      { n: 3, nombre: "Elena",  valor: 16_100_000, gap: "-$2.2M" },
      { n: 4, nombre: "Luisa",  valor: 13_800_000, gap: "-$2.3M" },
      { n: 5, nombre: "Dayana", valor: 10_400_000, gap: "-$3.4M" },
      { n: 6, nombre: "Jennifer", valor: 8_100_000, gap: "-$2.3M" },
      { n: 7, nombre: "Manuela", valor: 6_900_000, gap: "-$1.2M" },
      { n: 8, nombre: "Betzabeth", valor: 4_200_000, gap: "-$2.7M" },
    ],
    trimestre: { q: "Q3", nota: 4.10, posicion: 1, premio: "TV en juego" },
    semanaCerrada: {
      fechaLabel: rangoSemanaAnterior(),
      extra: { nombre: "Durley Castaño", monto: 3_400_000, esYo: true },
      ganadoras50k: [
        { nombre: "Durley Castaño", esYo: true },
        { nombre: "Lorena", esYo: false },
        { nombre: "Elena", esYo: false },
        { nombre: "Luisa", esYo: false },
      ],
    },
    comportamiento: { estado: "warn", resenas: 4.7 },
    totalAño: 22_250_000,
    proyeccion: 42_200_000,
    desgloseAño: {
      salarioBase: 16_000_000,
      premiosMensuales: 5_400_000,
      premiosSemanales: 850_000,
      premiosTrimestrales: 0,
      reconocimientos: "2 días libres",
    },
  };
}

export default function ValquiriasApp() {
  // Modo demo: ?demo=1 (vendedora Durley MED) · ?demo=carolina (rol oficina) · ?demo=admin (rol admin)
  const demoParam = typeof window !== "undefined"
    ? (new URLSearchParams(window.location.search).get("demo") || "")
    : "";
  const esDemo = demoParam !== "";

  return (
    <DatosProvider modoDemo={esDemo}>
      <ValquiriasAppInner demoParam={demoParam} esDemo={esDemo} />
    </DatosProvider>
  );
}

function ValquiriasAppInner({ demoParam, esDemo }) {
  const datosFS = useDatos(); // datos crudos de Firestore
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [tab, setTab] = useState("hoy");
  const [detalle, setDetalle] = useState(null); // 'trim' | 'comp' | null
  const [semanaCerradaOculta, setSemanaCerradaOculta] = useState(false);
  const [datos] = useState(datosMockDurley()); // mock (usado en demo y como fallback visual mientras integramos)
  const [filtroCiudadAdmin, setFiltroCiudadAdmin] = useState("MED");
  const [mesSeleccionado, setMesSeleccionado] = useState(() => {
    const h = hoyColombia();
    return { año: h.año, mes: h.mes };
  });

  useEffect(() => {
    if (esDemo) { setLoadingAuth(false); return; }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoadingAuth(false);
    });
    return unsub;
  }, [esDemo]);

  // Loading
  if (loadingAuth) {
    return <div className="v-app"><div className="v-loading">⏳ Cargando...</div></div>;
  }

  // Sin login (y sin demo) → magic link
  if (!user && !esDemo) {
    return <LoginMagicLink onLoggedIn={setUser} />;
  }

  // Rol de la app (Firebase Auth): admin=Luis, oficina=Carolina, otro=vendedora
  // En modo demo simulamos según parámetro
  const rol = esDemo
    ? (demoParam === "admin" ? "admin" : demoParam === "carolina" || demoParam === "oficina" ? "oficina" : "otro")
    : rolDe(user);

  // App 24/7 — la restricción de ventana martes/viernes ya NO aplica.
  // La PantallaBloqueada queda disponible por si el admin decide reactivarla en el futuro.

  // Rol OFICINA (Carolina): vista dedicada al ingreso diario
  if (rol === "oficina") {
    return (
      <IngresoDiario
        vendedoras={datosFS.vendedoras}
        onGuardar={({ fecha, filas }) => {
          // Guarda cada fila en datosFS.registros con clave `${vid}_${fecha}`
          const nuevos = { ...datosFS.registros };
          Object.entries(filas).forEach(([vid, f]) => {
            nuevos[`${vid}_${fecha}`] = f;
          });
          datosFS.saveRegistros(nuevos);
        }}
      />
    );
  }

  // Rol ADMIN (Luis): panel admin nuevo con ventas reales
  if (rol === "admin") {
    const h = hoyColombia();
    const claveMes = `${h.año}_${String(h.mes).padStart(2, "0")}`;
    const ventasHoy = datosFS.metas[claveMes]?.vendidas || {};
    let ventasMED = 0, ventasBOG = 0;
    (datosFS.vendedoras || []).forEach(v => {
      const val = ventasHoy[v.id] || 0;
      if (v.ciudad === "MED") ventasMED += val;
      else if (v.ciudad === "BOG") ventasBOG += val;
    });
    return <AdminHome datosGlobales={{
      ventasMesTotal: ventasMED + ventasBOG,
      ventasMED,
      ventasBOG,
    }} />;
  }
  // Vista vendedora
  const { vendedora } = datos;
  const ciudad = vendedora?.ciudad || "MED";

  const rankingsPorCiudad = filtrarRankingCiudad(datos.rankingMes, filtroCiudadAdmin, ciudad);

  // Admin autenticado en modo "Ver como vendedora" → mostrar banner con botón volver
  const adminViendoComoVend = esDemo && user && rolDe(user) === "admin";

  return (
    <div className="v-app">
      {adminViendoComoVend && (
        <a href="/" style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          background: "linear-gradient(135deg, #7c3aed, #ec4899)",
          color: "#fff",
          borderRadius: 10,
          marginBottom: 10,
          fontSize: 12,
          fontWeight: 900,
          textDecoration: "none",
          boxShadow: "0 4px 12px rgba(124, 58, 237, 0.25)",
        }}>
          <span>🛡️ Viendo como vendedora {demoParam === "bog" ? "BOG" : "MED"}</span>
          <span>← Volver al Admin</span>
        </a>
      )}

      <ConfettiRain trigger={datos.semana.gano50k && !detalle} />

      {!detalle && (
        <TeamHeader
          vendedora={vendedora}
          rol={vendedora.rolTienda === "admin" ? "admin" : "asesora"}
          ciudad={ciudad}
          totalAño={datos.totalAño}
        />
      )}

      {/* Contenido según tab */}
      {detalle === "trim" ? (
        <DetalleTrimestre
          trimestre={{ q: "Q3", año: 2026, notaActual: datos.trimestre.nota, meta: 4.5 }}
          mesesTrim={[
            { nombre: "Julio 2026", peso: 20, nota: 4.15, estado: "completo" },
            { nombre: "Agosto 2026", peso: 30, nota: 4.32, estado: "progreso" },
            { nombre: "Septiembre 2026", peso: 50, estado: "pendiente" },
          ]}
          simulador={{ notaObjetivo: 4.75, notaProyectada: 4.52, premio: 1_000_000 }}
          premios={[
            { emoji: "📺", nombre: "TV 42\" Smart", condicion: `A la #1 de ${ciudad === "BOG" ? "Bogotá" : "Medellín"} este trimestre` },
            { emoji: "💰", nombre: "$1.000.000", condicion: "Si tu nota trimestral llega a 4.50" },
          ]}
          historial={[
            { q: "Q1 2026", nota: 4.28, premio: "💰 $1M ganado" },
            { q: "Q2 2026", nota: 4.42, premio: "🎁 2 días libres" },
            { q: "Q3 2026", nota: 4.10, premio: "📺 TV en juego", activo: true },
          ]}
          ciudad={ciudad}
          onVolver={() => setDetalle(null)}
        />
      ) : detalle === "comp" ? (
        <DetalleComportamiento
          notaComportamiento={3.86}
          aporteNota={1.54}
          indicadores={[
            { id: "puntualidad", nombre: "Puntualidad", emoji: "⏰", peso: 11, nota: 5.0, detalle: "0 retardos este mes · perfecta", estado: "good" },
            { id: "tienda", nombre: "Tienda", emoji: "🏪", peso: 9, nota: 4.8, detalle: "Limpieza y orden impecables", estado: "good" },
            { id: "planilla", nombre: "Planilla", emoji: "📋", peso: 9, nota: 3.2, detalle: "Faltan 2 días sin llenar · lun 4 y mar 5", estado: "warn" },
            { id: "actitud", nombre: "Actitud", emoji: "😊", peso: 6, nota: 4.5, detalle: "Sin observaciones negativas", estado: "good" },
            { id: "resenas", nombre: "Reseñas", emoji: "⭐", peso: 5, nota: 4.7, detalle: "12 reseñas · promedio 4.7 estrellas", estado: "star" },
          ]}
          tip={{
            titulo: "Cada día suma",
            mensaje: (() => {
              const dias = diasParaFinMes();
              const mes = nombreMesActual();
              return (
                <>Los indicadores son <strong>observaciones diarias</strong> — lo que pasó ya pasó. {dias > 0 ? <>Faltan <strong>{dias} {dias === 1 ? "día" : "días"}</strong> para cerrar {mes}: mantén tu ritmo con puntualidad, actitud y detalles y cierras el mes con nota alta 💪</> : <>Hoy cierra {mes}. Mañana arranca un mes nuevo — todo empieza de cero 💪</>}</>
              );
            })(),
          }}
          onVolver={() => setDetalle(null)}
        />
      ) : tab === "hoy" ? (
        <TabHoy
          vendedora={vendedora}
          ciudad={ciudad}
          rol={vendedora.rolTienda}
          hoy={datos.hoy}
          foco={datos.foco}
          focoTipo={datos.focoTipo}
          semana={datos.semana}
          mes={datos.mes}
          rankingMes={datos.rankingMes}
          trimestre={datos.trimestre}
          comportamiento={datos.comportamiento}
          semanaCerrada={(esLunesEnColombia() || esDemo) && !semanaCerradaOculta ? datos.semanaCerrada : null}
          onCerrarSemanaCerrada={() => setSemanaCerradaOculta(true)}
          onDetalleTrim={() => setDetalle("trim")}
          onDetalleComp={() => setDetalle("comp")}
        />
      ) : tab === "ranking" ? (
        <TabRanking
          vendedora={vendedora}
          ciudad={ciudad}
          rol={rol}
          filtroCiudadAdmin={filtroCiudadAdmin}
          setFiltroCiudadAdmin={setFiltroCiudadAdmin}
          mesSeleccionado={mesSeleccionado}
          setMesSeleccionado={setMesSeleccionado}
          añoActual={2026}
          mesActual={8}
          rankingMes={rankingsPorCiudad.map((r, i) => ({
            ...r,
            rolLabel: i === 0 ? "Administradora · 68% meta" : "Asesora",
            medal: i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : String(i + 1),
            subValor: i === 0 ? `Nota: ${datos.mes.nota}` : r.gap,
          }))}
          rankingTrim={[
            { esYo: true,  nombre: "Durley",    valor: 4.32, rolLabel: "Administradora · Q3 en curso", medal: "🥇", subValor: "$46.8M vendido" },
            { esYo: false, nombre: "Lorena",    valor: 4.18, rolLabel: "Administradora",                medal: "🥈", subValor: "$38.5M vendido" },
            { esYo: false, nombre: "Elena",     valor: 4.05, rolLabel: "Asesora",                       medal: "🥉", subValor: "$32.1M vendido" },
            { esYo: false, nombre: "Luisa",     valor: 3.92, rolLabel: "Asesora",                       medal: "4",  subValor: "$28.7M vendido" },
            { esYo: false, nombre: "Dayana",    valor: 3.68, rolLabel: "Asesora",                       medal: "5",  subValor: "$22.4M vendido" },
            { esYo: false, nombre: "Jennifer",  valor: 3.42, rolLabel: "Asesora",                       medal: "6",  subValor: "$18.2M vendido" },
            { esYo: false, nombre: "Manuela",   valor: 2.98, rolLabel: "Asesora · pre-piso",            medal: "7",  subValor: "$14.6M vendido" },
            { esYo: false, nombre: "Betzabeth", valor: 2.65, rolLabel: "Asesora · pre-piso",            medal: "8",  subValor: "$9.8M vendido" },
          ]}
          rankingSem={datos.semana.rankingCiudad.map((v, i) => ({
            ...v,
            rolLabel: v.gano50k ? "✅ ganó $50k" : "sin premio esta semana",
            detalle: v.extra ? "+ $50k EXTRA (top 1)" : "",
            medal: i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : String(i + 1),
            subValor: v.esYo ? "TÚ" : (v.gano50k ? "+$50k" : ""),
          }))}
        />
      ) : tab === "año" ? (
        <TabMiAno
          totalAño={datos.totalAño}
          proyeccion={datos.proyeccion}
          posicionTrim={1}
          ciudad={ciudad}
          desglose={datos.desgloseAño}
          mesesCerrados={[
            { año: 2026, mes: 7, nombre: "Julio 2026", ventas: 24_500_000, nota: 4.15 },
            { año: 2026, mes: 6, nombre: "Junio 2026", ventas: 26_100_000, nota: 4.42 },
            { año: 2026, mes: 5, nombre: "Mayo 2026", ventas: 21_800_000, nota: 4.28 },
          ]}
          onVerMes={() => {/* TODO */}}
        />
      ) : tab === "como" ? (
        <>
          <TabComo ciudad={ciudad} />
          <div style={{ marginTop: 20, textAlign: "center" }}>
            <button
              onClick={() => signOut(auth)}
              style={{
                fontSize: 12, fontWeight: 700, color: "#94a3b8",
                background: "transparent", border: "1px solid #e2e8f0",
                padding: "8px 16px", borderRadius: 8, cursor: "pointer",
              }}
            >
              Cerrar sesión
            </button>
          </div>
        </>
      ) : null}

      {!detalle && <BottomNav activo={tab} onTab={setTab} />}
    </div>
  );
}

// Filtro auxiliar para el filtro admin
function filtrarRankingCiudad(ranking, filtroAdmin, ciudadVend) {
  // Vendedora ve su ciudad · Admin puede ver TODAS/MED/BOG
  // Como el mock trae solo MED, por ahora devolvemos tal cual
  return ranking;
}
