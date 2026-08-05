// Panel Admin (Luis) — home con tiles agrupados por sección
// Vendedoras se gestionan en systemlap (fuente de verdad).
// Aquí queda TODO lo operativo de evaluación, incluido el ingreso diario
// (antes solo lo alcanzaba el rol "oficina"; en la app clásica el admin
// también podía entrar — App.jsx:2116 `puedeIngresoVentas`).

import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase.js";
import { formatoPesos, hoyColombia } from "../lib/helpers.js";
import { useDatos } from "../data/DatosContext.jsx";
import NominaComisiones from "./NominaComisiones.jsx";
import CargarMetas from "./CargarMetas.jsx";
import CerrarMes from "./CerrarMes.jsx";
import Backup from "./Backup.jsx";
import VerComoVendedora from "./VerComoVendedora.jsx";
import VistaTodas from "./VistaTodas.jsx";
import MagicLinks from "./MagicLinks.jsx";
import ConfigPremios from "./ConfigPremios.jsx";
import GestionVendedoras from "./GestionVendedoras.jsx";
import TrimestreAdmin from "./TrimestreAdmin.jsx";
import VentasCiudad from "./VentasCiudad.jsx";
import IngresoDiario from "../oficina/IngresoDiario.jsx";
import TabRankingIndicadores from "../tabs/TabRankingIndicadores.jsx";

// Orden = importancia real de uso. Se agrupan en secciones para que el grid 2×N
// no se vuelva un muro de 12 tiles en celular.
const GRUPOS = [
  {
    titulo: "Día a día",
    emoji: "☀️",
    tiles: [
      { id: "todas",   emoji: "📊", titulo: "Todas las vendedoras", desc: "Indicadores y retardos de todas", destacado: true },
      { id: "ingreso", emoji: "📝", titulo: "Ingreso diario",       desc: "Llenar o corregir un día",        destacado: true },
      { id: "rankind", emoji: "🏅", titulo: "Ranking por indicador", desc: "Quién va mejor en cada uno" },
    ],
  },
  {
    titulo: "Dinero",
    emoji: "💵",
    tiles: [
      { id: "nomina",  emoji: "💰", titulo: "Nómina mensual",   desc: "Comisiones del mes anterior", destacado: true },
      { id: "ciudad",  emoji: "🏙️", titulo: "Ventas por ciudad", desc: "MED vs BOG del mes" },
      { id: "trim",    emoji: "📈", titulo: "Trimestre",         desc: "Avance y premios del Q" },
      { id: "metas",   emoji: "🎯", titulo: "Metas del mes",     desc: "Cargar MED y BOG" },
    ],
  },
  {
    titulo: "Cierre de mes",
    emoji: "🔒",
    tiles: [
      { id: "cerrar",  emoji: "🔒", titulo: "Cerrar mes", desc: "Fijar notas del mes" },
      { id: "backup",  emoji: "💾", titulo: "Backup",     desc: "Descargar JSON" },
    ],
  },
  {
    titulo: "Configuración",
    emoji: "⚙️",
    tiles: [
      { id: "magic",   emoji: "🔗", titulo: "Magic Links",         desc: "Enviar acceso a las 13" },
      { id: "premios", emoji: "🏆", titulo: "Premios trimestrales", desc: "Montos por puesto del Q" },
      { id: "vend",    emoji: "👥", titulo: "Vendedoras",           desc: "Plan B · systemlap manda", secundario: true },
    ],
  },
];

// Rótulo que va ENCIMA de cada interruptor. Existe para que nunca se confundan:
// uno abre la puerta de la app, el otro publica el ranking.
const rotuloToggle = {
  fontSize: 11.5,
  fontWeight: 900,
  color: "#7c3aed",
  margin: "0 2px 5px",
  lineHeight: 1.35,
};

