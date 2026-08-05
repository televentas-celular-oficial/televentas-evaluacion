// Admin > Cerrar mes
// Portado de PantallaAdmin (App.jsx:1689-1770 + 1856-1936) al estilo Valquirias TLV
//
// Cerrar mes = generar snapshot con notas fijas para siempre
// Requiere: todos los días llenados por Carolina + meta MED/BOG cargada
// Es IRREVERSIBLE (aunque hay opción avanzada de "abrir" en emergencias)

import { useState, useMemo } from "react";
import { useDatos } from "../data/DatosContext.jsx";
import { hoyColombia } from "../lib/helpers.js";
import { MES_NAMES, esFormulaV2, getIndicadores } from "../../lib/constantes.js";
import { claveMes, calcNotaMensual } from "../../lib/calculos.js";

export default function CerrarMes({ onVolver }) {
  const datos = useDatos();
  const hoy = hoyColombia();
  const mesAntAño = hoy.mes === 1 ? hoy.año - 1 : hoy.año;
  const mesAntMes = hoy.mes === 1 ? 12 : hoy.mes - 1;
  const [msg, setMsg] = useState(null);
  const [confirmarCierre, setConfirmarCierre] = useState(null);
  const [confirmarAbrir, setConfirmarAbrir] = useState(null);
  const [mostrarAvanzado, setMostrarAvanzado] = useState(false);
  const [añoSel, setAñoSel] = useState(mesAntAño);
  const [mesSel, setMesSel] = useState(mesAntMes);

  function flash(txt, tipo = "ok") {
    setMsg({ txt, tipo });
    setTimeout(() => setMsg(null), 3500);
  }

  const registros = datos.registros || {};
  const metas = datos.metas || {};
  const snapshots = datos.snapshots || {};
  const vendedoras = datos.vendedoras || [];
  const activas = vendedoras.filter(v => v.activa !== false);

  const mesAntCerrado = !!snapshots[claveMes(mesAntAño, mesAntMes)];

  const cerrados = useMemo(() => {
    return Object.keys(snapshots)
      .map(k => {
        const [y, m] = k.split("_").map(Number);
        return { año: y, mes: m };
      })
      .sort((a, b) => (b.año - a.año) || (b.mes - a.mes));
  }, [snapshots]);

  const mesSelValido = (añoSel < hoy.año) || (añoSel === hoy.año && mesSel < hoy.mes);
  const mesSelYaCerrado = !!snapshots[claveMes(añoSel, mesSel)];

  function detectarFaltantes(añoC, mesC) {
    const faltantes = [];
    const ultimoDia = new Date(añoC, mesC, 0).getDate();
    const ultimoDiaMes = `${añoC}-${String(mesC).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;
    for (let d = 1; d <= ultimoDia; d++) {
      const f = `${añoC}-${String(mesC).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const elegiblesDia = activas.filter(v => !v.fechaIngreso || v.fechaIngreso <= f);
      const sinReg = elegiblesDia.filter(v => !registros[v.id + "_" + f]);
      if (sinReg.length > 0) faltantes.push(`Día ${d}: ${sinReg.length} vendedora(s) sin registrar`);
    }
    const meta = metas[claveMes(añoC, mesC)];
    if (!meta || !meta.meta) faltantes.push("⚠️ Meta del mes no cargada");
    else if (typeof meta.meta === "object") {
      if (!meta.meta.MED) faltantes.push("⚠️ Meta MEDELLÍN no cargada");
      if (!meta.meta.BOG) faltantes.push("⚠️ Meta BOGOTÁ no cargada");
    }
    if (meta) {
      const elegiblesMes = activas.filter(v => !v.fechaIngreso || v.fechaIngreso <= ultimoDiaMes);
      const sinVent = elegiblesMes.filter(v => meta.vendidas?.[v.id] === undefined);
      if (sinVent.length > 0) faltantes.push(`${sinVent.length} vendedora(s) sin ventas cargadas`);
    }
    return faltantes;
  }

  function intentarCerrar(añoC, mesC) {
    if (snapshots[claveMes(añoC, mesC)]) {
      flash("Este mes ya está cerrado", "err");
      return;
    }
    setConfirmarCierre({ año: añoC, mes: mesC, faltantes: detectarFaltantes(añoC, mesC) });
  }

  async function ejecutarCierre(añoC, mesC) {
    const clave = claveMes(añoC, mesC);
    const snap = {
      año: añoC, mes: mesC,
      version: esFormulaV2(añoC, mesC) ? "v2" : "v1",
      indicadores: getIndicadores(añoC, mesC),
      fechaCierre: new Date().toISOString(),
      vendedoras: {},
    };
    vendedoras.forEach(v => {
      const r = calcNotaMensual(registros, metas, v.id, añoC, mesC, null, vendedoras);
      snap.vendedoras[v.id] = {
        notaBase: r.notaBase, notaVentas: r.notaVentas, notaFinal: r.notaFinal,
        bono: r.bono || 0, dias: r.dias, porInd: r.porInd, detalle: r.detalle,
        real: r.real, meta: r.meta, pct: r.pct,
      };
    });
    await datos.saveSnapshots({ ...snapshots, [clave]: snap });
    setConfirmarCierre(null);
    flash(`🔒 ${MES_NAMES[mesC - 1]} ${añoC} cerrado`);
  }

  async function ejecutarApertura(añoC, mesC) {
    const nuevos = { ...snapshots };
    delete nuevos[claveMes(añoC, mesC)];
    await datos.saveSnapshots(nuevos);
    setConfirmarAbrir(null);
    flash(`🔓 ${MES_NAMES[mesC - 1]} ${añoC} abierto`);
  }

  return (
    <div className="v-app">
      <div className="v-header-detalle">
        <button className="v-back-btn" onClick={onVolver}>‹ Volver</button>
        <div className="v-header-title">🔒 Cerrar mes</div>
        <div style={{ width: 60 }} />
      </div>

      {msg && (
        <div style={{
          padding: "10px 14px", borderRadius: 10, marginBottom: 10,
          fontSize: 12, fontWeight: 800,
          background: msg.tipo === "err" ? "#fee2e2" : "#d1fae5",
          color: msg.tipo === "err" ? "#991b1b" : "#065f46",
        }}>{msg.txt}</div>
      )}

      <div style={{ padding: "10px 12px", background: "rgba(220, 38, 38, 0.08)", borderLeft: "3px solid #dc2626", borderRadius: 10, fontSize: 11, color: "#991b1b", fontWeight: 700, marginBottom: 10, lineHeight: 1.55 }}>
        ⚠️ Cerrar un mes deja sus notas <strong>fijas para siempre</strong>. Después de cerrar, ni Carolina ni las vendedoras pueden modificar nada de ese mes. Solo cierra cuando todos los días estén llenos y la meta esté cargada.
      </div>

      {/* Botón principal: cerrar mes anterior */}
      <div className="v-card">
        <div className="v-card-title">📅 Mes anterior</div>
        {!mesAntCerrado ? (
          <button
            onClick={() => intentarCerrar(mesAntAño, mesAntMes)}
            style={{
              width: "100%",
              padding: "14px",
              background: "linear-gradient(135deg, #dc2626, #b91c1c)",
              color: "#fff", border: "none", borderRadius: 12,
              fontSize: 15, fontWeight: 900, cursor: "pointer",
              boxShadow: "0 4px 12px rgba(220, 38, 38, 0.3)",
            }}
          >
            🔒 Cerrar {MES_NAMES[mesAntMes - 1]} {mesAntAño}
          </button>
        ) : (
          <div style={{ padding: "14px", background: "linear-gradient(135deg, #fef3c7, #fde68a)", borderRadius: 12, fontSize: 14, fontWeight: 900, color: "#92400e", textAlign: "center" }}>
            ✅ {MES_NAMES[mesAntMes - 1]} {mesAntAño} ya está cerrado
          </div>
        )}
      </div>

      {/* Toggle avanzado */}
      <button
        onClick={() => setMostrarAvanzado(!mostrarAvanzado)}
        style={{ background: "none", border: "none", color: "#7c3aed", textDecoration: "underline", cursor: "pointer", fontSize: 11, fontWeight: 700, padding: "8px 0", display: "block", margin: "0 auto" }}
      >
        {mostrarAvanzado ? "Ocultar opciones avanzadas" : "Cerrar otro mes / opciones avanzadas"}
      </button>

      {mostrarAvanzado && (
        <div className="v-card" style={{ background: "rgba(168, 85, 247, 0.04)", border: "1px dashed rgba(168, 85, 247, 0.3)" }}>
          <div className="v-card-title" style={{ color: "#7c3aed" }}>🛠️ Cerrar mes específico</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <select value={añoSel} onChange={e => setAñoSel(Number(e.target.value))} style={inputStyle}>
              {[hoy.año - 1, hoy.año].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={mesSel} onChange={e => setMesSel(Number(e.target.value))} style={inputStyle}>
              {MES_NAMES.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
            </select>
          </div>
          {!mesSelValido && (
            <div style={{ fontSize: 11, color: "#dc2626", marginBottom: 6, fontWeight: 700 }}>⚠️ No puedes cerrar el mes en curso ni un mes futuro.</div>
          )}
          {mesSelYaCerrado && (
            <div style={{ fontSize: 11, color: "#92400e", marginBottom: 6, fontWeight: 700 }}>✅ Ese mes ya está cerrado.</div>
          )}
          <button
            disabled={!mesSelValido || mesSelYaCerrado}
            onClick={() => intentarCerrar(añoSel, mesSel)}
            style={{
              width: "100%", padding: "10px",
              background: (mesSelValido && !mesSelYaCerrado) ? "linear-gradient(135deg, #dc2626, #b91c1c)" : "#e2e8f0",
              color: (mesSelValido && !mesSelYaCerrado) ? "#fff" : "#94a3b8",
              border: "none", borderRadius: 10, fontSize: 13, fontWeight: 800,
              cursor: (mesSelValido && !mesSelYaCerrado) ? "pointer" : "not-allowed",
            }}
          >
            🔒 Cerrar {MES_NAMES[mesSel - 1]} {añoSel}
          </button>

          {/* Lista de cerrados */}
          {cerrados.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#7c3aed", margin: "16px 0 6px" }}>Meses cerrados ({cerrados.length}):</div>
              {cerrados.map(c => (
                <div key={`${c.año}-${c.mes}`} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 10px", background: "#fef3c7", borderRadius: 8,
                  marginBottom: 3, fontSize: 12, fontWeight: 800, color: "#92400e",
                }}>
                  <span>🔒 {MES_NAMES[c.mes - 1]} {c.año}</span>
                  <button
                    onClick={() => setConfirmarAbrir({ año: c.año, mes: c.mes })}
                    style={{ background: "transparent", border: "1px solid #dc2626", color: "#dc2626", padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 800, cursor: "pointer" }}
                  >🔓 Abrir</button>
                </div>
              ))}
              <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, marginTop: 6, fontStyle: "italic" }}>
                ⚠️ Abrir un mes descongela sus notas — usa solo en emergencias.
              </div>
            </>
          )}
        </div>
      )}

      {/* Modal confirmar cierre */}
      {confirmarCierre && (
        <div style={modalBackdrop} onClick={() => setConfirmarCierre(null)}>
          <div style={modalCard} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 900, color: "#dc2626", marginBottom: 8 }}>
              🔒 Cerrar {MES_NAMES[confirmarCierre.mes - 1]} {confirmarCierre.año}
            </div>
            <div style={{ fontSize: 13, color: "#475569", marginBottom: 12, lineHeight: 1.5 }}>
              Esta acción es <strong>IRREVERSIBLE</strong>. Las notas quedarán fijas para siempre.
            </div>
            {confirmarCierre.faltantes.length > 0 && (
              <div style={{ background: "#fef3c7", border: "1px solid #fde68a", padding: 10, borderRadius: 8, marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#92400e", marginBottom: 4 }}>⚠️ Faltan datos:</div>
                <ul style={{ margin: 0, padding: "0 0 0 16px", fontSize: 11, color: "#92400e" }}>
                  {confirmarCierre.faltantes.slice(0, 8).map((f, i) => <li key={i}>{f}</li>)}
                  {confirmarCierre.faltantes.length > 8 && <li>... y {confirmarCierre.faltantes.length - 8} más</li>}
                </ul>
              </div>
            )}
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => setConfirmarCierre(null)}
                style={{ flex: 1, padding: "10px", background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 8, fontWeight: 800, cursor: "pointer" }}
              >Cancelar</button>
              <button
                onClick={() => ejecutarCierre(confirmarCierre.año, confirmarCierre.mes)}
                style={{ flex: 1, padding: "10px", background: "linear-gradient(135deg, #dc2626, #b91c1c)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 800, cursor: "pointer" }}
              >🔒 Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar abrir */}
      {confirmarAbrir && (
        <div style={modalBackdrop} onClick={() => setConfirmarAbrir(null)}>
          <div style={modalCard} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 900, color: "#dc2626", marginBottom: 8 }}>
              🔓 ¿Abrir {MES_NAMES[confirmarAbrir.mes - 1]} {confirmarAbrir.año}?
            </div>
            <div style={{ fontSize: 13, color: "#475569", marginBottom: 12, lineHeight: 1.5 }}>
              Descongelará el mes — Carolina podrá volver a modificar registros. Solo úsalo en emergencias reales.
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => setConfirmarAbrir(null)}
                style={{ flex: 1, padding: "10px", background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 8, fontWeight: 800, cursor: "pointer" }}
              >Cancelar</button>
              <button
                onClick={() => ejecutarApertura(confirmarAbrir.año, confirmarAbrir.mes)}
                style={{ flex: 1, padding: "10px", background: "linear-gradient(135deg, #dc2626, #b91c1c)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 800, cursor: "pointer" }}
              >🔓 Abrir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: "1.5px solid #cbd5e1", fontSize: 14, fontFamily: "inherit",
  fontWeight: 700, color: "#0f172a", background: "#fff",
};
const modalBackdrop = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: 20, zIndex: 300,
};
const modalCard = {
  background: "#fff", borderRadius: 16, padding: 20,
  maxWidth: 380, width: "100%",
  boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
};
