// Valquirias TLV — entry point del rediseño
// Estructura: Auth Magic Link → decide rol → renderiza vista correspondiente
// - vendedora: bottom nav 4 tabs + detalles
// - oficina (Carolina): ingreso diario
// - admin (Luis): panel admin
//
// Datos: 100% REALES desde Firestore vía DatosProvider + derivar.js.
// Ya no existe ningún mock ni modo demo: la app está en producción y una
// vendedora nunca debe ver un número que no sea suyo y verdadero.

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
import BoletinMes from "./detalles/BoletinMes.jsx";
import IngresoDiario from "./oficina/IngresoDiario.jsx";
import AdminHome from "./admin/AdminHome.jsx";
import VentasCiudad from "./admin/VentasCiudad.jsx";
import TrimestreAdmin from "./admin/TrimestreAdmin.jsx";
import VistaTodas from "./admin/VistaTodas.jsx";
import { DatosProvider, useDatos } from "./data/DatosContext.jsx";
import { derivarDatosVendedora } from "./data/derivar.js";
import { hoyColombia, esLunesEnColombia, diasParaFinMes, nombreMesActual } from "./lib/helpers.js";

import "./valquirias.css";

// Recuerda qué publicación de ranking ya celebró este dispositivo (confetti 1 vez)
const CONFETTI_KEY = "televentas_confetti_visto";

export default function ValquiriasApp() {
  return (
    <DatosProvider>
      <ValquiriasAppInner />
    </DatosProvider>
  );
}

// ============================================================================
// Home del rol OFICINA (Carolina)
// ----------------------------------------------------------------------------
// En la app clásica Carolina no tenía UNA sola pantalla: `puedeIngresoVentas`
// la incluía (App.jsx:2116-2117) y le daba ✏️ Ingreso + 💰 Ventas, y además
// 📊 Ranking (App.jsx:2115) y 📈 Trimestre (App.jsx:2119) eran públicos para
// cualquier sesión. El rediseño la había dejado sólo con IngresoDiario: acá se
// le devuelven las 4.
//
// Lo del DUEÑO no entra: Nómina, Cerrar mes, Magic Links, Backup, Config
// Premios y Gestión de vendedoras siguen siendo exclusivos de AdminHome.
// Las 3 pantallas que se le montan son de SOLO LECTURA (ninguna escribe en
// Firestore); la única que escribe es el ingreso diario, que es justamente su
// trabajo.
// ============================================================================
const TILES_OFICINA = [
  { id: "ingreso", emoji: "📝", titulo: "Ingreso diario",    desc: "Llenar o corregir un día",       destacado: true },
  { id: "ciudad",  emoji: "🏙️", titulo: "Ventas por ciudad", desc: "MED vs BOG del mes" },
  { id: "todas",   emoji: "📊", titulo: "Ranking del mes",   desc: "Notas e indicadores de todas" },
  { id: "trim",    emoji: "📈", titulo: "Trimestre",         desc: "Avance y premios del Q" },
];

