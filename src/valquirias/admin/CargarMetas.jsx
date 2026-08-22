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

  // Estado del guardado, EN EL BOTÓN. El mensaje de `flash` se pinta arriba del
  // todo y en el celular queda fuera de la pantalla cuando uno está abajo: se
  // tocaba Guardar y parecía que no pasaba nada. Ahora el botón mismo dice qué
  // está haciendo, y el error se queda hasta que se vuelva a intentar.
  const [estado, setEstado] = useState("listo");   // listo | guardando | ok | error
  const [detalleError, setDetalleError] = useState(null);

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
      setEstado("error");
      setDetalleError("Escribe al menos una de las dos metas.");
      return;
    }
    setEstado("guardando");
    setDetalleError(null);
    // Parche de UNA clave (este mes). Los demás meses ni se mencionan, así que
    // es imposible pisarlos con una copia vieja de `metas`.
    const prev = datos.metas?.[clave] || { vendidas: {} };
    try {
      await datos.guardarClaves("metas", {
        [clave]: { ...prev, meta: { MED: medVal, BOG: bogVal } },
      });
    } catch (e) {
      console.error("Falló el guardado de la meta", clave, e);
      setEstado("error");
      // El motivo exacto, sin recortar: si es un permiso denegado hay que verlo.
      setDetalleError(e?.message || String(e));
      return;
    }
    setEstado("ok");
    flash(`✅ Meta de ${MES_NAMES[mesSel - 1]} ${añoSel} guardada`);
    setTimeout(() => setEstado("listo"), 2500);
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
          background: msg.tipo === "err" ? "var(--adm-alerta-fondo)" : "var(--vk-bien-fondo)",
          color: msg.tipo === "err" ? "var(--adm-alerta)" : "var(--vk-bien)",
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
          <div style={{ padding: "12px 14px", background: "var(--vk-noche)", borderRadius: 10, fontSize: 13, fontWeight: 900, color: "var(--vk-noche-apoyo)", textAlign: "center" }}>
            🔒 {MES_NAMES[mesSel - 1]} {añoSel} está CERRADO
            <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4 }}>No se puede modificar la meta</div>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 10 }}>
              <label style={{ ...labelStyle, color: "var(--vk-bien)" }}>🟢 Meta Medellín</label>
              <InputPesos
                key={`med-${clave}`}
                inputRef={refMED}
                defaultValue={inicialMED}
                placeholder="Ej: 250.000.000"
                style={{ ...inputStyle, borderColor: "var(--vk-bien-texto)", background: "var(--vk-bien-fondo)" }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ ...labelStyle, color: "var(--vk-metal-borde)" }}>🟡 Meta Bogotá</label>
              <InputPesos
                key={`bog-${clave}`}
                inputRef={refBOG}
                defaultValue={inicialBOG}
                placeholder="Ej: 150.000.000"
                style={{ ...inputStyle, borderColor: "var(--est-atencion-borde)", background: "var(--vk-noche)" }}
              />
            </div>
            <button
              onClick={handleGuardar}
              disabled={estado === "guardando"}
              style={{
                width: "100%",
                padding: "12px",
                background: estado === "ok" ? "var(--vk-bien)"
                          : estado === "guardando" ? "var(--vk-tenue)"
                          : "var(--est-atencion)",
                color: "var(--vk-sobre-tinta)",
                border: "none",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 900,
                cursor: estado === "guardando" ? "default" : "pointer",
              }}
            >
              {estado === "guardando" ? "⏳ Guardando…"
                : estado === "ok" ? "✅ Guardada"
                : `💾 Guardar meta de ${MES_NAMES[mesSel - 1]} ${añoSel}`}            </button>

            {/* El motivo del fallo va PEGADO al botón y NO se va solo: si el
                guardado no pasó, hay que poder leer por qué. */}
            {estado === "error" && detalleError && (
              <div style={{
                marginTop: 10, padding: "10px 12px", borderRadius: 10,
                background: "var(--adm-alerta-fondo)",
                borderLeft: "3px solid var(--adm-alerta-borde)",
                fontSize: 12, fontWeight: 700, color: "var(--adm-alerta)",
                lineHeight: 1.5,
              }}>
                ❌ No se guardó. {detalleError}
              </div>
            )}
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
            border: "1.5px dashed var(--est-sin-dato)",
            borderRadius: 10,
            fontSize: 12,
            fontWeight: 700,
            color: "var(--vk-secundario)",
            textAlign: "center",
            lineHeight: 1.5,
          }}>
            Aún no hay metas guardadas.
            <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4, color: "var(--vk-tenue)" }}>
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
                <span style={{ color: "var(--vk-titulo)", fontWeight: 900 }}>
                  {c.cerrado && "🔒 "}{MES_NAMES[c.mes - 1]} {c.año}
                </span>
                <span style={{ color: "var(--vk-bien)" }}>{c.med ? formatoPesos(c.med) : "—"}</span>
                <span style={{ color: "var(--vk-metal-borde)" }}>{c.bog ? formatoPesos(c.bog) : "—"}</span>
                {!c.cerrado && <span style={{ color: "var(--vk-tenue)", fontWeight: 900 }}>›</span>}
                {c.cerrado && <span style={{ color: "var(--vk-tenue)", fontSize: 10 }}>cerrado</span>}
              </div>
            ))}
            <div style={{ fontSize: 10, color: "var(--vk-tenue)", fontWeight: 700, marginTop: 6, textAlign: "center" }}>
              Toca un mes no cerrado para editarlo
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const labelStyle = {
  fontSize: 11, fontWeight: 900, color: "var(--vk-secundario)",
  textTransform: "uppercase", letterSpacing: 1.2,
  marginBottom: 6, display: "block",
};
const inputStyle = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: "1.5px solid var(--est-sin-dato)", fontSize: 14, fontFamily: "inherit",
  fontWeight: 700, color: "var(--vk-titulo)", background: "var(--vk-tarjeta)",
};
