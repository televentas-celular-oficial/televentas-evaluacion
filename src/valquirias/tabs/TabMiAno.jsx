// Tab MI AÑO — HERO del total ganado en el año + desglose real + meses cerrados
//
// Los "meses cerrados" salen de los SNAPSHOTS reales de la vendedora
// (snapshots["2026_07"].vendedoras[vid]): cada mes trae sus ventas reales del
// doc `metas`, su nota congelada y la comisión que le corresponde.
// Un mes sin snapshot NO aparece — no se inventa ni se estima.
// Lo que no existe en Firestore (premio semanal en efectivo) se dice
// "No disponible", nunca $0.
//
// El componente es autosuficiente: si no le pasan props, resuelve la vendedora
// (?simular=<id> o el email de la sesión) y lee useDatos() por su cuenta.

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../firebase.js";
import { useDatos } from "../data/DatosContext.jsx";
import { derivarTotalAñoDeVendedora, derivarTrimestreDeVendedora } from "../data/derivar.js";
import { formatoPesos, hoyColombia } from "../lib/helpers.js";

// Misma resolución que usa ValquiriasApp: ?simular=<id> → email de la sesión.
function useVendedoraActual(datos, vendedoraProp) {
  const [user, setUser] = useState(() => auth.currentUser);
  useEffect(() => onAuthStateChanged(auth, setUser), []);

  const roster = datos?.vendedoras;
  const email = (user?.email || "").toLowerCase();

  return useMemo(() => {
    if (vendedoraProp) return vendedoraProp;
    const lista = roster || [];
    if (!lista.length) return null;
    const simularId = typeof window !== "undefined"
      ? (new URLSearchParams(window.location.search).get("simular") || "")
      : "";
    if (simularId) return lista.find(v => String(v.id) === String(simularId)) || null;
    if (!email) return null;
    return lista.find(v =>
      (v.email || "").toLowerCase() === email && v.activa !== false && !v.eventual
    ) || null;
  }, [vendedoraProp, roster, email]);
}

export default function TabMiAno({
  vendedora: vendedoraProp = null,
  año: añoProp,
  totalAño,
  proyeccion,
  posicionTrim,
  ciudad,
  desglose,          // { salarioBase, premiosMensuales, premiosSemanales, premiosTrimestrales, reconocimientos }
  mesesCerrados = [], // fallback (sólo modo demo) — [{ año, mes, nombre, ventas, nota }]
  onVerMes,
}) {
  const datos = useDatos();
  const vendedora = useVendedoraActual(datos, vendedoraProp);

  const { año: hoyAño, mes: hoyMes } = hoyColombia();
  const año = Number(añoProp) || hoyAño;
  const qActual = Math.ceil(hoyMes / 3);

  // Datos REALES del año (salario pro-rateado + comisiones + premios trimestrales cerrados)
  const real = useMemo(
    () => (vendedora ? derivarTotalAñoDeVendedora(datos, vendedora, año) : null),
    [datos, vendedora, año]
  );

  // Posición del trimestre en curso — real, o nada
  const trim = useMemo(
    () => (vendedora && año === hoyAño ? derivarTrimestreDeVendedora(datos, vendedora, año, qActual) : null),
    [datos, vendedora, año, hoyAño, qActual]
  );

  const cd = (vendedora?.ciudad || ciudad) === "BOG" ? "Bogotá" : "Medellín";

  const total = real ? real.total : (Number(totalAño) || 0);
  const desg = real ? real.desglose : (desglose || {});
  const proy = real ? real.proyeccion : proyeccion;
  const posicion = real ? (trim?.posicion ?? null) : (posicionTrim ?? null);
  const totalCiudad = trim?.total ?? null;

  // Sin vendedora resuelta sólo puede haber lista si es el modo demo; en real, vacío.
  const meses = real ? real.mesesCerrados : (datos?.modoDemo ? mesesCerrados : []);

  // El efectivo semanal no está en Firestore → no se puede sumar (≠ $0)
  const semanalesDisponible = desg.premiosSemanalesDisponible !== false
    && desg.premiosSemanales !== null
    && desg.premiosSemanales !== undefined;

  return (
    <>
      <div className="v-hero-year">
        <div className="label">💎 Llevas ganado en {año}</div>
        <div className="valor">{formatoPesos(total)}</div>
        {posicion && (
          <div className="sub">
            🏆 Vas #{posicion}{totalCiudad ? ` de ${totalCiudad}` : ""} en {cd} este trimestre
          </div>
        )}
      </div>

      {proy > 0 && (
        <div className="v-proy-year">
          <div className="label">🌟 Si sigues así hasta diciembre</div>
          <div className="valor">{formatoPesos(proy)}</div>
          <div className="desc">Proyección total {año} al ritmo actual</div>
        </div>
      )}

      <div className="v-historial-list">
        <div className="titulo">💫 Desglose {año}</div>
        <div className="row">
          <span className="lbl">Salario base{real?.mesesTrabajados ? ` · ${real.mesesTrabajados} ${real.mesesTrabajados === 1 ? "mes" : "meses"}` : ""}</span>
          <span className="val">{formatoPesos(desg.salarioBase || 0)}</span>
        </div>
        <div className="row">
          <span className="lbl">Premios mensuales por ventas</span>
          <span className="val">{formatoPesos(desg.premiosMensuales || 0)}</span>
        </div>
        <div className="row">
          <span className="lbl">Premios semanales</span>
          {semanalesDisponible
            ? <span className="val">{formatoPesos(desg.premiosSemanales)}</span>
            : <span className="val" style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700 }}>No disponible</span>}
        </div>
        <div className="row">
          <span className="lbl">Premios trimestrales</span>
          <span className="val">{formatoPesos(desg.premiosTrimestrales || 0)}</span>
        </div>
        {desg.reconocimientos && (
          <div className="row"><span className="lbl">Reconocimientos</span><span className="val">{desg.reconocimientos}</span></div>
        )}
        <div className="total"><span className="lbl">Total {año}</span><span className="val">{formatoPesos(total)}</span></div>
      </div>

      {!semanalesDisponible && (
        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, lineHeight: 1.5, padding: "8px 4px 0" }}>
          El premio semanal de $50k en efectivo se entrega aparte: todavía no queda registrado en la app, por eso no se suma aquí.
        </div>
      )}

      <div className="v-card" style={{ marginTop: 12 }}>
        <div className="v-card-title">📅 Meses cerrados</div>
        {meses.length > 0 ? (
          meses.map((m) => (
            <button
              key={`${m.año}_${m.mes}`}
              onClick={() => onVerMes?.(m)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                width: "100%",
                padding: "10px 12px",
                background: "rgba(168, 85, 247, 0.05)",
                border: "1px solid rgba(168, 85, 247, 0.15)",
                borderRadius: 10,
                marginBottom: 4,
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 900, color: "#1e1b4b" }}>{m.nombre}</div>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginTop: 2 }}>
                  {formatoPesos(m.ventas || 0)} · nota {typeof m.nota === "number" ? m.nota.toFixed(2) : "—"}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {typeof m.comision === "number" && m.comision > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 900, color: "#047857" }}>{formatoPesos(m.comision)}</span>
                )}
                <span style={{ color: "#a855f7", fontWeight: 900 }}>›</span>
              </div>
            </button>
          ))
        ) : (
          <div style={{ padding: "14px 4px", fontSize: 13, color: "#64748b", fontWeight: 600, lineHeight: 1.5, textAlign: "center" }}>
            Todavía no hay meses cerrados de {año}. Cuando se cierre un mes, aquí queda su nota final y sus ventas.
          </div>
        )}
      </div>
    </>
  );
}
