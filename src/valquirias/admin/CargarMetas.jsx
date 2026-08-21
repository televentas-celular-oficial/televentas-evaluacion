// Admin > Metas del mes
// Portado de FormularioMetasCiudad (App.jsx:79-230) al estilo Valquirias TLV
//
// Carga meta por ciudad (MED / BOG) para un mes específico.
// Escribe en Firestore: metas[claveMes].meta = { MED: X, BOG: Y }

import { useRef, useState, useMemo } from "react";
import { useDatos } from "../data/DatosContext.jsx";
import InputPesos, { leerPesos } from "../common/InputPesos.jsx";
import { formatoPesos, hoyColombia } from "../lib/helpers.js";
import { MES_NAMES } from "../../lib/constantes.js";

export default function CargarMetas({ onVolver }) {
  const datos = useDatos();
  const hoy = hoyColombia();
  const [mesSel, setMesSel] = useState(hoy.mes);
  const [añoSel, setAñoSel] = useState(hoy.año);
  const [msg, setMsg] = useState(null);

  const clave = `${añoSel}_${String(mesSel).padStart(2, "0")}`;
  const metaExistente = datos.metas?.[clave]?.meta;
  const cerrado = !!datos.snapshots?.[clave];

  // Extraer valores iniciales (soporta formato viejo número y nuevo {MED,BOG})
  let inicialMED = "";
  let inicialBOG = "";
  if (metaExistente != null) {
    if (typeof metaExistente === "number") {
      inicialMED = String(metaExistente);
      inicialBOG = String(metaExistente);
    } else if (typeof metaExistente === "object") {
      inicialMED = metaExistente.MED ? String(metaExistente.MED) : "";
      inicialBOG = metaExistente.BOG ? String(metaExistente.BOG) : "";
    }
  }

  const refMED = useRef(null);
  const refBOG = useRef(null);

  function flash(txt, tipo = "ok") {
    setMsg({ txt, tipo });
    setTimeout(() => setMsg(null), 3000);
  }

  async function handleGuardar() {
    const medVal = leerPesos(refMED);
    const bogVal = leerPesos(refBOG);
    if (medVal <= 0 && bogVal <= 0) {
      flash("⚠️ Ingresa al menos una meta", "err");
      return;
    }
    // Parche de UNA clave (este mes). Los demás meses ni se mencionan, así que
    // es imposible pisarlos con una copia vieja de `metas`.
    const prev = datos.metas?.[clave] || { vendidas: {} };
    try {
      await datos.guardarClaves("metas", {
        [clave]: { ...prev, meta: { MED: medVal, BOG: bogVal } },
      });
    } catch (e) {
      console.error(e);
      flash(`❌ NO se guardó la meta: ${e?.message || "error guardando"}`, "err");
      return;
    }
    flash(`✅ Meta de ${MES_NAMES[mesSel - 1]} ${añoSel} guardada`);
  }

  // Lista de metas ya cargadas
  const cargadas = useMemo(() => {
    return Object.entries(datos.metas || {})
      .map(([k, m]) => {
        const [y, mm] = k.split("_").map(Number);
        const val = m?.meta;
        let med = null, bog = null;
        if (typeof val === "number") { med = val; bog = val; }
        else if (typeof val === "object" && val) { med = val.MED || null; bog = val.BOG || null; }
        return { clave: k, año: y, mes: mm, med, bog, cerrado: !!datos.snapshots?.[k] };
      })
      .filter(x => x.med || x.bog)
      .sort((a, b) => (b.año - a.año) || (b.mes - a.mes));
  }, [datos.metas, datos.snapshots]);

  return (
    <div className="v-app v-ancho">
      <div className="v-header-detalle">
        <button className="v-back-btn" onClick={onVolver}>‹ Volver</button>
        <div className="v-header-title">🎯 Metas del mes</div>
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

      {/* Bloque explicativo retirado el 21-ago-2026 (regla del dueño: en el
          panel no van subtítulos ni explicaciones de lo que hace cada cosa). */}

      {/* Selector año/mes */}
      <div className="v-card">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Año</label>
            <select value={añoSel} onChange={e => setAñoSel(Number(e.target.value))} style={inputStyle}>
              {[hoy.año - 1, hoy.año, hoy.año + 1].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Mes</label>
            <select value={mesSel} onChange={e => setMesSel(Number(e.target.value))} style={inputStyle}>
              {MES_NAMES.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
            </select>
          </div>
        </div>

        {cerrado ? (
          <div style={{ padding: "12px 14px", background: "linear-gradient(135deg, #fef3c7, #fde68a)", borderRadius: 10, fontSize: 13, fontWeight: 900, color: "#92400e", textAlign: "center" }}>
            🔒 {MES_NAMES[mesSel - 1]} {añoSel} está CERRADO
            <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4 }}>No se puede modificar la meta</div>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 10 }}>
              <label style={{ ...labelStyle, color: "#047857" }}>🟢 Meta Medellín</label>
              <InputPesos
                key={`med-${clave}`}
                inputRef={refMED}
                defaultValue={inicialMED}
                placeholder="Ej: 250.000.000"
                style={{ ...inputStyle, borderColor: "#10b981", background: "#f0fdf4" }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ ...labelStyle, color: "#b45309" }}>🟡 Meta Bogotá</label>
              <InputPesos
                key={`bog-${clave}`}
                inputRef={refBOG}
                defaultValue={inicialBOG}
                placeholder="Ej: 150.000.000"
                style={{ ...inputStyle, borderColor: "#f59e0b", background: "#fffbeb" }}
              />
            </div>
            <button
              onClick={handleGuardar}
              style={{
                width: "100%",
                padding: "12px",
                background: "linear-gradient(135deg, #f97316, #ea580c)",
                color: "#fff",
                border: "none",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 900,
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(249, 115, 22, 0.3)",
              }}
            >
              💾 Guardar meta de {MES_NAMES[mesSel - 1]} {añoSel}
            </button>
          </>
        )}
      </div>

      {/* Lista de metas ya cargadas */}
      <div className="v-card" style={{ marginTop: 14 }}>
        <div className="v-card-title">📅 Metas cargadas</div>
        {cargadas.length === 0 ? (
          <div style={{
            padding: "18px 14px",
            background: "rgba(148, 163, 184, 0.08)",
            border: "1.5px dashed #cbd5e1",
            borderRadius: 10,
            fontSize: 12,
            fontWeight: 700,
            color: "#64748b",
            textAlign: "center",
            lineHeight: 1.5,
          }}>
            Aún no hay metas guardadas.
            <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4, color: "#94a3b8" }}>
              Usa el formulario de arriba para crear la primera.
            </div>
          </div>
        ) : (
          <>
            {cargadas.map(c => (
              <div key={c.clave} style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr auto",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                background: c.cerrado ? "rgba(251, 191, 36, 0.08)" : "rgba(168, 85, 247, 0.04)",
                borderRadius: 8,
                marginBottom: 3,
                fontSize: 12,
                fontWeight: 700,
                cursor: c.cerrado ? "default" : "pointer",
              }} onClick={() => !c.cerrado && (setAñoSel(c.año), setMesSel(c.mes))}>
                <span style={{ color: "#1e1b4b", fontWeight: 900 }}>
                  {c.cerrado && "🔒 "}{MES_NAMES[c.mes - 1]} {c.año}
                </span>
                <span style={{ color: "#047857" }}>{c.med ? formatoPesos(c.med) : "—"}</span>
                <span style={{ color: "#b45309" }}>{c.bog ? formatoPesos(c.bog) : "—"}</span>
                {!c.cerrado && <span style={{ color: "#a855f7", fontWeight: 900 }}>›</span>}
                {c.cerrado && <span style={{ color: "#94a3b8", fontSize: 10 }}>cerrado</span>}
              </div>
            ))}
            <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, marginTop: 6, textAlign: "center" }}>
              Toca un mes no cerrado para editarlo
            </div>
          </>
        )}
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
};
