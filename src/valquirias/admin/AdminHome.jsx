// Panel Admin (Luis) — home con tiles estilo Valquirias TLV
// Portado de PantallaAdmin viejo (App.jsx:1629+)
//
// Tiles:
// - Ranking en vivo (ver como vendedora)
// - Vendedoras (gestionar)
// - Metas (cargar meta mensual MED/BOG)
// - Cerrar mes
// - Backup (exportar/importar)
// - Magic Links (enviar acceso a vendedoras)
// - Config premios trimestrales
// - Log accesos (próximamente)

import { useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase.js";
import { formatoPesos, hoyColombia } from "../lib/helpers.js";
import { VENDEDORAS_DEFAULT } from "../../lib/constantes.js";
import GestionVendedoras from "./GestionVendedoras.jsx";
import ProximamentePanel from "./ProximamentePanel.jsx";

const TILES = [
  { id: "vendedoras",    emoji: "👥", titulo: "Vendedoras",       desc: "Activar / desactivar / editar" },
  { id: "metas",         emoji: "🎯", titulo: "Metas del mes",    desc: "Cargar MED y BOG" },
  { id: "cerrar",        emoji: "🔒", titulo: "Cerrar mes",       desc: "Fijar notas del mes" },
  { id: "magic",         emoji: "📧", titulo: "Magic Links",      desc: "Enviar acceso individual" },
  { id: "premios",       emoji: "💎", titulo: "Premios trim.",    desc: "Editar Q3, Q4..." },
  { id: "backup",        emoji: "💾", titulo: "Backup",           desc: "Descargar JSON" },
  { id: "links",         emoji: "🔗", titulo: "Links por ciudad", desc: "Copiar URLs MED / BOG" },
  { id: "accesos",       emoji: "📊", titulo: "Log accesos",      desc: "Quién entró y cuándo" },
];

export default function AdminHome({ datosGlobales }) {
  const [seccion, setSeccion] = useState(null); // null = home, 'vendedoras', 'metas', etc.
  const hoy = hoyColombia();

  // Sub-pantallas
  if (seccion === "vendedoras") {
    return <GestionVendedoras vendedoras={VENDEDORAS_DEFAULT} onVolver={() => setSeccion(null)} />;
  }
  if (seccion) {
    return <ProximamentePanel titulo={TILES.find(t => t.id === seccion)?.titulo || "En construcción"} onVolver={() => setSeccion(null)} />;
  }

  // Home
  const mesTexto = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"][hoy.mes - 1];

  return (
    <div className="v-app">
      <div className="v-header">
        <div className="v-brand">Indicadores TLV</div>
        <button
          onClick={() => signOut(auth)}
          style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", background: "transparent", border: "1px solid #e2e8f0", padding: "6px 10px", borderRadius: 8, cursor: "pointer" }}
        >Salir</button>
      </div>

      <div className="v-greeting">
        Hola <strong>Luis</strong> <span className="v-role-mini admin">Admin</span>
        <div style={{ marginTop: 4, fontSize: 12, color: "#7c3aed", fontWeight: 900 }}>🛡️ Panel de control · Valquirias TLV</div>
      </div>

      {/* Header hero con ventas del mes agregadas */}
      <div style={{
        background: "linear-gradient(135deg, #ec4899 0%, #a855f7 50%, #7c3aed 100%)",
        color: "#fff",
        padding: "18px 20px",
        borderRadius: 18,
        marginBottom: 12,
        boxShadow: "0 12px 28px rgba(236, 72, 153, 0.35)",
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: "-50%", right: "-30%", width: 260, height: 260, background: "radial-gradient(circle, rgba(255,255,255,0.25), transparent 60%)", borderRadius: "50%", pointerEvents: "none" }} />
        <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 2, opacity: 0.95, marginBottom: 4, position: "relative" }}>
          💫 Ventas del mes · {mesTexto}
        </div>
        <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1, lineHeight: 1, position: "relative" }}>
          {formatoPesos(datosGlobales?.ventasMesTotal || 132_400_000)}
        </div>
        <div style={{ fontSize: 12, marginTop: 6, opacity: 0.95, fontWeight: 700, position: "relative" }}>
          🟢 MED {formatoPesos(datosGlobales?.ventasMED || 92_000_000)} · 🟡 BOG {formatoPesos(datosGlobales?.ventasBOG || 40_400_000)} · día {hoy.dia}
        </div>
      </div>

      {/* Filtro simular vista de vendedora */}
      <div style={{ background: "linear-gradient(135deg, #f3e8ff, #fdf4ff)", borderLeft: "4px solid #a855f7", padding: "12px 14px", borderRadius: 12, marginBottom: 10, border: "1px solid rgba(168, 85, 247, 0.2)" }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: "#7c3aed", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6 }}>👁️ Ver la app como vendedora</div>
        <div style={{ display: "flex", gap: 6 }}>
          <a href="?v=tlv&demo=1" style={btnSimular("#10b981")}>🟢 Ver como MED</a>
          <a href="?v=tlv&demo=bog" style={btnSimular("#f59e0b")}>🟡 Ver como BOG</a>
        </div>
      </div>

      {/* Grid de tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        {TILES.map(t => (
          <button
            key={t.id}
            onClick={() => setSeccion(t.id)}
            style={{
              background: "#fff",
              borderRadius: 14,
              padding: "16px 12px",
              textAlign: "center",
              boxShadow: "0 2px 8px rgba(236, 72, 153, 0.1)",
              border: "1px solid rgba(236, 72, 153, 0.12)",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "transform 0.1s",
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 4, lineHeight: 1 }}>{t.emoji}</div>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#1e1b4b" }}>{t.titulo}</div>
            <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, marginTop: 3, lineHeight: 1.3 }}>{t.desc}</div>
          </button>
        ))}
      </div>

      {/* Status footer */}
      <div style={{ padding: "10px 14px", background: "rgba(16, 185, 129, 0.08)", borderLeft: "3px solid #10b981", borderRadius: 10, fontSize: 11, color: "#047857", fontWeight: 700 }}>
        ✅ Sync systemlap: hace 3 min · 14 vendedoras activas
      </div>
    </div>
  );
}

const btnSimular = (color) => ({
  flex: 1,
  padding: "8px 6px",
  background: "linear-gradient(135deg, " + color + ", " + color + "cc)",
  color: "#fff",
  textAlign: "center",
  borderRadius: 10,
  fontSize: 11,
  fontWeight: 900,
  textDecoration: "none",
  boxShadow: "0 2px 6px " + color + "40",
});
