// Admin > Config Premios Trimestrales
// Editas por trimestre: monto base, monto extra, reconocimiento sorpresa
//
// Guarda en Firestore config.premiosTrim = {
//   "2026_Q3": { montoBase: 1000000, montoExtra: 1000000, reconocimiento: "TV 42\"", descripcion: "..." },
//   "2026_Q4": {...}
// }
//
// La app vendedora lee de aquí en TabComo (acordeón Premio trimestral) y DetalleTrimestre.

import { useState, useRef } from "react";
import { useDatos } from "../data/DatosContext.jsx";
import { hoyColombia, formatoPesos } from "../lib/helpers.js";
import InputPesos, { leerPesos } from "../common/InputPesos.jsx";

const TRIMESTRES = [
  { q: 1, nombre: "Q1", meses: "ene - mar" },
  { q: 2, nombre: "Q2", meses: "abr - jun" },
  { q: 3, nombre: "Q3", meses: "jul - sep" },
  { q: 4, nombre: "Q4", meses: "oct - dic" },
];

const DEFAULTS = {
  montoBase: 1_000_000,
  montoExtra: 1_000_000,
  reconocimiento: "",
  descripcion: "",
};

export default function ConfigPremios({ onVolver }) {
  const datos = useDatos();
  const hoy = hoyColombia();
  const qActual = Math.ceil(hoy.mes / 3);
  const [añoSel, setAñoSel] = useState(hoy.año);
  const [qSel, setQSel] = useState(qActual);
  const [msg, setMsg] = useState(null);

  const clave = `${añoSel}_Q${qSel}`;
  const configExistente = { ...DEFAULTS, ...(datos.config?.premiosTrim?.[clave] || {}) };

  // Los CUATRO campos se leen por ref en el momento de guardar.
  //
  // `reconocimiento` y `descripcion` eran useState inicializados UNA vez y
  // actualizados sólo en onBlur. Los inputs sí se refrescaban al cambiar de
  // trimestre (el `key` los remonta con el defaultValue nuevo), pero el estado
  // seguía guardando el texto del trimestre ANTERIOR. Entonces: abrir Q3, pasar
  // a Q4, cambiar sólo los montos y guardar escribía en Q4 el reconocimiento de
  // Q3 — un premio que a ese trimestre nadie le prometió, y que las vendedoras
  // leen en "Cómo funciona" y en Detalle Trimestre. Leyendo por ref se guarda
  // exactamente lo que está en pantalla.
  const refBase = useRef(null);
  const refExtra = useRef(null);

  // Cambia clave → resetea inputs a valores de la nueva clave
  const claveKey = clave;

  function flash(txt, tipo = "ok") {
    setMsg({ txt, tipo });
    setTimeout(() => setMsg(null), 3000);
  }

  async function guardar() {
    const base = leerPesos(refBase);
    const extra = leerPesos(refExtra);
    // El campo del reconocimiento se retiró de la pantalla (21-ago-2026), así
    // que ya no hay input que leer. Se CONSERVA lo que hubiera guardado: leerlo
    // de un ref inexistente devolvía "" y guardar los montos habría borrado en
    // silencio el reconocimiento del trimestre.
    const reconocimiento = configExistente.reconocimiento || "";
    const descripcion = configExistente.descripcion || "";
    // Se manda SÓLO la clave `premiosTrim` de config: cambiar los premios ya no
    // puede pisar `whitelistActiva` ni ningún otro ajuste.
    // Límite conocido (documentado en DatosContext): dentro de `premiosTrim` el
    // mapa se rearma desde memoria, así que dos admins editando trimestres
    // distintos a la vez podrían pisarse. Hoy sólo hay un admin.
    const nuevoPremios = {
      ...(datos.config?.premiosTrim || {}),
      [clave]: {
        montoBase: base,
        montoExtra: extra,
        reconocimiento,
        descripcion,
      },
    };
    try {
      await datos.guardarClaves("config", { premiosTrim: nuevoPremios });
    } catch (e) {
      console.error(e);
      flash(`❌ NO se guardó: ${e?.message || "error guardando"}`, "err");
      return;
    }
    flash(`✅ ${TRIMESTRES[qSel - 1].nombre} ${añoSel} guardado`);
  }

  const configuradosLista = Object.entries(datos.config?.premiosTrim || {})
    .sort()
    .reverse();

  return (
    <div className="v-app v-ancho">
      <div className="v-header-detalle">
        <button className="v-back-btn" onClick={onVolver}>‹ Volver</button>
        <div className="v-header-title">💎 Premios trimestrales</div>
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

      <div style={{ padding: "10px 12px", background: "rgba(234, 179, 8, 0.08)", borderLeft: "3px solid #eab308", borderRadius: 10, fontSize: 11, color: "#78350f", fontWeight: 700, marginBottom: 10, lineHeight: 1.55 }}>
        💡 Cada trimestre puede tener diferentes premios. El <strong>monto base</strong> lo gana cada vendedora con nota ≥4.50. El <strong>extra</strong> lo gana la mejor de la ciudad si hay 2+ con nota ≥4.50.
      </div>

      {/* Selector año/trimestre */}
      <div className="v-card">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8, marginBottom: 12 }}>
          <select value={añoSel} onChange={e => setAñoSel(Number(e.target.value))} style={inputStyle}>
            {[hoy.año, hoy.año + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div style={{ display: "flex", gap: 4 }}>
            {TRIMESTRES.map(t => {
              const activo = qSel === t.q;
              return (
                <button
                  key={t.q}
                  onClick={() => setQSel(t.q)}
                  style={{
                    flex: 1,
                    padding: "8px 4px",
                    fontSize: 12,
                    fontWeight: 900,
                    background: activo
                      ? "linear-gradient(135deg, #f59e0b, #ea580c)"
                      : "#fff",
                    color: activo ? "#fff" : "#b45309",
                    border: "1.5px solid " + (activo ? "transparent" : "#e2e8f0"),
                    borderRadius: 10,
                    cursor: "pointer",
                    lineHeight: 1.1,
                  }}
                >
                  <div>{t.nombre}</div>
                  <div style={{ fontSize: 9, opacity: 0.85, marginTop: 1 }}>{t.meses}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Montos */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>💰 Monto base (por vendedora ≥4.50)</label>
          <InputPesos
            key={`base-${claveKey}`}
            inputRef={refBase}
            defaultValue={String(configExistente.montoBase)}
            placeholder="Ej: 1.000.000"
            style={inputStyle}
          />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>🌟 Monto extra (a la mejor si hay 2+)</label>
          <InputPesos
            key={`extra-${claveKey}`}
            inputRef={refExtra}
            defaultValue={String(configExistente.montoExtra)}
            placeholder="Ej: 1.000.000"
            style={inputStyle}
          />
        </div>
        {/* RECONOCIMIENTO SORPRESA — retirado el 21-ago-2026 por decisión de Luis.
            Se podía escribir y se guardaba bien, pero NO llegaba a ninguna
            pantalla de la vendedora: sólo se veía en este panel. Un premio que
            sólo ve el dueño no es un premio, es una promesa muerta.
            La ESTRUCTURA en Firestore (`config.premiosTrim[Q].reconocimiento` y
            `.descripcion`) se conserva intacta, y lo ya guardado no se borra:
            cuando llegue Q4 y Luis decida dónde se anuncia, se vuelve a abrir
            este campo y se conecta a Mi trimestre. */}

        <button
          onClick={guardar}
          style={{
            width: "100%", padding: "12px",
            background: "linear-gradient(135deg, #f59e0b, #ea580c)",
            color: "#fff", border: "none", borderRadius: 12,
            fontSize: 14, fontWeight: 900, cursor: "pointer",
            boxShadow: "0 4px 12px rgba(245, 158, 11, 0.3)",
          }}
        >
          💾 Guardar {TRIMESTRES[qSel - 1].nombre} {añoSel}
        </button>
      </div>

      {/* Lista de trimestres ya configurados */}
      {configuradosLista.length > 0 && (
        <div className="v-card" style={{ marginTop: 14 }}>
          <div className="v-card-title">📅 Trimestres configurados</div>
          {configuradosLista.map(([k, cfg]) => {
            const [y, q] = k.split("_Q");
            return (
              <div key={k} style={{
                padding: "10px 12px",
                background: "rgba(245, 158, 11, 0.06)",
                borderRadius: 10, marginBottom: 4,
                cursor: "pointer",
                borderLeft: "3px solid #f59e0b",
              }} onClick={() => { setAñoSel(Number(y)); setQSel(Number(q)); }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: "#1e1b4b" }}>Q{q} {y}</div>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginTop: 2 }}>
                  💰 {formatoPesos(cfg.montoBase)} base · 🌟 {formatoPesos(cfg.montoExtra)} extra
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(168, 85, 247, 0.06)", borderRadius: 10, fontSize: 10, color: "#64748b", fontWeight: 700, lineHeight: 1.5 }}>
        📱 Estos valores aparecen en el Tab "❓ Cómo funciona" y en el Detalle Trimestre que ven las vendedoras. Se actualiza en vivo cuando guardas aquí.
      </div>
    </div>
  );
}

const labelStyle = {
  fontSize: 11, fontWeight: 900, color: "#475569",
  textTransform: "uppercase", letterSpacing: 1.2,
  marginBottom: 6, display: "block",
};
const inputStyle = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: "1.5px solid #cbd5e1", fontSize: 14, fontFamily: "inherit",
  fontWeight: 700, color: "#0f172a", background: "#fff",
  boxSizing: "border-box",
};
