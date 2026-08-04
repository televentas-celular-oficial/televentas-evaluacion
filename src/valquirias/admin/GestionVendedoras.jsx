// Admin > Gestión de vendedoras
// Portado de PantallaAdmin (App.jsx:2020-2060) al estilo Valquirias TLV

import { useState, useMemo } from "react";

export default function GestionVendedoras({ vendedoras = [], onVolver }) {
  const [filtro, setFiltro] = useState("todas"); // todas | MED | BOG | inactivas
  const [buscar, setBuscar] = useState("");

  const filtradas = useMemo(() => {
    let lista = [...vendedoras];
    if (filtro === "inactivas") lista = lista.filter(v => v.activa === false);
    else if (filtro !== "todas") lista = lista.filter(v => v.activa !== false && v.ciudad === filtro);
    else lista = lista.filter(v => v.activa !== false);
    if (buscar.trim()) {
      const q = buscar.toLowerCase();
      lista = lista.filter(v => v.nombre.toLowerCase().includes(q));
    }
    return lista;
  }, [vendedoras, filtro, buscar]);

  const activas = vendedoras.filter(v => v.activa !== false);
  const inactivas = vendedoras.filter(v => v.activa === false);
  const activasMed = activas.filter(v => v.ciudad === "MED");
  const activasBog = activas.filter(v => v.ciudad === "BOG");

  return (
    <div className="v-app">
      <div className="v-header-detalle">
        <button className="v-back-btn" onClick={onVolver}>‹ Volver</button>
        <div className="v-header-title">👥 Vendedoras ({activas.length})</div>
        <div style={{ width: 60, fontSize: 22, color: "#10b981", textAlign: "right", fontWeight: 900 }}>+</div>
      </div>

      {/* Buscar */}
      <input
        type="text"
        value={buscar}
        onChange={e => setBuscar(e.target.value)}
        placeholder="🔍 Buscar por nombre..."
        style={{
          width: "100%",
          padding: "10px 12px",
          fontSize: 13,
          fontFamily: "inherit",
          border: "1.5px solid #e2e8f0",
          borderRadius: 10,
          marginBottom: 10,
          background: "#fff",
        }}
      />

      {/* Filtro ciudad */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <button style={btnFiltro(filtro === "todas", "purple")} onClick={() => setFiltro("todas")}>
          Todas ({activas.length})
        </button>
        <button style={btnFiltro(filtro === "MED", "green")} onClick={() => setFiltro("MED")}>
          🟢 MED ({activasMed.length})
        </button>
        <button style={btnFiltro(filtro === "BOG", "amber")} onClick={() => setFiltro("BOG")}>
          🟡 BOG ({activasBog.length})
        </button>
        <button style={btnFiltro(filtro === "inactivas", "red")} onClick={() => setFiltro("inactivas")}>
          Inact. ({inactivas.length})
        </button>
      </div>

      {/* Lista */}
      {filtradas.map(v => (
        <FilaVend key={v.id} v={v} />
      ))}

      {filtradas.length === 0 && (
        <div className="v-loading">Sin vendedoras en este filtro</div>
      )}

      {/* Nota informativa */}
      <div style={{ marginTop: 14, padding: "10px 12px", background: "rgba(168, 85, 247, 0.08)", borderLeft: "3px solid #a855f7", borderRadius: 10, fontSize: 11, color: "#5b21b6", fontWeight: 700, lineHeight: 1.5 }}>
        💡 <strong>Las vendedoras se crean en systemlap.</strong> Cuando entra una nueva, la sync automática la trae acá y aparece con su email. Desde este panel puedes activar/desactivar o cambiar ciudad temporal.
      </div>
    </div>
  );
}

function FilaVend({ v }) {
  const esBog = v.ciudad === "BOG";
  const emailPendiente = !v.email; // simulado: si no tiene email es pendiente
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      padding: "10px 12px",
      background: "#fff",
      borderRadius: 12,
      marginBottom: 4,
      boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      borderLeft: "3px solid " + (v.activa === false ? "#ef4444" : esBog ? "#f59e0b" : "#10b981"),
      opacity: v.activa === false ? 0.6 : 1,
      gap: 10,
    }}>
      {/* Avatar */}
      <div style={{
        width: 36, height: 36,
        borderRadius: "50%",
        background: esBog ? "#f59e0b" : "#10b981",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fff", fontWeight: 900, fontSize: 15,
        flexShrink: 0,
      }}>
        {v.nombre[0]}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 900, color: "#1e1b4b", display: "flex", alignItems: "center", gap: 6 }}>
          {v.nombre}
          {emailPendiente && (
            <span style={{ fontSize: 8, background: "#fef3c7", color: "#92400e", padding: "1px 6px", borderRadius: 4, fontWeight: 900 }}>⚠️ SIN EMAIL</span>
          )}
        </div>
        <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {v.email || `${v.nombre.toLowerCase().split(" ")[0]}.pendiente@televentas.com`} · desde {v.fechaIngreso}
        </div>
      </div>

      {/* Acciones */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
        {v.activa !== false ? (
          <>
            {!emailPendiente && (
              <button style={btnAccion("#a855f7")} title="Enviar Magic Link">📧</button>
            )}
            <button style={btnAccion("#94a3b8")} title="Editar">✏️</button>
          </>
        ) : (
          <button style={btnAccion("#10b981")} title="Reactivar">✅</button>
        )}
      </div>
    </div>
  );
}

const btnFiltro = (activo, color) => {
  const bg = {
    purple: "linear-gradient(135deg, #7c3aed, #ec4899)",
    green:  "linear-gradient(135deg, #10b981, #059669)",
    amber:  "linear-gradient(135deg, #fbbf24, #f59e0b)",
    red:    "linear-gradient(135deg, #ef4444, #dc2626)",
  }[color];
  return {
    flex: 1,
    padding: "6px",
    textAlign: "center",
    fontSize: 10,
    fontWeight: 800,
    color: activo ? "#fff" : "#64748b",
    background: activo ? bg : "#fff",
    border: "1.5px solid " + (activo ? "transparent" : "#e2e8f0"),
    borderRadius: 10,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
};

const btnAccion = (color) => ({
  width: 28,
  height: 28,
  border: "none",
  borderRadius: 8,
  background: color + "15",
  color: color,
  fontSize: 13,
  cursor: "pointer",
  fontWeight: 900,
});
