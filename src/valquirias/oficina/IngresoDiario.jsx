// Panel Carolina (rol oficina) — Ingreso diario de indicadores
// Portado de PantallaIngreso vieja (App.jsx:1067-1250)
//
// Flujo:
// 1. Elige fecha (por defecto hoy)
// 2. Marca quién descansó — esas no llenan indicadores
// 3. Por cada vendedora que trabajó:
//    - Min tarde (0-150, con -/+)
//    - Reseñas (0-50, con -/+)
//    - Tienda: orden / uniforme / depósito (bien/mal cada uno)
//    - Planilla: bien/mal
//    - Actitud: bien/regular/mal → si regular/mal, obligatorio "qué pasó"
// 4. Guardar día

import { useState, useMemo, useEffect, useRef } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase.js";
import { primerNombre, hoyColombia } from "../lib/helpers.js";
import { VENDEDORAS_DEFAULT } from "../../lib/constantes.js";
import { useDatos } from "../data/DatosContext.jsx";
import { notaDia, claveMes, fmtN, colorN, bgN } from "../../lib/calculos.js";

function diaVacio() {
  return {
    minutos: 0,
    resenas: 0,
    tienda_orden: "bien",
    tienda_uniforme: "bien",
    tienda_deposito: "bien",
    planilla: "bien",
    actitud: "bien",
    actitud_nota: "",
    descanso: false,
  };
}

