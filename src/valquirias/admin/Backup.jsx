// Admin > Backup
// Exportar/importar todo el estado de la app en JSON
// Portado de App.jsx:1662-1676 + 1938-1963

import { useState } from "react";
import { useDatos } from "../data/DatosContext.jsx";

export default function Backup({ onVolver }) {
  const datos = useDatos();
  const [modo, setModo] = useState(null); // null | "exportar" | "importar"
  const [textoImport, setTextoImport] = useState("");
  const [msg, setMsg] = useState(null);

  function flash(txt, tipo = "ok") {
    setMsg({ txt, tipo });
    setTimeout(() => setMsg(null), 3000);
  }

  function armarJSON() {
    const paquete = {
      vendedoras: datos.vendedoras,
      registros: datos.registros,
      metas: datos.metas,
      snapshots: datos.snapshots,
      config: datos.config,
      fechaBackup: new Date().toISOString(),
    };
    return JSON.stringify(paquete, null, 2);
  }

  function descargar() {
    const json = armarJSON();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const fecha = new Date().toISOString().slice(0, 10);
    a.download = `valquirias-backup-${fecha}.json`;
    a.click();
    URL.revokeObjectURL(url);
    flash("✅ Backup descargado");
  }

  function copiarAlPortapapeles() {
    const json = armarJSON();
    navigator.clipboard.writeText(json).then(
      () => flash("✅ Backup copiado al portapapeles"),
      () => flash("❌ No se pudo copiar", "err")
    );
  }

  // Restaurar es la ÚNICA operación que debe pisar: "reemplaza todo por esto".
  // Por eso va por `restaurarTodo` y no por el guardado normal (que fusiona por
  // clave y jamás borra lo que no gobierna). Los 5 docs van en un solo batch:
  // o entra el respaldo completo, o no entra nada.
  async function ejecutarImport() {
    let data;
    try {
      data = JSON.parse(textoImport);
    } catch (e) {
      console.error(e);
      flash("❌ JSON inválido", "err");
      return;
    }
    try {
      const restaurados = await datos.restaurarTodo(data);
      setTextoImport("");
      setModo(null);
      flash(`✅ Backup restaurado (${restaurados.join(", ")})`);
    } catch (e) {
      console.error(e);
      // Que no se vaya creyendo que restauró.
      flash(`❌ NO se restauró: ${e?.message || "error escribiendo en Firestore"}`, "err");
    }
  }

  // Contadores rápidos
  const nVends = (datos.vendedoras || []).length;
  const nRegs = Object.keys(datos.registros || {}).length;
  const nMetas = Object.keys(datos.metas || {}).length;
  const nSnaps = Object.keys(datos.snapshots || {}).length;

  return (
    <div className="v-app v-ancho">
      <div className="v-header-detalle">
        <button className="v-back-btn" onClick={onVolver}>‹ Volver</button>
        <div className="v-header-title">💾 Backup</div>
        <div style={{ width: 60 }} />
      </div>

      {msg && (
        <div style={{
          padding: "10px 14px", borderRadius: 10, marginBottom: 10,
          fontSize: 12, fontWeight: 800,
          background: msg.tipo === "err" ? "var(--adm-alerta-fondo)" : "var(--vk-bien-fondo)",
          color: msg.tipo === "err" ? "var(--adm-alerta)" : "var(--vk-bien)",
        }}>{msg.txt}</div>
      )}

      {/* Resumen del estado actual */}
      <div className="v-card" style={{ background: "var(--vk-bien-fondo)", borderLeft: "4px solid var(--vk-bien-texto)" }}>
        <div className="v-card-title" style={{ color: "var(--vk-bien)" }}>📊 Estado actual</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <Stat label="Vendedoras" valor={nVends} />
          <Stat label="Registros" valor={nRegs} />
          <Stat label="Meses c/meta" valor={nMetas} />
          <Stat label="Meses cerrados" valor={nSnaps} />
        </div>
      </div>

      {/* Exportar */}
      <div className="v-card">
        <div className="v-card-title">⬇️ Exportar backup</div>
        <div style={{ fontSize: 11, color: "var(--vk-secundario)", marginBottom: 10, fontWeight: 700, lineHeight: 1.5 }}>
          Descarga TODOS los datos de la app en un archivo JSON. Guarda una copia semanal en tu Dropbox o correo.
        </div>
        <button
          onClick={descargar}
          style={{
            width: "100%", padding: "12px",
            background: "var(--vk-bien)",
            color: "var(--vk-tarjeta)", border: "none", borderRadius: 12,
            fontSize: 14, fontWeight: 900, cursor: "pointer",
            boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)",
            marginBottom: 6,
          }}
        >
          💾 Descargar JSON
        </button>
        <button
          onClick={copiarAlPortapapeles}
          style={{
            width: "100%", padding: "10px",
            background: "var(--vk-tarjeta)", color: "var(--vk-secundario)",
            border: "1.5px solid var(--vk-tenue)", borderRadius: 10,
            fontSize: 12, fontWeight: 800, cursor: "pointer",
          }}
        >
          📋 Copiar al portapapeles
        </button>
      </div>

      {/* Importar */}
      <div className="v-card" style={{ background: "rgba(239, 68, 68, 0.04)", border: "1px dashed rgba(239, 68, 68, 0.3)" }}>
        <div className="v-card-title" style={{ color: "var(--adm-alerta)" }}>⬆️ Restaurar backup</div>
        <div style={{ fontSize: 11, color: "var(--adm-alerta)", marginBottom: 10, fontWeight: 700, lineHeight: 1.5 }}>
          ⚠️ Restaurar SOBREESCRIBE todos los datos actuales. Solo usa en emergencia.
        </div>
        {modo !== "importar" ? (
          <button
            onClick={() => setModo("importar")}
            style={{
              width: "100%", padding: "10px",
              background: "var(--vk-tarjeta)", color: "var(--adm-alerta)",
              border: "1.5px solid var(--adm-alerta-borde)", borderRadius: 10,
              fontSize: 12, fontWeight: 800, cursor: "pointer",
            }}
          >
            🔓 Habilitar restauración
          </button>
        ) : (
          <>
            <textarea
              value={textoImport}
              onChange={e => setTextoImport(e.target.value)}
              placeholder='Pega aquí el JSON del backup: {"vendedoras":[...], "registros":{...}, ...}'
              style={{
                width: "100%", minHeight: 140, padding: 10,
                background: "var(--vk-tarjeta)", border: "1.5px solid var(--est-sin-dato)", borderRadius: 8,
                fontSize: 11, fontFamily: "monospace", resize: "vertical",
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button
                onClick={() => { setModo(null); setTextoImport(""); }}
                style={{ flex: 1, padding: "10px", background: "var(--vk-fondo-hueco)", color: "var(--vk-secundario)", border: "none", borderRadius: 8, fontWeight: 800, cursor: "pointer" }}
              >Cancelar</button>
              <button
                onClick={ejecutarImport}
                disabled={!textoImport.trim()}
                style={{
                  flex: 1, padding: "10px",
                  background: textoImport.trim() ? "var(--adm-alerta)" : "var(--vk-borde)",
                  color: textoImport.trim() ? "var(--vk-tarjeta)" : "var(--vk-tenue)",
                  border: "none", borderRadius: 8, fontWeight: 800,
                  cursor: textoImport.trim() ? "pointer" : "not-allowed",
                }}
              >⬆️ Restaurar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, valor }) {
  return (
    <div style={{ background: "var(--vk-tarjeta)", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(16, 185, 129, 0.15)" }}>
      <div style={{ fontSize: 10, color: "var(--vk-secundario)", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 900, color: "var(--vk-bien)", marginTop: 2 }}>{valor}</div>
    </div>
  );
}
