// Detalle Trimestre — se abre al tocar el chip "💎 Trimestre" en Tab Hoy
// HERO nota trimestral + qué falta + desglose por mes + premios + historial
//
// TODO lo que se pinta sale de datos REALES de Firestore (snapshots de meses
// cerrados + registros/metas del mes en curso), derivados con
// derivarTrimestreDeVendedora(). No hay notas ni premios inventados:
// - mes cerrado  → nota congelada del snapshot
// - mes en curso → nota preliminar, marcada como tal
// - mes futuro   → "pendiente" (nunca un 0)
// - trimestre sin ningún snapshot → no aparece en el historial
//
// El componente es autosuficiente: si no le pasan props, resuelve la vendedora
// (?simular=<id> o el email de la sesión) y lee useDatos() por su cuenta.

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../firebase.js";
import { useDatos } from "../data/DatosContext.jsx";
import { derivarTrimestreDeVendedora, derivarPorIndicadorTrimestre } from "../data/derivar.js";
import { formatoPesos, hoyColombia } from "../lib/helpers.js";

// Misma resolución que usa ValquiriasApp: ?simular=<id> → email de la sesión.
// Si no resuelve (modo demo, sin roster todavía) devuelve null y el componente
// cae a los props / al empty state honesto.
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

const num = (n) => (typeof n === "number" && !Number.isNaN(n) ? n : null);

function parseQ(q) {
  const n = parseInt(String(q ?? "").replace(/\D/g, ""), 10);
  return n >= 1 && n <= 4 ? n : null;
}

// Estado visual de cada mes del trimestre (usa las clases que ya existen en el CSS)
function estadoDeMes(m, añoQ, hoyAño, hoyMes) {
  const enCurso = añoQ === hoyAño && m.mes === hoyMes;
  const futuro = añoQ > hoyAño || (añoQ === hoyAño && m.mes > hoyMes);
  if (m.cerrado) return { clase: "completo", etiqueta: "cerrado", muestraNota: m.nota !== null };
  if (enCurso) {
    return m.nota === null
      ? { clase: "pendiente", etiqueta: "en curso · sin datos aún", muestraNota: false }
      : { clase: "progreso", etiqueta: "en curso · preliminar", muestraNota: true };
  }
  if (futuro) return { clase: "pendiente", etiqueta: "pendiente", muestraNota: false };
  if (m.nota !== null) return { clase: "progreso", etiqueta: "sin cerrar · preliminar", muestraNota: true };
  return { clase: "pendiente", etiqueta: "sin datos", muestraNota: false };
}