function OficinaHome({ vendedoras, onGuardarIngreso }) {
  const [seccion, setSeccion] = useState(null);

  // Scroll al top al entrar/salir de una sección
  useEffect(() => { window.scrollTo(0, 0); }, [seccion]);

  // Sub-pantallas (cada una trae su propio <div className="v-app"> y su ‹ Volver)
  if (seccion === "ciudad") return <VentasCiudad onVolver={() => setSeccion(null)} />;
  if (seccion === "trim") return <TrimestreAdmin onVolver={() => setSeccion(null)} />;
  if (seccion === "todas") return <VistaTodas onVolver={() => setSeccion(null)} />;

  // IngresoDiario nació como pantalla única del rol oficina: su header propio
  // sólo trae "Salir". Le montamos encima una barra de volver para que Carolina
  // no quede atrapada ni tenga que cerrar sesión (mismo patrón que AdminHome).
  if (seccion === "ingreso") {
    return (
      <div>
        <div style={{
          position: "sticky", top: 0, zIndex: 30, padding: "10px 12px",
          background: "linear-gradient(135deg, #ecfeff, #f0f9ff)",
          borderBottom: "1px solid rgba(6, 182, 212, 0.25)",
        }}>
          <button
            onClick={() => setSeccion(null)}
            style={{
              background: "#fff", border: "1px solid rgba(6, 182, 212, 0.35)",
              color: "#0e7490", fontWeight: 900, fontSize: 13, borderRadius: 10,
              padding: "8px 14px", cursor: "pointer", fontFamily: "inherit",
            }}
          >‹ Volver al panel</button>
        </div>
        <IngresoDiario vendedoras={vendedoras} onGuardar={onGuardarIngreso} />
      </div>
    );
  }

  const activas = (vendedoras || []).filter(v => v.activa !== false && !v.eventual);

  return (
    <div className="v-app">
      <div className="v-header">
        <div className="v-brand">Indicadores TLV</div>
        <button
          onClick={() => signOut(auth)}
          style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", background: "transparent", border: "1px solid #e2e8f0", padding: "6px 10px", borderRadius: 8, cursor: "pointer" }}
        >Salir</button>
      </div>

      <div className="v-greeting">
        Hola <strong>Carolina</strong> <span className="v-role-mini oficina">Oficina</span>
        <div style={{ marginTop: 4, fontSize: 13, color: "#0e7490", fontWeight: 900 }}>📋 Panel de oficina · Valquirias TLV</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        {TILES_OFICINA.map(t => (
          <button
            key={t.id}
            onClick={() => setSeccion(t.id)}
            style={{
              background: t.destacado ? "linear-gradient(135deg, #06b6d4, #0891b2)" : "#fff",
              borderRadius: 14, padding: "18px 12px", textAlign: "center",
              boxShadow: t.destacado
                ? "0 4px 14px rgba(6, 182, 212, 0.35)"
                : "0 2px 8px rgba(236, 72, 153, 0.1)",
              border: t.destacado
                ? "1px solid rgba(6, 182, 212, 0.4)"
                : "1px solid rgba(236, 72, 153, 0.12)",
              cursor: "pointer", fontFamily: "inherit",
              color: t.destacado ? "#fff" : "inherit",
            }}
          >
            <div style={{ fontSize: 34, marginBottom: 4, lineHeight: 1 }}>{t.emoji}</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: t.destacado ? "#fff" : "#1e1b4b" }}>{t.titulo}</div>
            <div style={{ fontSize: 11, color: t.destacado ? "rgba(255,255,255,0.9)" : "#64748b", fontWeight: 700, marginTop: 3, lineHeight: 1.3 }}>{t.desc}</div>
          </button>
        ))}
      </div>

      <div style={{ padding: "10px 14px", background: "rgba(6, 182, 212, 0.08)", borderLeft: "3px solid #06b6d4", borderRadius: 10, fontSize: 12, color: "#0e7490", fontWeight: 700, lineHeight: 1.55 }}>
        ✅ {activas.length} vendedoras activas · Ventas y metas las trae la sincronización de systemlap, acá sólo se consultan.
      </div>
    </div>
  );
}

