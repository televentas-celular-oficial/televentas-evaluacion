// Boletín del mes — el hueco grande: hasta ahora la vendedora SOLO podía ver
// el mes en curso. En TabMiAno los meses cerrados se pintaban como botones con
// chevron pero el handler estaba vacío (onVerMes={() => {}}), así que ningún mes
// pasado era abrible.
//
// Esto porta PantallaBoletin de la clásica (App.jsx:899-1005) + sus chips de mes
// (App.jsx:443-451) al estilo Valquirias TLV, y sirve para CUALQUIER mes:
// cerrado (snapshot congelado) o en curso (preliminar).
//
// TODO lo que se pinta sale del motor (data/derivar.js → src/lib/calculos.js):
//   - derivarBoletinMes           → nota final, ventas, indicadores, ranking, frase
//   - derivarComparativoMesAnterior → "↑ +0.15 vs mes anterior" (cruza cambio de año)
//   - derivarPosicionRanking      → "#X de N" (por ciudad; el global queda en posicionGeneral)
//   - derivarFraseMotivacionalNota → frase por nota/posición (textos literales de la clásica)
//   - derivarTotalAñoDeVendedora  → la lista de meses para los chips
// Cero fórmulas reimplementadas aquí: V1/V2 y snapshots se respetan solos.

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../firebase.js";
import { useDatos } from "../data/DatosContext.jsx";
import {
  derivarBoletinMes,
  derivarTotalAñoDeVendedora,
} from "../data/derivar.js";
import { fmtN, colorN, bgN } from "../../lib/calculos.js";
import { formatoPesos, hoyColombia } from "../lib/helpers.js";