export default function IngresoDiario({ vendedoras = VENDEDORAS_DEFAULT, onGuardar }) {
  // Los datos crudos se leen directamente del contexto (no de props): esta pantalla
  // necesita `registros` para precargar el día y `snapshots` para saber si el mes
  // ya está cerrado. Ver App.jsx:426-438 y App.jsx:1075.
  const datos = useDatos();
  // Memoizados: `registros` es dependencia del efecto de precarga; si su identidad
  // cambiara en cada render el efecto se dispararía en bucle.
  const registros = useMemo(() => datos.registros || {}, [datos.registros]);
  const snapshots = useMemo(() => datos.snapshots || {}, [datos.snapshots]);

  const hoy = hoyColombia();
  const [fecha, setFecha] = useState(hoy.iso);
  const [filas, setFilas] = useState({});
  const [guardado, setGuardado] = useState(false);        // el día YA tiene registros en Firestore
  const [recienGuardado, setRecienGuardado] = useState(false); // se acaba de guardar en esta sesión
  const [tocadas, setTocadas] = useState(() => new Set()); // vids revisadas en esta sesión
  const [erroresFalt, setErroresFalt] = useState([]);

  // Año/mes del día que se está llenando (para nota del día y guard de mes cerrado)
  const [añoIng, mesIng] = useMemo(() => {
    const [y, m] = fecha.split("-");
    return [parseInt(y, 10), parseInt(m, 10)];
  }, [fecha]);

  // ─── Guard de mes cerrado (App.jsx:1075, 1082-1086) ───
  const mesCerrado = !!snapshots[claveMes(añoIng, mesIng)];

  const activas = useMemo(
    // `activa !== false` y NO `activa` truthy: una vendedora sin el campo `activa`
    // en Firestore debe seguir apareciendo (App.jsx usa el mismo criterio).
    () => (vendedoras || []).filter(v => v.activa !== false),
    [vendedoras]
  );

  // ─── Precarga del día (App.jsx:426-438) ───
  // Al cambiar de fecha (o al llegar los datos) las filas se inicializan con lo
  // que YA está registrado. Antes se hacía setFilas({}) y un día guardado se veía
  // en blanco, obligando a rellenarlo desde cero y pisando lo anterior.
  const fechaCargadaRef = useRef(null);
  const tocadasRef = useRef(new Set());

  useEffect(() => {
    if (!datos.cargado || activas.length === 0) return;
    const cambioDeDia = fechaCargadaRef.current !== fecha;

    // `registros` es un onSnapshot en vivo: si ya hay ediciones locales del mismo
    // día, no las pisamos con lo que llega de Firestore (incluido nuestro propio
    // guardado). Solo re-inicializamos al cambiar de día o mientras no se ha tocado nada.
    if (!cambioDeDia && tocadasRef.current.size > 0) return;

    fechaCargadaRef.current = fecha;
    const init = {};
    activas.forEach(v => {
      const reg = registros[`${v.id}_${fecha}`];
      init[v.id] = reg ? { ...diaVacio(), ...reg } : diaVacio();
    });
    setFilas(init);
    setGuardado(activas.some(v => registros[`${v.id}_${fecha}`]));

    if (cambioDeDia) {
      tocadasRef.current = new Set();
      setTocadas(tocadasRef.current);
      setRecienGuardado(false);
      setErroresFalt([]);
    }
  }, [fecha, activas, registros, datos.cargado]);

  function setFila(vid, campo, valor) {
    if (mesCerrado) return;
    setFilas(f => ({ ...f, [vid]: { ...(f[vid] || diaVacio()), [campo]: valor } }));
    if (!tocadasRef.current.has(vid)) {
      tocadasRef.current = new Set(tocadasRef.current).add(vid);
      setTocadas(tocadasRef.current);
    }
    if (recienGuardado) setRecienGuardado(false);
  }

  const trabajan = activas.filter(v => !filas[v.id]?.descanso);

  const activasMed = activas.filter(v => v.ciudad === "MED");
  const activasBog = activas.filter(v => v.ciudad === "BOG");

  function guardarDia() {
    if (mesCerrado) return; // no se guarda nada sobre un mes ya cerrado

    // Validar actitud regular/mal con motivo
    const faltantes = trabajan.filter(v => {
      const f = filas[v.id];
      if (!f) return false;
      const necesita = f.actitud === "regular" || f.actitud === "mal";
      const tiene = (f.actitud_nota || "").trim().length > 0;
      return necesita && !tiene;
    }).map(v => v.id);

    if (faltantes.length > 0) {
      setErroresFalt(faltantes);
      // Scroll a la primera con error
      setTimeout(() => {
        const el = document.querySelector(`[data-actitud-vid="${faltantes[0]}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
      return;
    }

    setErroresFalt([]);
    // Se escriben TODAS las activas, no solo las que se tocaron (App.jsx:470-476).
    // Antes, una vendedora sin novedades no generaba registro y su día "bien"
    // simplemente no existía para el cálculo mensual.
    const payload = {};
    activas.forEach(v => {
      payload[v.id] = { ...diaVacio(), ...(filas[v.id] || {}), vid: v.id, fecha };
    });
    onGuardar?.({ fecha, filas: payload });
    setGuardado(true);
    setRecienGuardado(true);
  }

  const progresoLlenado = trabajan.filter(
    v => tocadas.has(v.id) || registros[`${v.id}_${fecha}`]
  ).length;

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
        Hola <strong>Carolina</strong> <span className="v-role-mini oficina">Oficina</span>
        <div style={{ marginTop: 4, fontSize: 12, color: "#0891b2", fontWeight: 900 }}>📝 Ingreso diario de indicadores</div>
      </div>

      {/* Aviso de mes cerrado — solo lectura (App.jsx:1082-1086) */}
      {mesCerrado && (
        <div style={{ background: "#fee2e2", border: "2px solid #fca5a5", borderRadius: 12, padding: "10px 14px", marginBottom: 10, fontSize: 12.5, fontWeight: 800, color: "#991b1b" }}>
          🔒 Este mes ya está CERRADO. Estás viendo el día en modo solo lectura: no se puede cambiar ni guardar nada. Para corregirlo hay que reabrir el mes desde Admin.
        </div>
      )}

      {/* Selector de fecha */}
      <div className="v-card" style={{ background: "linear-gradient(135deg, #ecfeff, #f0f9ff)", borderLeft: "4px solid #06b6d4", border: "1px solid rgba(6, 182, 212, 0.2)" }}>
        <label style={{ fontSize: 11, fontWeight: 900, color: "#0e7490", textTransform: "uppercase", letterSpacing: 1.2, display: "block", marginBottom: 6 }}>📆 Fecha del día a llenar</label>
        <input
          type="date"
          value={fecha}
          max={hoy.iso}
          onChange={e => setFecha(e.target.value)}
          style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #06b6d4", borderRadius: 10, fontSize: 15, fontFamily: "inherit", fontWeight: 700, color: "#164e63", background: "#fff" }}
        />
        {guardado && (
          <div style={{ marginTop: 10, padding: "8px 12px", background: "#ecfdf5", color: "#047857", borderRadius: 8, fontSize: 13, fontWeight: 800, textAlign: "center" }}>
            {recienGuardado
              ? `✅ Día ${fecha} guardado`
              : "✅ Día guardado — abajo ves lo ya registrado; puedes corregir y volver a guardar"}
          </div>
        )}
      </div>

      {/* Progreso */}
      <div style={{ background: "linear-gradient(135deg, #f3e8ff, #fdf4ff)", borderLeft: "4px solid #a855f7", padding: "10px 12px", borderRadius: 12, marginBottom: 10, border: "1px solid rgba(168, 85, 247, 0.2)" }}>
        <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 900, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4 }}>Progreso del día</div>
        <div style={{ fontSize: 18, fontWeight: 900, color: "#4c1d95" }}>
          {progresoLlenado} <span style={{ fontSize: 13, color: "#64748b", fontWeight: 700 }}>de {trabajan.length} llenadas</span>
        </div>
        <div style={{ background: "rgba(168, 85, 247, 0.15)", height: 6, borderRadius: 3, marginTop: 6, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(progresoLlenado / Math.max(1, trabajan.length)) * 100}%`, background: "linear-gradient(90deg, #a855f7, #7c3aed)", borderRadius: 3, transition: "width 0.3s" }} />
        </div>
        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginTop: 6 }}>
          ✅ {trabajan.length} trabajan · 😴 {activas.length - trabajan.length} descansan
        </div>
      </div>

      {/* Bloque 1: ¿Quién descansó? */}
      <div className="v-card">
        <div className="v-card-title" style={{ color: "#ea580c" }}>1️⃣ ¿Quién descansó hoy?</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {activas.map(v => {
            const desc = filas[v.id]?.descanso;
            const esBog = v.ciudad === "BOG";
            return (
              <button
                key={v.id}
                disabled={mesCerrado}
                onClick={() => setFila(v.id, "descanso", !desc)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 20,
                  border: "2px solid " + (desc ? "#fca5a5" : esBog ? "rgba(245, 158, 11, 0.4)" : "rgba(16, 185, 129, 0.4)"),
                  cursor: mesCerrado ? "default" : "pointer",
                  opacity: mesCerrado ? 0.6 : 1,
                  fontSize: 12,
                  fontWeight: 800,
                  background: desc ? "#fee2e2" : "#fff",
                  color: desc ? "#dc2626" : esBog ? "#b45309" : "#047857",
                  textDecoration: desc ? "line-through" : "none",
                }}
              >
                {desc && "😴 "}{primerNombre(v.nombre)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bloque 2: Novedades por vendedora */}
      <div style={{ fontSize: 12, fontWeight: 900, color: "#ea580c", textTransform: "uppercase", letterSpacing: 1.5, margin: "16px 4px 8px" }}>
        2️⃣ Novedades del día
        <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, marginTop: 2, textTransform: "none", letterSpacing: 0 }}>
          Todo empieza en "bien" · marca solo lo que NO fue perfecto
        </div>
      </div>

      {/* Sección MED */}
      {activasMed.filter(v => !filas[v.id]?.descanso).length > 0 && (
        <div style={{ fontSize: 11, fontWeight: 900, color: "#047857", padding: "6px 10px", background: "linear-gradient(90deg, #ecfdf5, transparent)", borderRadius: 6, marginBottom: 6 }}>
          🟢 Team Valquirias Medellín
        </div>
      )}
      {activasMed.filter(v => !filas[v.id]?.descanso).map(v => (
        <FilaVendedora
          key={v.id}
          v={v}
          f={filas[v.id] || diaVacio()}
          onCambio={(campo, valor) => setFila(v.id, campo, valor)}
          enError={erroresFalt.includes(v.id)}
          bloqueado={mesCerrado}
          fecha={fecha}
          año={añoIng}
          mes={mesIng}
        />
      ))}

      {/* Sección BOG */}
      {activasBog.filter(v => !filas[v.id]?.descanso).length > 0 && (
        <div style={{ fontSize: 11, fontWeight: 900, color: "#b45309", padding: "6px 10px", background: "linear-gradient(90deg, #fef3c7, transparent)", borderRadius: 6, marginBottom: 6, marginTop: 10 }}>
          🟡 Team Valquirias Bogotá
        </div>
      )}
      {activasBog.filter(v => !filas[v.id]?.descanso).map(v => (
        <FilaVendedora
          key={v.id}
          v={v}
          f={filas[v.id] || diaVacio()}
          onCambio={(campo, valor) => setFila(v.id, campo, valor)}
          enError={erroresFalt.includes(v.id)}
          bloqueado={mesCerrado}
          fecha={fecha}
          año={añoIng}
          mes={mesIng}
        />
      ))}

      {/* Error de faltantes */}
      {erroresFalt.length > 0 && (
        <div style={{ background: "#fee2e2", border: "2px solid #fca5a5", borderRadius: 10, padding: "10px 14px", marginTop: 8, fontSize: 12, fontWeight: 800, color: "#991b1b" }}>
          ⚠️ Faltan {erroresFalt.length} vendedora{erroresFalt.length !== 1 ? "s" : ""} con actitud Regular/Mal sin describir qué pasó.
        </div>
      )}

      {/* Botón guardar */}
      <button
        onClick={guardarDia}
        disabled={mesCerrado}
        style={{
          width: "100%",
          background: mesCerrado ? "#e2e8f0" : "linear-gradient(135deg, #10b981, #059669)",
          color: mesCerrado ? "#94a3b8" : "#fff",
          border: "none",
          padding: "14px",
          borderRadius: 14,
          fontSize: 15,
          fontWeight: 900,
          marginTop: 12,
          boxShadow: mesCerrado ? "none" : "0 4px 12px rgba(16, 185, 129, 0.35)",
          cursor: mesCerrado ? "default" : "pointer",
        }}
      >
        {mesCerrado ? "🔒 Mes cerrado — no se puede guardar" : "💾 Guardar día"}
      </button>
    </div>
  );
}

// Componente definido FUERA de IngresoDiario para evitar remount que pierde foco
// (Bug histórico #8 del actitud_nota — App.jsx:1192-1220)
function FilaVendedora({ v, f, onCambio, enError, bloqueado = false, fecha, año, mes }) {
  const hayNov =
    f.minutos > 0 ||
    f.resenas > 0 ||
    f.tienda_orden === "mal" ||
    f.tienda_uniforme === "mal" ||
    f.tienda_deposito === "mal" ||
    f.planilla === "mal" ||
    f.actitud === "regular" ||
    f.actitud === "mal";

  const esBog = v.ciudad === "BOG";

  // Nota del día en vivo (App.jsx:1134) — se recalcula con cada cambio
  const nd = notaDia(f, año, mes);

  return (
    <div className="v-card" style={{ borderLeft: `4px solid ${hayNov ? "#ea580c" : (esBog ? "#f59e0b" : "#10b981")}`, marginBottom: 8, opacity: bloqueado ? 0.75 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <div style={{ fontWeight: 900, fontSize: 14, color: "#1e1b4b" }}>
          {v.nombre}
        </div>
        {nd !== null && nd !== undefined && <NotaBadge nota={nd} />}
      </div>

      {/* Minutos + Reseñas con contadores */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        <ContadorNumerico
          label="⏰ Min tarde"
          valor={f.minutos}
          onCambio={v => onCambio("minutos", v)}
          max={150}
          bloqueado={bloqueado}
        />
        <ContadorNumerico
          label="⭐ Reseñas"
          valor={f.resenas}
          onCambio={v => onCambio("resenas", v)}
          max={50}
          bloqueado={bloqueado}
        />
      </div>

      {/* TIENDA - 3 checkboxes */}
      <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", marginBottom: 5 }}>🏪 Tienda</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
        {[["tienda_orden", "Orden"], ["tienda_uniforme", "Uniforme"], ["tienda_deposito", "Depósito"]].map(([campo, etiq]) => {
          const ok = f[campo] === "bien" || f[campo] === undefined;
          return (
            <button
              key={campo}
              disabled={bloqueado}
              onClick={() => onCambio(campo, ok ? "mal" : "bien")}
              style={{
                padding: "8px 4px",
                borderRadius: 8,
                border: "2px solid " + (ok ? "#86efac" : "#fca5a5"),
                background: ok ? "#f0fdf4" : "#fee2e2",
                color: ok ? "#059669" : "#dc2626",
                fontSize: 11,
                fontWeight: 800,
                cursor: bloqueado ? "default" : "pointer",
              }}
            >
              {ok ? "✅" : "❌"} {etiq}
            </button>
          );
        })}
      </div>

      {/* PLANILLA */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", marginBottom: 5 }}>📋 Planilla</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            {[["bien", "✅ Bien"], ["mal", "❌ Mal"]].map(([val, lab]) => {
              const sel = (f.planilla || "bien") === val;
              const ok = val === "bien";
              return (
                <button
                  key={val}
                  disabled={bloqueado}
                  onClick={() => onCambio("planilla", val)}
                  style={{
                    padding: "8px 4px",
                    borderRadius: 8,
                    border: "2px solid " + (sel ? (ok ? "#86efac" : "#fca5a5") : "#e2e8f0"),
                    background: sel ? (ok ? "#f0fdf4" : "#fee2e2") : "#fff",
                    color: sel ? (ok ? "#059669" : "#dc2626") : "#94a3b8",
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: bloqueado ? "default" : "pointer",
                  }}
                >{lab}</button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ACTITUD */}
      <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", marginBottom: 5 }}>💪 Actitud</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
        {[
          ["bien", "✅ Bien", "#86efac", "#f0fdf4", "#059669"],
          ["regular", "⚠️ Regular", "#fcd34d", "#fffbeb", "#d97706"],
          ["mal", "❌ Mal", "#fca5a5", "#fee2e2", "#dc2626"],
        ].map(([val, lab, b, bg, c]) => {
          const sel = (f.actitud || "bien") === val;
          return (
            <button
              key={val}
              disabled={bloqueado}
              onClick={() => onCambio("actitud", val)}
              style={{
                padding: "8px 4px",
                borderRadius: 8,
                border: `2px solid ${sel ? b : "#e2e8f0"}`,
                background: sel ? bg : "#fff",
                color: sel ? c : "#94a3b8",
                fontSize: 11,
                fontWeight: 800,
                cursor: bloqueado ? "default" : "pointer",
              }}
            >{lab}</button>
          );
        })}
      </div>

      {/* Motivo actitud (defaultValue + onBlur para no perder foco) */}
      {(f.actitud === "regular" || f.actitud === "mal") && (
        <div data-actitud-vid={v.id} style={{ marginTop: 8 }}>
          <input
            type="text"
            // La fecha va en la key: el input es NO controlado (defaultValue, para no
            // perder el foco — bug histórico #8). Sin la fecha en la key, al cambiar
            // de día se quedaba mostrando la nota del día anterior.
            key={`actitud-nota-${v.id}-${fecha}`}
            placeholder={enError ? "⚠️ Obligatorio: ¿qué pasó?" : "¿Qué pasó? (obligatorio)"}
            defaultValue={f.actitud_nota || ""}
            readOnly={bloqueado}
            onBlur={e => onCambio("actitud_nota", e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 12,
              fontFamily: "inherit",
              border: enError ? "2px solid #dc2626" : "1.5px solid #fbbf24",
              background: enError ? "#fee2e2" : "#fffbeb",
              borderRadius: 10,
            }}
          />
          {enError && (
            <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4, fontWeight: 700 }}>
              ⚠️ Escribe qué pasó para poder guardar
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ContadorNumerico({ label, valor, onCambio, max = 100, bloqueado = false }) {
  const v = Number(valor) || 0;
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", marginBottom: 5 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button
          disabled={bloqueado || v <= 0}
          onClick={() => onCambio(Math.max(0, v - 1))}
          style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid #e2e8f0", background: "#f1f5f9", fontSize: 18, fontWeight: 900, cursor: bloqueado ? "default" : "pointer", flexShrink: 0, color: "#475569", opacity: (bloqueado || v <= 0) ? 0.4 : 1 }}
        >−</button>
        <div style={{ flex: 1, textAlign: "center", fontWeight: 800, fontSize: 16, padding: "6px 0", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
          {v}
        </div>
        <button
          disabled={bloqueado || v >= max}
          onClick={() => onCambio(Math.min(max, v + 1))}
          style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid #e2e8f0", background: "#f1f5f9", fontSize: 18, fontWeight: 900, cursor: bloqueado ? "default" : "pointer", flexShrink: 0, color: "#475569", opacity: (bloqueado || v >= max) ? 0.4 : 1 }}
        >+</button>
      </div>
    </div>
  );
}

// Badge con la nota del día (App.jsx:520-527 NotaBadge / App.jsx:1134)
function NotaBadge({ nota, size = 14 }) {
  return (
    <div
      title="Nota del día con lo que llevas marcado"
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        minWidth: size * 2.8, padding: "2px 10px", borderRadius: 8,
        background: bgN(nota), color: colorN(nota),
        fontWeight: 900, fontSize: size, flexShrink: 0,
      }}
    >
      {fmtN(nota)}
    </div>
  );
}
