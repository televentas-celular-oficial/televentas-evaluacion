// Panel Admin (Luis) — home simplificado
// Vendedoras se gestionan en systemlap (fuente de verdad).
// Aquí solo lo operativo del día a día de evaluación.

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

const TILES = [
  { id: "nomina",  emoji: "💰", titulo: "Nómina mensual", desc: "Comisiones del mes anterior", destacado: true },
  { id: "metas",   emoji: "🎯", titulo: "Metas del mes",  desc: "Cargar MED y BOG" },
  { id: "cerrar",  emoji: "🔒", titulo: "Cerrar mes",     desc: "Fijar notas del mes" },
  { id: "backup",  emoji: "💾", titulo: "Backup",         desc: "Descargar JSON" },
];

export default function AdminHome({ datosGlobales }) {
  const datos = useDatos();
  const [seccion, setSeccion] = useState(null);
  const hoy = hoyColombia();

  // Scroll al top al cambiar de sección — fix bug de "botones ocultos arriba"
  useEffect(() => { window.scrollTo(0, 0); }, [seccion]);

  // Sub-pantallas
  if (seccion === "nomina") return <NominaComisiones onVolver={() => setSeccion(null)} />;
  if (seccion === "metas") return <CargarMetas onVolver={() => setSeccion(null)} />;
  if (seccion === "cerrar") return <CerrarMes onVolver={() => setSeccion(null)} />;
  if (seccion === "backup") return <Backup onVolver={() => setSeccion(null)} />;
  if (seccion === "vercomo") return <VerComoVendedora onVolver={() => setSeccion(null)} />;

  // Home
  const mesTexto = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"][hoy.mes - 1];

  const config = datos.config || {};
  const accesoActivo = !!config.whitelistActiva;

  async function toggleAcceso() {
    const nuevo = { ...config, whitelistActiva: !accesoActivo };
    await datos.saveConfig(nuevo);
  }

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

      {/* Tiles operativos */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        {TILES.map(t => (
          <button
            key={t.id}
            onClick={() => setSeccion(t.id)}
            style={{
              background: t.destacado
                ? "linear-gradient(135deg, #10b981, #059669)"
                : "#fff",
              borderRadius: 14, padding: "18px 12px", textAlign: "center",
              boxShadow: t.destacado
                ? "0 4px 14px rgba(16, 185, 129, 0.35)"
                : "0 2px 8px rgba(236, 72, 153, 0.1)",
              border: t.destacado
                ? "1px solid rgba(16, 185, 129, 0.4)"
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

      {/* Info sobre gestión vendedoras */}
      <div style={{ padding: "10px 12px", background: "rgba(59, 130, 246, 0.06)", borderLeft: "3px solid #3b82f6", borderRadius: 10, fontSize: 11, color: "#1e40af", fontWeight: 700, marginBottom: 8, lineHeight: 1.55 }}>
        💡 <strong>Vendedoras se gestionan en systemlap</strong> (crear, desactivar, cambiar email/rol/ciudad). La sincronización trae los cambios acá cada 5 minutos.
      </div>

      {/* Status footer */}
      <div style={{ padding: "10px 14px", background: "rgba(16, 185, 129, 0.08)", borderLeft: "3px solid #10b981", borderRadius: 10, fontSize: 12, color: "#047857", fontWeight: 700 }}>
        ✅ {activas.length} vendedoras activas · Sync systemlap cada 5 min
      </div>
    </div>
  );
}