// Misma resolución que usan TabMiAno / DetalleTrimestre: ?simular=<id> → email
// de la sesión. Si no resuelve, el componente cae al empty state honesto.
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

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
const MES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export default function BoletinMes({
  vendedora: vendedoraProp = null,
  año: añoProp,
  mes: mesProp,
  onVolver,
}) {
  const datos = useDatos();
  const vendedora = useVendedoraActual(datos, vendedoraProp);
  const { año: hoyAño, mes: hoyMes } = hoyColombia();

  // Mes visible: arranca en el que pidieron y los chips lo mueven sin salir.
  const [sel, setSel] = useState(() => ({
    año: Number(añoProp) || hoyAño,
    mes: Number(mesProp) || hoyMes,
  }));

  // Si el padre cambia de mes (p.ej. otro click en Mi Año), mandar el prop.
  useEffect(() => {
    setSel({ año: Number(añoProp) || hoyAño, mes: Number(mesProp) || hoyMes });
  }, [añoProp, mesProp, hoyAño, hoyMes]);

  // Scroll al top al abrir y al cambiar de mes — que no abra mostrando el final.
  useEffect(() => { window.scrollTo(0, 0); }, [sel.año, sel.mes]);

  const b = useMemo(
    () => (vendedora ? derivarBoletinMes(datos, vendedora, sel.año, sel.mes) : null),
    [datos, vendedora, sel.año, sel.mes]
  );

  // Chips de mes: derivarTotalAñoDeVendedora().meses ya viene con año/mes/nombre/
  // ventas/comision/nota/cerrado. Sólo se muestran los meses que ya pasaron.
  const mesesAño = useMemo(() => {
    if (!vendedora) return [];
    const lista = derivarTotalAñoDeVendedora(datos, vendedora, sel.año).meses || [];
    return lista.filter(m => !(sel.año === hoyAño && m.mes > hoyMes));
  }, [datos, vendedora, sel.año, hoyAño, hoyMes]);

  if (!vendedora || !b) {
    return (
      <>
        <Cabecera onVolver={onVolver} titulo="📊 Boletín del mes" />
        <div className="v-card" style={{ textAlign: "center", padding: "26px 14px" }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>📭</div>
          <div style={{ fontSize: 13, color: "#64748b", fontWeight: 700, lineHeight: 1.55 }}>
            No se pudo identificar a la vendedora. Cierra sesión y vuelve a entrar con tu
            correo y tu contraseña.
          </div>
        </div>
      </>
    );
  }

  const enCurso = sel.año === hoyAño && sel.mes === hoyMes;
  const nota = b.notaFinal;
  const comp = b.comparativo;

  return (
    <>
      <Cabecera onVolver={onVolver} titulo={`📊 ${cap(b.nombreMes)} ${b.año}`} />

      {/* ---- Chips de mes: cualquier mes del año es abrible ---- */}
      {mesesAño.length > 1 && (
        <div style={chipsWrap}>
          {mesesAño.map((m) => {
            const activo = m.año === sel.año && m.mes === sel.mes;
            return (
              <button
                key={`${m.año}_${m.mes}`}
                onClick={() => setSel({ año: m.año, mes: m.mes })}
                style={{
                  ...chipMes,
                  ...(activo ? chipMesActivo : null),
                  opacity: m.nota === null && !m.cerrado && !activo ? 0.55 : 1,
                }}
              >
                <span>{MES_CORTO[m.mes - 1]}</span>
                <span style={{ ...chipNota, color: activo ? "#fff" : colorN(m.nota ?? null) }}>
                  {typeof m.nota === "number" ? m.nota.toFixed(2) : "—"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ---- HERO: nota final del mes ---- */}
      <div style={hero}>
        <div style={heroLabel}>
          {enCurso ? "Nota preliminar" : "Nota final"} · {cap(b.nombreMes)} {b.año}
        </div>
        <div style={heroValor}>{nota === null ? "—" : fmtN(nota)}</div>
        <div style={heroDesc}>
          De 5.00 · {b.pesoComportamiento}% comportamiento + {b.pesoVentas}% ventas
        </div>

        {/* Comparativo con el mes anterior (derivarComparativoMesAnterior) */}
        {comp && (
          <div style={{ ...heroChip, marginTop: 10, background: comp.sube ? "rgba(16,185,129,0.28)" : "rgba(239,68,68,0.28)" }}>
            {comp.texto} <span style={{ opacity: 0.85, fontWeight: 700 }}>({cap(comp.nombreMesPrevio)} {fmtN(comp.notaPrevia)})</span>
          </div>
        )}

        <div style={{ marginTop: 10, display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
          <span style={heroChip}>{b.cerrado ? "🔒 Mes cerrado" : "🔄 En curso"}</span>
          <span style={heroChip}>
            {b.diasTrabajados} {b.diasTrabajados === 1 ? "día trabajado" : "días trabajados"}
          </span>
          {b.bono > 0 && <span style={heroChip}>🎁 Bono ventas +{b.bono.toFixed(1)}</span>}
        </div>
      </div>

      {!b.hayDatos ? (
        <div className="v-card" style={{ textAlign: "center", padding: "24px 14px" }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>📭</div>
          <div style={{ fontSize: 13, color: "#64748b", fontWeight: 700, lineHeight: 1.55 }}>
            {cap(b.nombreMes)} {b.año} todavía no tiene nota. Se calcula con los días que anota
            Carolina y con las ventas cargadas del mes.
          </div>
        </div>
      ) : (
        <>
          {/* ---- Posición en el ranking (derivarPosicionRanking) ---- */}
          {b.posicion !== null && (
            <div className="v-card" style={{ background: bgN(nota), display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 900, color: "#475569" }}>Posición en el ranking</div>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginTop: 2 }}>
                  {vendedora.ciudad === "BOG" ? "Bogotá" : "Medellín"} · {cap(b.nombreMes)}
                </div>
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: colorN(nota), lineHeight: 1 }}>
                #{b.posicion}
                <span style={{ fontSize: 12, color: "#475569", fontWeight: 700 }}> de {b.total}</span>
              </div>
            </div>
          )}

          {/* ---- Frase motivacional (derivarFraseMotivacionalNota) ---- */}
          <div style={fraseBox}>{b.frase}</div>

          {/* ---- Ventas del mes vs meta ---- */}
          <div className="v-card">
            <div className="v-card-title">
              <span>💰 Ventas del mes</span>
              <span className="v-card-title-cierra">peso {b.pesoVentas}%</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              <div style={cajaDato}>
                <div style={cajaLabel}>Meta</div>
                <div style={cajaValor}>{b.meta === null ? "—" : formatoPesos(b.meta)}</div>
              </div>
              <div style={cajaDato}>
                <div style={cajaLabel}>Vendido</div>
                <div style={{ ...cajaValor, color: (b.pctMeta || 0) >= 100 ? "#047857" : "#1e1b4b" }}>
                  {b.ventas === null ? "—" : formatoPesos(b.ventas)}
                </div>
              </div>
            </div>
            <div style={barTrack}>
              <div
                style={{
                  ...barFill,
                  width: `${Math.max(0, Math.min(100, b.pctMeta || 0))}%`,
                  background: (b.pctMeta || 0) >= 100 ? "#10b981" : (b.pctMeta || 0) >= 70 ? "#f59e0b" : "#f97316",
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
              <div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>
                {b.pctMeta === null ? "Sin meta cargada" : `${b.pctMeta}% de la meta ${(b.pctMeta >= 100 ? "✅" : "")}`}
              </div>
              <div style={{ fontSize: 15, fontWeight: 900, color: colorN(b.notaVentas) }}>
                {b.notaVentas === null ? "—" : fmtN(b.notaVentas)}
              </div>
            </div>
          </div>

          {/* ---- Desglose por indicador ---- */}
          <div className="v-card">
            <div className="v-card-title">
              <span>📋 Comportamiento</span>
              <span className="v-card-title-cierra">
                peso {b.pesoComportamiento}% · nota {b.notaComportamiento === null ? "—" : fmtN(b.notaComportamiento)}
              </span>
            </div>

            {(b.indicadores || []).map((ind) => {
              const tiene = ind.nota !== null && ind.nota !== undefined;
              const pct = tiene ? Math.max(0, Math.min(100, (ind.nota / 5) * 100)) : 0;
              return (
                <div key={ind.id} className={("v-ind-row " + (tiene ? (ind.estado || "good") : "")).trim()}>
                  <div className="ico">{ind.emoji || "•"}</div>
                  <div className="info">
                    <div className="nom">{ind.nombre}</div>
                    <div className="det">{ind.detalle || (tiene ? "" : "Sin datos este mes")}</div>
                    <div style={barTrackMini}>
                      <div
                        style={{
                          ...barFill,
                          width: `${pct}%`,
                          background: tiene ? (ind.color || "#a855f7") : "#cbd5e1",
                        }}
                      />
                    </div>
                  </div>
                  <div className="der">
                    <div className={"nota" + (ind.estado === "warn" ? " warn" : "")}>
                      {tiene ? fmtN(ind.nota) : "—"}
                    </div>
                    <div className="peso">peso {ind.peso}%</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ---- Días ---- */}
          <div className="v-card">
            <div className="v-card-title">📅 Días del mes</div>
            <div className="v-mes-row">
              <div>
                <div className="v-mes-nombre">Días evaluados</div>
                <div className="v-mes-peso">cuentan para la nota</div>
              </div>
              <div className="v-mes-row-nota completo">{b.diasTrabajados}</div>
            </div>
            <div className="v-mes-row">
              <div>
                <div className="v-mes-nombre">Días registrados</div>
                <div className="v-mes-peso">anotados por Carolina</div>
              </div>
              <div className="v-mes-row-nota progreso">{b.diasRegistrados}</div>
            </div>
          </div>
        </>
      )}

      <div style={pieNota}>
        {b.cerrado
          ? `Este boletín es definitivo: ${cap(b.nombreMes)} ${b.año} está cerrado y su nota quedó congelada.`
          : "Este boletín es preliminar: cambia con cada día que se registra y cuando se cargan las ventas."}
      </div>
    </>
  );
}

function Cabecera({ onVolver, titulo }) {
  return (
    <div className="v-header-detalle">
      <button className="v-back-btn" onClick={onVolver}>‹ Volver</button>
      <div className="v-header-title">{titulo}</div>
      <div style={{ width: 60 }} />
    </div>
  );
}

/* ---------------- estilos locales ---------------- */

const chipsWrap = {
  display: "flex",
  gap: 6,
  overflowX: "auto",
  paddingBottom: 8,
  marginBottom: 4,
  WebkitOverflowScrolling: "touch",
};

const chipMes = {
  flex: "0 0 auto",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 2,
  minWidth: 54,
  padding: "7px 10px",
  borderRadius: 12,
  border: "1px solid rgba(168, 85, 247, 0.18)",
  background: "linear-gradient(135deg, #faf5ff, #fdf4ff)",
  color: "#5b21b6",
  fontFamily: "inherit",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
};

const chipMesActivo = {
  background: "linear-gradient(135deg, #a855f7, #7c3aed)",
  color: "#fff",
  border: "1px solid #7c3aed",
  boxShadow: "0 4px 12px rgba(124, 58, 237, 0.3)",
};

const chipNota = { fontSize: 11, fontWeight: 800 };

const hero = {
  background: "linear-gradient(135deg, #f59e0b 0%, #ec4899 55%, #a855f7 100%)",
  color: "#fff",
  padding: "22px 20px",
  borderRadius: 20,
  marginBottom: 10,
  boxShadow: "0 15px 35px rgba(236, 72, 153, 0.32)",
  textAlign: "center",
  position: "relative",
  overflow: "hidden",
};

const heroLabel = {
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: 1.6,
  opacity: 0.95,
  marginBottom: 4,
};

const heroValor = {
  fontSize: 56,
  fontWeight: 900,
  lineHeight: 1,
  letterSpacing: -2,
  margin: "4px 0 8px",
  textShadow: "0 2px 8px rgba(0,0,0,0.15)",
};

const heroDesc = { fontSize: 13, opacity: 0.95, fontWeight: 600 };

const heroChip = {
  display: "inline-block",
  background: "rgba(255,255,255,0.22)",
  border: "1px solid rgba(255,255,255,0.35)",
  borderRadius: 20,
  padding: "3px 10px",
  fontSize: 11,
  fontWeight: 800,
};

const fraseBox = {
  background: "linear-gradient(135deg, #fffbeb, #fff)",
  border: "1.5px dashed #fbbf24",
  borderRadius: 14,
  padding: "12px 14px",
  marginBottom: 8,
  fontSize: 13.5,
  fontWeight: 800,
  color: "#92400e",
  lineHeight: 1.5,
};

const cajaDato = {
  background: "rgba(168, 85, 247, 0.05)",
  border: "1px solid rgba(168, 85, 247, 0.12)",
  borderRadius: 10,
  padding: "8px 10px",
};

const cajaLabel = {
  fontSize: 10,
  color: "#64748b",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 0.6,
};

const cajaValor = { fontSize: 15, fontWeight: 900, color: "#1e1b4b", marginTop: 2 };

const barTrack = {
  height: 8,
  borderRadius: 4,
  background: "rgba(148,163,184,0.22)",
  overflow: "hidden",
};

const barTrackMini = { ...barTrack, height: 5, borderRadius: 3, marginTop: 6 };

const barFill = { height: "100%", borderRadius: 4 };

const pieNota = {
  fontSize: 11,
  color: "#94a3b8",
  fontWeight: 700,
  lineHeight: 1.5,
  padding: "8px 4px 0",
};