export default function DetalleTrimestre({
  trimestre,                    // opcional — { q, año, ... } sólo para saber QUÉ trimestre mostrar
  vendedora: vendedoraProp = null,
  mesesTrim: mesesTrimProp = null,
  simulador: simuladorProp = null,
  premios: premiosProp = null,
  historial: historialProp = null,
  ganadoras: ganadorasProp = null,
  ciudad,
  onVolver,
}) {
  // Scroll al top al abrir — evita que el detalle se abra mostrando el final
  useEffect(() => { window.scrollTo(0, 0); }, []);

  const datos = useDatos();
  const vendedora = useVendedoraActual(datos, vendedoraProp);

  const { año: hoyAño, mes: hoyMes } = hoyColombia();
  const añoQ = Number(trimestre?.año) || hoyAño;
  const qNum = parseQ(trimestre?.q) || Math.ceil(hoyMes / 3);
  const cd = (vendedora?.ciudad || ciudad) === "BOG" ? "Bogotá" : "Medellín";

  // ---- Trimestre en curso, real -------------------------------------------
  const real = useMemo(
    () => (vendedora ? derivarTrimestreDeVendedora(datos, vendedora, añoQ, qNum) : null),
    [datos, vendedora, añoQ, qNum]
  );

  const meta = real?.meta ?? 4.5;
  const notaHero = real
    ? num(real.nota)
    : (Number(trimestre?.notaActual) > 0 ? Number(trimestre.notaActual) : null);
  const pct = notaHero ? Math.min(100, (notaHero / meta) * 100) : 0;
  const falta = notaHero ? Math.max(0, meta - notaHero) : null;

  // ---- Desglose por mes ----------------------------------------------------
  const mesesTrim = useMemo(() => {
    const base = real ? real.mesesTrim : (mesesTrimProp || []);
    return base.map(m => ({ ...m, vista: estadoDeMes(m, añoQ, hoyAño, hoyMes) }));
  }, [real, mesesTrimProp, añoQ, hoyAño, hoyMes]);

  const trimestreCerrado = mesesTrim.length > 0 && mesesTrim.every(m => m.cerrado);
  const mesesConNota = mesesTrim.filter(m => m.nota !== null).length;

  // ---- Promedio por indicador del trimestre -------------------------------
  // Promedio simple de porInd[ind.id] sobre los meses del Q que tengan dato
  // (misma regla de la clásica App.jsx:918-926). Todo sale del motor.
  const porIndTrim = useMemo(
    () => (vendedora ? derivarPorIndicadorTrimestre(datos, vendedora, añoQ, qNum) : []),
    [datos, vendedora, añoQ, qNum]
  );
  const hayIndConDatos = porIndTrim.some(i => i.notaPromedio !== null);

  // Etiquetas cortas de los 3 meses del Q — para el detalle mes a mes
  const etiquetasMes = useMemo(
    () => mesesTrim.map(m => String(m.nombre || "").slice(0, 3)),
    [mesesTrim]
  );

  // ---- "Qué necesitas" — cálculo real con los pesos 20/30/50 --------------
  const simulador = useMemo(() => {
    if (!real) return simuladorProp || null;
    const conNota = mesesTrim.filter(m => m.nota !== null);
    const sinNota = mesesTrim.filter(m => m.nota === null);
    if (!conNota.length || !sinNota.length) return null;   // nada que proyectar

    const acumulado = conNota.reduce((s, m) => s + m.nota * (m.peso / 100), 0);
    const pesoFalta = sinNota.reduce((s, m) => s + m.peso / 100, 0);
    if (pesoFalta <= 0) return null;

    const necesita = Math.round(((meta - acumulado) / pesoFalta) * 100) / 100;
    const maximo = Math.round((acumulado + 5 * pesoFalta) * 100) / 100;
    const preliminar = conNota.find(m => !m.cerrado);

    return {
      necesita,
      maximo,
      nombresFaltan: sinNota.map(m => m.nombre).join(" y "),
      preliminar: preliminar ? { nombre: preliminar.nombre, nota: preliminar.nota } : null,
    };
  }, [real, simuladorProp, mesesTrim, meta]);

  // ---- Premios del trimestre (montos reales de Admin > Config Premios) -----
  const premios = useMemo(() => {
    if (!real) return premiosProp || [];
    const cfg = datos?.config?.premiosTrim?.[`${añoQ}_Q${qNum}`] || {};
    const montoBase = Number(cfg.montoBase ?? 1_000_000);
    const montoExtra = Number(cfg.montoExtra ?? 1_000_000);
    const lista = [
      { emoji: "⭐", nombre: formatoPesos(montoBase), condicion: `Nota trimestral de ${meta.toFixed(2)} o más` },
      { emoji: "🌟", nombre: `${formatoPesos(montoExtra)} extra`, condicion: `La #1 de ${cd} — sólo si 2 o más pasan el ${meta.toFixed(2)}` },
    ];
    if (cfg.reconocimiento) {
      lista.push({ emoji: "🎁", nombre: cfg.reconocimiento, condicion: "Reconocimiento del trimestre" });
    }
    return lista;
  }, [real, premiosProp, datos, añoQ, qNum, cd, meta]);

  const ganadoras = real ? (real.ganadoras || []) : (ganadorasProp || []);

  // ---- Historial: sólo trimestres que SÍ tienen snapshots de ella ----------
  const historial = useMemo(() => {
    if (!vendedora) return historialProp || [];
    const snaps = datos?.snapshots || {};
    const quarters = new Map();

    Object.keys(snaps).forEach(clave => {
      if (!snaps[clave]?.vendedoras?.[vendedora.id]) return;   // sin snapshot suyo → no existe
      const [aStr, mStr] = String(clave).split("_");
      const a = Number(aStr), m = Number(mStr);
      if (!a || !m || m < 1 || m > 12) return;
      const q = Math.ceil(m / 3);
      if (a === añoQ && q === qNum) return;                    // ese ya es el de arriba
      quarters.set(`${a}_${q}`, { año: a, q });
    });

    return [...quarters.values()]
      .sort((x, y) => (y.año - x.año) || (y.q - x.q))
      .map(({ año, q }) => {
        const t = derivarTrimestreDeVendedora(datos, vendedora, año, q);
        return {
          clave: `${año}_Q${q}`,
          q: `Q${q} ${año}`,
          nota: num(t.notaTrim),
          completo: t.completo,
          mesesConDatos: t.mesesConDatos,
          premio: t.premioMonto > 0
            ? formatoPesos(t.premioMonto)
            : (t.completo ? "Sin premio" : `${t.mesesConDatos} de 3 meses`),
          gano: t.premioMonto > 0,
          reconocimiento: t.reconocimiento || null,
        };
      });
  }, [datos, vendedora, añoQ, qNum, historialProp]);

  return (
    <>
      <div className="v-header-detalle">
        <button className="v-back-btn" onClick={onVolver}>‹ Volver</button>
        <div className="v-header-title">💎 Trimestre Q{qNum} · {añoQ}</div>
        <div style={{ width: 60 }} />
      </div>

      <div className="v-trim-hero">
        <div className="label">
          {notaHero ? (trimestreCerrado ? "Tu nota trimestral (final)" : "Tu nota trimestral (va así)") : "Trimestre en curso"}
        </div>
        <div className="valor">{notaHero ? notaHero.toFixed(2) : "—"}</div>
        <div className="meta">
          {notaHero
            ? <>Meta: {meta.toFixed(2)}{falta > 0 ? <> · faltan <strong>{falta.toFixed(2)}</strong></> : <> · ya estás sobre la meta ✅</>}</>
            : <>Meta: {meta.toFixed(2)} · aún no hay ningún mes con nota</>}
        </div>
        <div className="v-trim-hero-progress">
          <div className="v-trim-hero-fill" style={{ width: `${pct}%` }} />
        </div>
        {real && (
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.95, marginTop: 8 }}>
            {real.posicion ? `#${real.posicion} de ${real.total} en ${cd}` : `Sin posición todavía en ${cd}`}
            {mesesConNota > 0 && ` · ${mesesConNota} de 3 meses con nota`}
          </div>
        )}
      </div>

      {simulador && (
        <div className="v-card v-sim">
          <div className="v-card-title">🎯 Qué necesitas para llegar a {meta.toFixed(2)}</div>
          <div className="v-sim-msg">
            {simulador.necesita <= 1 ? (
              <>Ya lo tienes prácticamente asegurado: con lo que llevas, incluso con la nota mínima en <strong>{simulador.nombresFaltan}</strong> cierras el trimestre sobre {meta.toFixed(2)} ✅</>
            ) : simulador.necesita > 5 ? (
              <>Este trimestre ya no alcanza el {meta.toFixed(2)}: aun sacando <strong>5.00</strong> en <strong>{simulador.nombresFaltan}</strong> cerrarías en <strong>{simulador.maximo.toFixed(2)}</strong>. Sigue sumando — el próximo trimestre arranca de cero 💪</>
            ) : (
              <>Sacando <strong style={{ color: "#059669", fontSize: 16 }}>{simulador.necesita.toFixed(2)}</strong> en <strong>{simulador.nombresFaltan}</strong> cierras el trimestre en <strong>{meta.toFixed(2)}</strong> y entras en zona de premio 🏆</>
            )}
            {simulador.preliminar && (
              <div style={{ fontSize: 11, fontWeight: 700, color: "#92400e", marginTop: 6, opacity: 0.9 }}>
                Cuenta con que {simulador.preliminar.nombre} cierre como va hoy ({simulador.preliminar.nota.toFixed(2)}).
              </div>
            )}
          </div>
        </div>
      )}

      <div className="v-card">
        <div className="v-card-title">📊 Desglose por mes</div>
        {mesesTrim.length > 0 ? (
          mesesTrim.map((m) => (
            <div key={m.mes ?? m.nombre} className="v-mes-row">
              <div>
                <div className="v-mes-nombre">{m.nombre}</div>
                <div className="v-mes-peso">Peso: {m.peso}% · {m.vista.etiqueta}</div>
              </div>
              <div className={"v-mes-row-nota " + m.vista.clase}>
                {m.vista.muestraNota && m.nota !== null ? m.nota.toFixed(2) : "—"}
              </div>
            </div>
          ))
        ) : (
          <div style={{ padding: "16px 4px", fontSize: 13, color: "#64748b", fontWeight: 600, lineHeight: 1.5, textAlign: "center" }}>
            Aún no hay notas de este trimestre — se irán llenando a medida que se registren los días y se cierre cada mes.
          </div>
        )}
      </div>

      {porIndTrim.length > 0 && (
        <div className="v-card">
          <div className="v-card-title">
            <span>🎯 Promedio por indicador del trimestre</span>
            {hayIndConDatos && (
              <span className="v-card-title-cierra">promedio de los meses con dato</span>
            )}
          </div>

          {hayIndConDatos ? (
            <>
              {porIndTrim.map((ind) => {
                const tieneNota = ind.notaPromedio !== null;
                const estado = tieneNota ? (ind.estado || "good") : "";
                const pct = tieneNota ? Math.max(0, Math.min(100, (ind.notaPromedio / 5) * 100)) : 0;
                const detalle = tieneNota
                  ? ind.notasMes
                      .map((n, i) => `${etiquetasMes[i] || ""} ${n !== null ? n.toFixed(2) : "—"}`.trim())
                      .join(" · ")
                  : "Sin datos en este trimestre";
                return (
                  <div key={ind.id} className={("v-ind-row " + estado).trim()}>
                    <div className="ico">{ind.emoji || "📌"}</div>
                    <div className="info">
                      <div className="nom">{ind.nombre}</div>
                      <div className="det">{detalle}</div>
                      <div style={barTrack}>
                        <div
                          style={{
                            ...barFill,
                            width: `${pct}%`,
                            background: tieneNota ? (ind.color || "#a855f7") : "#cbd5e1",
                          }}
                        />
                      </div>
                    </div>
                    <div className="der">
                      <div className={"nota" + (estado === "warn" ? " warn" : "")}>
                        {tieneNota ? ind.notaPromedio.toFixed(2) : "—"}
                      </div>
                      <div className="peso">peso {ind.peso}%</div>
                      {tieneNota && ind.mesesConDatos < 3 && (
                        <div style={mesesStyle}>{ind.mesesConDatos} de 3 meses</div>
                      )}
                    </div>
                  </div>
                );
              })}
              {!trimestreCerrado && (
                <div style={notaPieStyle}>
                  Es el promedio de los meses que ya tienen datos — se actualiza a medida que cierra cada mes.
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: "16px 4px", fontSize: 13, color: "#64748b", fontWeight: 600, lineHeight: 1.5, textAlign: "center" }}>
              Todavía no hay ningún mes del trimestre con indicadores registrados. Aquí verás cómo vas en cada uno (puntualidad, presentación…) apenas empiecen a registrarse los días.
            </div>
          )}
        </div>
      )}

      {premios.length > 0 && (
        <div className="v-card" style={{ background: "linear-gradient(135deg, #fef3c7, #fed7aa)", borderLeft: "4px solid #f97316", border: "1px solid rgba(249, 115, 22, 0.2)" }}>
          <div className="v-card-title" style={{ color: "#7c2d12" }}>
            🏆 Premios {trimestreCerrado ? "del" : "en juego ·"} Q{qNum}
          </div>
          {premios.map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", borderBottom: i < premios.length - 1 ? "1px dashed rgba(249, 115, 22, 0.2)" : "none" }}>
              <div style={{ fontSize: 32, width: 44, textAlign: "center" }}>{p.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: "#7c2d12" }}>{p.nombre}</div>
                <div style={{ fontSize: 12, color: "#9a3412", fontWeight: 600, marginTop: 2 }}>{p.condicion}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {ganadoras.length > 0 && (
        <div className="v-card">
          <div className="v-card-title">
            🏆 {trimestreCerrado ? `Ganadoras del Q${qNum}` : `Van ganando el Q${qNum}`} en {cd}
          </div>
          {ganadoras.map((g, i) => (
            <div key={`${g.id ?? g.nombre}-${i}`} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < ganadoras.length - 1 ? "1px dashed rgba(168, 85, 247, 0.15)" : "none" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 900, color: "#1e1b4b" }}>{g.nombre}</div>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>{g.razon}</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 900, color: "#047857" }}>{formatoPesos(g.monto)}</div>
            </div>
          ))}
          {!trimestreCerrado && (
            <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, marginTop: 8 }}>
              Va en tiempo real — puede cambiar hasta que cierren los 3 meses.
            </div>
          )}
        </div>
      )}

      {historial.length > 0 && (
        <div className="v-card">
          <div className="v-card-title">📅 Historial de trimestres</div>
          {historial.map((h) => (
            <div key={h.clave} style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 10px",
              background: h.gano ? "linear-gradient(90deg, #fef3c7, #fde68a)" : "rgba(168, 85, 247, 0.04)",
              border: h.gano ? "1.5px solid #fbbf24" : "none",
              borderRadius: 10,
              marginBottom: 4,
              fontSize: 12,
              fontWeight: 700,
              color: h.gano ? "#78350f" : "#475569",
            }}>
              <span style={{ width: 70, fontWeight: 900 }}>{h.q}</span>
              <span style={{ fontSize: 15, fontWeight: 900, color: h.gano ? "#78350f" : "#1e1b4b", width: 60, textAlign: "center" }}>
                {h.nota !== null ? h.nota.toFixed(2) : "—"}
              </span>
              <span style={{ flex: 1, textAlign: "right", fontSize: 11 }}>
                {h.premio}{h.reconocimiento ? ` · ${h.reconocimiento}` : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// Mismos estilos que DetalleComportamiento — la barra y los pies de los
// indicadores no viven en el CSS, se comparten por copia local.
const barTrack = {
  marginTop: 6,
  height: 5,
  borderRadius: 3,
  background: "rgba(148,163,184,0.25)",
  overflow: "hidden",
};

const barFill = {
  height: "100%",
  borderRadius: 3,
};

const mesesStyle = {
  marginTop: 3,
  fontSize: 10,
  fontWeight: 800,
  color: "#b45309",
};

const notaPieStyle = {
  marginTop: 8,
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px dashed #a855f759",
  background: "linear-gradient(90deg, #faf5ff, #fff)",
  fontSize: 12,
  fontWeight: 700,
  color: "#475569",
  lineHeight: 1.5,
};