export default function AdminHome({ datosGlobales }) {
  const datos = useDatos();
  const [seccion, setSeccion] = useState(null);
  const hoy = hoyColombia();

  // Scroll al top al cambiar de sección — fix bug de "botones ocultos arriba"
  useEffect(() => { window.scrollTo(0, 0); }, [seccion]);

  // Sub-pantallas
  if (seccion === "todas") return <VistaTodas onVolver={() => setSeccion(null)} />;
  if (seccion === "rankind") return (
    <TabRankingIndicadores
      datos={datos}
      ciudad={null}
      miId={null}
      esAdmin={true}
      onVolver={() => setSeccion(null)}
    />
  );
  if (seccion === "nomina") return <NominaComisiones onVolver={() => setSeccion(null)} />;
  if (seccion === "ciudad") return <VentasCiudad onVolver={() => setSeccion(null)} />;
  if (seccion === "trim") return <TrimestreAdmin onVolver={() => setSeccion(null)} />;
  if (seccion === "metas") return <CargarMetas onVolver={() => setSeccion(null)} />;
  if (seccion === "cerrar") return <CerrarMes onVolver={() => setSeccion(null)} />;
  if (seccion === "backup") return <Backup onVolver={() => setSeccion(null)} />;
  if (seccion === "magic") return <MagicLinks onVolver={() => setSeccion(null)} />;
  if (seccion === "premios") return <ConfigPremios onVolver={() => setSeccion(null)} />;
  if (seccion === "vend") return (
    <GestionVendedoras vendedoras={datos.vendedoras || []} onVolver={() => setSeccion(null)} />
  );
  if (seccion === "vercomo") return <VerComoVendedora onVolver={() => setSeccion(null)} />;

  // Ingreso diario para el admin. IngresoDiario nació para el rol "oficina" y su
  // header propio solo trae "Salir" (signOut), así que le montamos encima una
  // barra de volver para que Luis no quede atrapado ni tenga que cerrar sesión.
  // Le pasamos onVolver + vendedoras + onGuardar: si el componente ya es
  // autosuficiente ignora lo que le sobra, y si aún pide props las recibe.
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
        <IngresoDiario
          onVolver={() => setSeccion(null)}
          vendedoras={datos.vendedoras || []}
          onGuardar={({ fecha, filas }) => {
            const nuevos = { ...(datos.registros || {}) };
            Object.entries(filas).forEach(([vid, f]) => {
              nuevos[`${vid}_${fecha}`] = f;
            });
            datos.saveRegistros(nuevos);
          }}
        />
      </div>
    );
  }

  // Home
  const mesTexto = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"][hoy.mes - 1];

  const config = datos.config || {};
  const accesoActivo = !!config.whitelistActiva;

  async function toggleAcceso() {
    const nuevo = { ...config, whitelistActiva: !accesoActivo };
    await datos.saveConfig(nuevo);
  }

  // PUBLICAR RANKING — es una cosa DISTINTA del acceso general.
  //   whitelistActiva  = si las vendedoras pueden ENTRAR a la app (puerta).
  //   rankingVisible   = si, ya adentro, el ranking se VE o no.
  // Al prenderlo se sella un `publicacionId` (timestamp) para que cada vendedora
  // vea el confetti UNA sola vez por publicación — igual que la app clásica
  // (App.jsx:1678-1687 escribe el id, App.jsx:490-503 dispara el confetti).
  //
  // OJO con el default: si `rankingVisible` todavía no existe en Firestore se
  // considera PUBLICADO (`!== false`), igual que DEFAULTS en DatosContext.jsx:31.
  // Quien LEA la bandera (TabRanking / ValquiriasApp) debe usar exactamente esta
  // misma expresión, si no el ranking se apagaría solo sin que Luis lo pidiera.
  const rankingPublicado = config.rankingVisible !== false;

  async function togglePublicarRanking() {
    const nuevoEstado = !rankingPublicado;
    const nuevo = { ...config, rankingVisible: nuevoEstado };
    if (nuevoEstado) nuevo.publicacionId = Date.now();
    await datos.saveConfig(nuevo);
  }

  const publicadoTexto = config.publicacionId
    ? new Date(config.publicacionId).toLocaleString("es-CO", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : null;

  const activas = (datos.vendedoras || []).filter(v => v.activa !== false && !v.eventual);

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
        Hola <strong>Luis</strong> <span className="v-role-mini admin">Admin</span>
        <div style={{ marginTop: 4, fontSize: 13, color: "#7c3aed", fontWeight: 900 }}>🛡️ Panel de control · Valquirias TLV</div>
      </div>

      {/* HERO ventas del mes */}
      <div style={{
        background: "linear-gradient(135deg, #ec4899 0%, #a855f7 50%, #7c3aed 100%)",
        color: "#fff",
        padding: "20px 22px",
        borderRadius: 18,
        marginBottom: 12,
        boxShadow: "0 12px 28px rgba(236, 72, 153, 0.35)",
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: "-50%", right: "-30%", width: 260, height: 260, background: "radial-gradient(circle, rgba(255,255,255,0.25), transparent 60%)", borderRadius: "50%", pointerEvents: "none" }} />
        <div style={{ fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: 2, opacity: 0.95, marginBottom: 4, position: "relative" }}>
          💫 Ventas del mes · {mesTexto}
        </div>
        <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: -1, lineHeight: 1, position: "relative" }}>
          {formatoPesos(datosGlobales?.ventasMesTotal || 0)}
        </div>
        <div style={{ fontSize: 13, marginTop: 6, opacity: 0.95, fontWeight: 700, position: "relative" }}>
          🟢 MED {formatoPesos(datosGlobales?.ventasMED || 0)} · 🟡 BOG {formatoPesos(datosGlobales?.ventasBOG || 0)} · día {hoy.dia}
        </div>
      </div>

      {/* ─── Los DOS interruptores del dueño. Son cosas distintas y la UI lo grita. ─── */}
      <div style={{
        fontSize: 11, fontWeight: 900, color: "#7c3aed", textTransform: "uppercase",
        letterSpacing: 1.4, margin: "2px 2px 7px", display: "flex", alignItems: "center", gap: 6,
      }}>
        <span>🎛️ Interruptores del dueño</span>
        <span style={{ flex: 1, height: 1, background: "rgba(124, 58, 237, 0.18)" }} />
      </div>

      <div style={rotuloToggle}>
        1️⃣ Acceso general — <span style={{ fontWeight: 800, color: "#334155" }}>¿pueden ENTRAR a la app?</span>
      </div>

      {/* TOGGLE ACCESO GENERAL — el más importante, siempre visible */}
      <div style={{
        background: accesoActivo
          ? "linear-gradient(135deg, #10b981, #059669)"
          : "linear-gradient(135deg, #64748b, #475569)",
        color: "#fff",
        padding: "16px 18px",
        borderRadius: 16,
        marginBottom: 12,
        boxShadow: accesoActivo
          ? "0 6px 18px rgba(16, 185, 129, 0.35)"
          : "0 4px 12px rgba(100, 116, 139, 0.25)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1.5, opacity: 0.9, marginBottom: 3 }}>
              {accesoActivo ? "🚀 App visible para las vendedoras" : "🔒 App oculta a las vendedoras"}
            </div>
            <div style={{ fontSize: 15, fontWeight: 900 }}>
              {accesoActivo ? "ACTIVADA" : "DESACTIVADA"}
            </div>
            <div style={{ fontSize: 12, opacity: 0.9, fontWeight: 700, marginTop: 3 }}>
              {accesoActivo
                ? `${activas.length} vendedoras pueden entrar con su email`
                : "Nadie puede entrar aunque tenga el link"}
            </div>
          </div>
          <button
            onClick={toggleAcceso}
            style={{
              width: 60, height: 32, borderRadius: 16, border: "none", cursor: "pointer",
              background: accesoActivo ? "#fff" : "rgba(255,255,255,0.3)",
              position: "relative", padding: 0, flexShrink: 0,
            }}
          >
            <div style={{
              position: "absolute", top: 3, left: accesoActivo ? 31 : 3,
              width: 26, height: 26, borderRadius: "50%",
              background: accesoActivo ? "#10b981" : "#fff",
              boxShadow: "0 2px 4px rgba(0,0,0,0.2)", transition: "left 0.2s",
            }} />
          </button>
        </div>
      </div>

      <div style={rotuloToggle}>
        2️⃣ Publicar ranking — <span style={{ fontWeight: 800, color: "#334155" }}>¿se VE el ranking dentro de la app?</span>
      </div>

      {/* TOGGLE PUBLICAR RANKING — escribe config.rankingVisible (+ publicacionId al prender) */}
      <div style={{
        background: rankingPublicado
          ? "linear-gradient(135deg, #f59e0b, #ec4899)"
          : "linear-gradient(135deg, #475569, #334155)",
        color: "#fff",
        padding: "16px 18px",
        borderRadius: 16,
        marginBottom: 10,
        boxShadow: rankingPublicado
          ? "0 6px 18px rgba(236, 72, 153, 0.35)"
          : "0 4px 12px rgba(51, 65, 85, 0.25)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1.5, opacity: 0.9, marginBottom: 3 }}>
              {rankingPublicado ? "🏆 Ranking visible en la app" : "🙈 Ranking oculto en la app"}
            </div>
            <div style={{ fontSize: 15, fontWeight: 900 }}>
              {rankingPublicado ? "PUBLICADO" : "SIN PUBLICAR"}
            </div>
            <div style={{ fontSize: 12, opacity: 0.9, fontWeight: 700, marginTop: 3 }}>
              {rankingPublicado
                ? (publicadoTexto
                    ? `Publicado el ${publicadoTexto} · cada vendedora vio el confetti una sola vez`
                    : "Las vendedoras ven la pestaña Ranking")
                : "Entran a la app, pero la pestaña Ranking no muestra puestos. Al publicarlo, cada vendedora ve confetti una sola vez"}
            </div>
          </div>
          <button
            onClick={togglePublicarRanking}
            style={{
              width: 60, height: 32, borderRadius: 16, border: "none", cursor: "pointer",
              background: rankingPublicado ? "#fff" : "rgba(255,255,255,0.3)",
              position: "relative", padding: 0, flexShrink: 0,
            }}
          >
            <div style={{
              position: "absolute", top: 3, left: rankingPublicado ? 31 : 3,
              width: 26, height: 26, borderRadius: "50%",
              background: rankingPublicado ? "#ec4899" : "#fff",
              boxShadow: "0 2px 4px rgba(0,0,0,0.2)", transition: "left 0.2s",
            }} />
          </button>
        </div>
      </div>

      {/* Aclaración: por qué son dos interruptores y no uno */}
      <div style={{
        padding: "10px 12px", background: "rgba(124, 58, 237, 0.06)",
        borderLeft: "3px solid #7c3aed", borderRadius: 10, fontSize: 11,
        color: "#5b21b6", fontWeight: 700, marginBottom: 12, lineHeight: 1.55,
      }}>
        ℹ️ <strong>No son lo mismo.</strong> <strong>1️⃣ Acceso general</strong> es la puerta: apagado, <em>nadie</em> entra aunque tenga su link.
        {" "}<strong>2️⃣ Publicar ranking</strong> es solo el ranking: la app sigue abierta (Hoy, Mi año, Cómo funciona) pero los puestos quedan ocultos hasta que tú los publiques.
      </div>

      {/* Ver como vendedora (con selector) */}
      <button
        onClick={() => setSeccion("vercomo")}
        style={{
          width: "100%", background: "linear-gradient(135deg, #f3e8ff, #fdf4ff)",
          borderLeft: "4px solid #a855f7", padding: "12px 14px", borderRadius: 12,
          marginBottom: 10, border: "1px solid rgba(168, 85, 247, 0.2)",
          cursor: "pointer", fontFamily: "inherit", textAlign: "left",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#7c3aed", textTransform: "uppercase", letterSpacing: 1.2 }}>
            👁️ Ver la app como vendedora
          </div>
          <div style={{ fontSize: 12, color: "#5b21b6", fontWeight: 700, marginTop: 3 }}>
            Elige a cuál para simular su vista
          </div>
        </div>
        <div style={{ color: "#a855f7", fontSize: 20, fontWeight: 900 }}>›</div>
      </button>

      {/* Tiles operativos, agrupados por sección */}
      {GRUPOS.map(g => (
        <div key={g.titulo} style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 11, fontWeight: 900, color: "#7c3aed", textTransform: "uppercase",
            letterSpacing: 1.4, margin: "0 2px 7px", display: "flex", alignItems: "center", gap: 6,
          }}>
            <span>{g.emoji} {g.titulo}</span>
            <span style={{ flex: 1, height: 1, background: "rgba(124, 58, 237, 0.18)" }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {g.tiles.map(t => (
              <button
                key={t.id}
                onClick={() => setSeccion(t.id)}
                style={{
                  background: t.destacado
                    ? "linear-gradient(135deg, #10b981, #059669)"
                    : t.secundario ? "#f8fafc" : "#fff",
                  borderRadius: 14, padding: "18px 12px", textAlign: "center",
                  boxShadow: t.destacado
                    ? "0 4px 14px rgba(16, 185, 129, 0.35)"
                    : t.secundario ? "none" : "0 2px 8px rgba(236, 72, 153, 0.1)",
                  border: t.destacado
                    ? "1px solid rgba(16, 185, 129, 0.4)"
                    : t.secundario
                      ? "1px dashed rgba(100, 116, 139, 0.35)"
                      : "1px solid rgba(236, 72, 153, 0.12)",
                  cursor: "pointer", fontFamily: "inherit",
                  color: t.destacado ? "#fff" : "inherit",
                  opacity: t.secundario ? 0.85 : 1,
                }}
              >
                <div style={{ fontSize: 34, marginBottom: 4, lineHeight: 1 }}>{t.emoji}</div>
                <div style={{ fontSize: 14, fontWeight: 900, color: t.destacado ? "#fff" : t.secundario ? "#475569" : "#1e1b4b" }}>{t.titulo}</div>
                <div style={{ fontSize: 11, color: t.destacado ? "rgba(255,255,255,0.9)" : "#64748b", fontWeight: 700, marginTop: 3, lineHeight: 1.3 }}>{t.desc}</div>
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Info sobre gestión vendedoras */}
      <div style={{ padding: "10px 12px", background: "rgba(59, 130, 246, 0.06)", borderLeft: "3px solid #3b82f6", borderRadius: 10, fontSize: 11, color: "#1e40af", fontWeight: 700, marginBottom: 8, lineHeight: 1.55 }}>
        💡 <strong>systemlap es la fuente de verdad de las vendedoras</strong> (crear, desactivar, cambiar email/rol/ciudad). La sincronización trae los cambios acá cada 5 minutos. El tile <strong>Vendedoras</strong> de arriba es solo el plan B por si el sync trae algo mal: lo que edites ahí lo puede pisar la próxima sincronización.
      </div>

      {/* Status footer */}
      <div style={{ padding: "10px 14px", background: "rgba(16, 185, 129, 0.08)", borderLeft: "3px solid #10b981", borderRadius: 10, fontSize: 12, color: "#047857", fontWeight: 700 }}>
        ✅ {activas.length} vendedoras activas · Sync systemlap cada 5 min
      </div>
    </div>
  );
}