function ValquiriasAppInner() {
  const datosFS = useDatos(); // datos crudos de Firestore
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [tab, setTab] = useState("hoy");
  const [detalle, setDetalle] = useState(null); // 'trim' | 'comp' | null
  const [mesBoletin, setMesBoletin] = useState(null); // { año, mes } del boletín abierto desde Mi año
  const [semanaCerradaOculta, setSemanaCerradaOculta] = useState(false);
  const [filtroCiudadAdmin, setFiltroCiudadAdmin] = useState("MED");
  const [mesSeleccionado, setMesSeleccionado] = useState(() => {
    const h = hoyColombia();
    return { año: h.año, mes: h.mes };
  });

  // ?simular=<id> — admin viendo la app como una vendedora específica (datos reales)
  const simularId = typeof window !== "undefined"
    ? (new URLSearchParams(window.location.search).get("simular") || "")
    : "";

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoadingAuth(false);
    });
    return unsub;
  }, []);

  // Scroll al top al cambiar de tab o detalle — fix bug de "botones ocultos arriba"
  useEffect(() => { window.scrollTo(0, 0); }, [tab, detalle, mesBoletin]);

  // Confetti UNA sola vez por publicación del ranking (como la app clásica).
  // El admin sella `config.publicacionId` al publicar; cada dispositivo recuerda
  // en localStorage cuál ya celebró, así no se repite en cada apertura.
  const [confettiPublicacion, setConfettiPublicacion] = useState(false);
  const publicacionId = datosFS.config?.publicacionId;
  const rankingVisible = datosFS.config?.rankingVisible !== false;
  useEffect(() => {
    if (!publicacionId || !rankingVisible) return;
    try {
      const visto = window.localStorage.getItem(CONFETTI_KEY);
      if (String(visto) === String(publicacionId)) return;
      window.localStorage.setItem(CONFETTI_KEY, String(publicacionId));
      setConfettiPublicacion(true);
      const t = setTimeout(() => setConfettiPublicacion(false), 4000);
      return () => clearTimeout(t);
    } catch { /* localStorage bloqueado — sin confetti, no es crítico */ }
  }, [publicacionId, rankingVisible]);

  // Loading auth
  if (loadingAuth) {
    return <div className="v-app"><div className="v-loading">⏳ Cargando...</div></div>;
  }

  // Sin login → magic link
  if (!user) {
    return <LoginMagicLink onLoggedIn={setUser} />;
  }

  // Loading de Firestore — evita el "flashazo" de datos falsos antes del real
  if (!datosFS.cargado) {
    return <div className="v-app"><div className="v-loading">⏳ Cargando datos...</div></div>;
  }

  // Rol de la app:
  // - Modo simular (admin viendo como vendedora): fuerza "otro"
  // - Normal: por Firebase Auth (admin=Luis, oficina=Carolina, otro=vendedora)
  const rol = simularId ? "otro" : rolDe(user);

  // App 24/7 — la restricción de ventana martes/viernes ya NO aplica.
  // La PantallaBloqueada queda disponible por si el admin decide reactivarla en el futuro.

  // Rol OFICINA (Carolina): home con sus 4 pantallas (ingreso + 3 de consulta)
  if (rol === "oficina") {
    return (
      <OficinaHome
        vendedoras={datosFS.vendedoras}
        onGuardarIngreso={({ fecha, filas }) => {
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
  // ============================================================
  // Vista vendedora — datos REALES desde Firestore
  // Prioridad para encontrar vendedora:
  //   1. ?simular=<id> (admin viendo como vendedora)
  //   2. email del user logueado buscado en datosFS.vendedoras
  // Si no coincide con ninguna → mensaje honesto, nunca datos de otra persona.
  // ============================================================
  let vendedora = null;
  let datos = null;

  if (simularId) {
    vendedora = (datosFS.vendedoras || []).find(v => String(v.id) === String(simularId)) || null;
  } else if (user?.email) {
    const emailBajo = user.email.toLowerCase();
    vendedora = (datosFS.vendedoras || []).find(v =>
      (v.email || "").toLowerCase() === emailBajo && v.activa !== false && !v.eventual
    ) || null;
  }

  if (vendedora) {
    datos = derivarDatosVendedora(datosFS, vendedora);
  } else {
    // Usuario logueado que no coincide con ninguna vendedora activa
    return (
      <div className="v-app">
        <div className="v-loading" style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🤔</div>
          <div style={{ fontSize: 15, fontWeight: 900, color: "#1e1b4b", marginBottom: 8 }}>
            No encontramos tu perfil
          </div>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700, marginBottom: 20 }}>
            Este email no está registrado como vendedora activa. Escríbele al administrador.
          </div>
          <button
            onClick={() => signOut(auth)}
            style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", background: "transparent", border: "1px solid #e2e8f0", padding: "8px 16px", borderRadius: 8, cursor: "pointer" }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  const ciudad = vendedora?.ciudad || "MED";

  // Admin autenticado + ?simular=<id> → banner con volver
  const adminSimulando = !!simularId && user && rolDe(user) === "admin";

  return (
    <div className="v-app">
      {adminSimulando && (
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
          <span>🛡️ Viendo como {vendedora.nombre} ({ciudad})</span>
          <span>← Volver</span>
        </a>
      )}

      <ConfettiRain trigger={(datos.semana.gano50k || confettiPublicacion) && !detalle && !mesBoletin} />

      {!detalle && !mesBoletin && (
        <TeamHeader
          vendedora={vendedora}
          rol={vendedora.rolTienda === "admin" ? "admin" : "asesora"}
          ciudad={ciudad}
          totalAño={datos.totalAño}
        />
      )}

      {/* Contenido según tab */}
      {mesBoletin ? (
        <BoletinMes
          // mesBoletin puede traer otra vendedora (al tocar una fila del ranking
          // o una columna del podio). Sin ella, es el boletín propio.
          vendedora={mesBoletin.vendedora || vendedora}
          año={mesBoletin.año}
          mes={mesBoletin.mes}
          onVolver={() => setMesBoletin(null)}
        />
      ) : detalle === "trim" ? (
        // DetalleTrimestre es AUTOSUFICIENTE: deriva meses, simulador, premios,
        // ganadoras e historial de Firestore él mismo. Sólo necesita saber QUÉ
        // trimestre mostrar (q/año) y de quién. Los `[]` que se le pasaban antes
        // eran fallbacks de modo demo y el `2026` hardcodeado hubiera fijado el
        // año a mano: si `datos.trimestre` no trae año, el componente ya cae al
        // año de hoy (Colombia), que es lo correcto.
        <DetalleTrimestre
          vendedora={vendedora}
          trimestre={{ q: datos.trimestre?.q, año: datos.trimestre?.año }}
          ciudad={ciudad}
          onVolver={() => setDetalle(null)}
        />
      ) : detalle === "comp" ? (
        <DetalleComportamiento
          notaComportamiento={datos.comportamiento?.notaTotal ?? null}
          aporteNota={datos.comportamiento?.aporteNota ?? null}
          pesoComportamiento={datos.comportamiento?.pesoComportamiento ?? 40}
          indicadores={datos.comportamiento?.indicadores ?? []}
          dias={datos.comportamiento?.dias ?? 0}
          cerrado={!!datos.comportamiento?.cerrado}
          nombreMes={nombreMesActual()}
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
          semanaCerrada={esLunesEnColombia() && !semanaCerradaOculta ? datos.semanaCerrada : null}
          onCerrarSemanaCerrada={() => setSemanaCerradaOculta(true)}
          onDetalleTrim={() => setDetalle("trim")}
          onDetalleComp={() => setDetalle("comp")}
        />
      ) : tab === "ranking" ? (
        // TabRanking es autosuficiente: deriva sus 3 rankings de Firestore
        // según el chip de mes / trimestre / semana que esté activo.
        <TabRanking
          vendedora={vendedora}
          ciudad={ciudad}
          rol={rol}
          filtroCiudadAdmin={filtroCiudadAdmin}
          setFiltroCiudadAdmin={setFiltroCiudadAdmin}
          mesSeleccionado={mesSeleccionado}
          setMesSeleccionado={setMesSeleccionado}
          onVerBoletin={setMesBoletin}
        />
      ) : tab === "año" ? (
        // TabMiAno también es autosuficiente (useDatos + derivarTotalAñoDeVendedora):
        // los meses cerrados salen de los snapshots reales, no de una lista fija.
        <TabMiAno
          vendedora={vendedora}
          ciudad={ciudad}
          onVerMes={(m) => {
            // `m` viene de TabMiAno → real.mesesCerrados: { año, mes, nombre, ... }
            const año = Number(m?.año), mes = Number(m?.mes);
            if (!año || !mes) return;   // sin mes válido no se abre nada
            setMesBoletin({ año, mes });
          }}
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

      {!detalle && !mesBoletin && <BottomNav activo={tab} onTab={setTab} />}
    </div>
  );
}
