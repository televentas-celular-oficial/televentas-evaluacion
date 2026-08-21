// Admin > Trimestre (ranking trimestral + premios)
// ============================================================================
// Port de `PantallaTrimestre` de la app clásica (src/App.jsx:1373-1624) al
// estilo Valquirias TLV. Es de las pantallas que Luis más usa: NO se recorta
// nada. Todo lo de la clásica está aquí:
//
//   1. Chips Q1/Q2/Q3/Q4 (+ selector de año, nuevo)
//   2. Filtro de ciudad TODAS / MED / BOG
//   3. Bloque de PREMIOS agrupado por vendedora, con las razones de cada
//      premio y el "Total a entregar: $X"   ← lo más importante de la pantalla
//   4. Ranking trimestral con la nota de cada mes y su peso ×20/30/50%
//   5. Lista "Sin datos aún"
//
// NO reimplementa cálculos: la nota trimestral sale de `calcTrimestre`
// (lib/calculos.js) y los premios de `calcPremios` (lib/calculos.js). Los montos
// ($1M base / $1M extra) y el reconocimiento sorpresa se leen de Admin > Config
// Premios.
//
// MED y BOG son dos empresas independientes: `calcPremios` ya las separa, y
// como el ranking se filtra por ciudad antes de entrar, nada se mezcla.
//
// ----------------------------------------------------------------------------
// QUIÉN APARECE — REGLA DEL DUEÑO (18-ago-2026)
// ----------------------------------------------------------------------------
// El ranking trimestral SOLO incluye a quien:
//   · está ACTIVA en systemlap (R1),
//   · ingresó antes o el mismo día en que arrancó el trimestre (R4), y
//   · tiene datos de los meses del trimestre que YA cerraron (R3).
// Quien no cumple NO APARECE: ni en la lista, ni en una sección aparte, ni en
// gris. Por eso ya no existe el bloque "Solo ranking mensual" que había aquí —
// listaba justamente a quien el dueño dijo que "ni debe aparecer".
//
// ----------------------------------------------------------------------------
// UN SOLO FILTRO (esta pantalla y la de la vendedora nombran la MISMA ganadora)
// ----------------------------------------------------------------------------
// El roster sale de `derivarRankingTrimestreCiudad` → `participantes()`
// (lib/calculos.js). Es literalmente la misma función que alimenta la pantalla
// de la vendedora: no hay un segundo filtro escrito aquí, así que las dos
// pantallas no pueden diferir.
//
// Y hay DOS rosters distintos, confundirlos cuesta plata:
//   · roster de CÁLCULO  → `datos.vendedoras` completo (con eventuales e
//     inactivas). Es el que se le pasa a `calcTrimestre` para que a cada una se
//     le pueda reconstruir la ciudad y por tanto la meta de los meses que
//     trabajó. Sin él, una inactiva quedaría sin ciudad → meta null.
//   · roster de RANKING  → sólo las que PARTICIPAN (arriba). Es también el
//     universo de premios: `calcPremios` no tiene que descartar a nadie.
//
// ⚠️ TRIMESTRE CERRADO: `participantes()` usa el roster CONGELADO de los
// snapshots y `calcPremios` recibe `congelado: true`. Desactivar hoy a alguien
// NO puede mover la ganadora ni los puestos de un trimestre que ya cerró.
// ============================================================================

import { useState, useMemo } from "react";
import { useDatos } from "../data/DatosContext.jsx";
import { derivarRankingTrimestreCiudad, esTrimestreCerrado } from "../data/derivar.js";
import {
  calcPremios,
  calcTrimestre,
  mesesTrimestre,
  trimestreActual,
  fmtN,
  colorN,
  bgN,
} from "../../lib/calculos.js";
import { MES_NAMES, PESOS_TRIMESTRE } from "../../lib/constantes.js";
import { formatoPesos, hoyColombia } from "../lib/helpers.js";

const CIUDAD_COLOR = { MED: "#10b981", BOG: "#f59e0b" };
const CIUDAD_NOMBRE = { MED: "Medellín", BOG: "Bogotá" };

const FILTROS = [
  { val: "TODAS", lab: "🌎 Todas", col: "#7c3aed" },
  { val: "MED", lab: "🟢 Medellín", col: CIUDAD_COLOR.MED },
  { val: "BOG", lab: "🟡 Bogotá", col: CIUDAD_COLOR.BOG },
];

const UNIDADES = ["", "Un", "Dos", "Tres", "Cuatro", "Cinco", "Seis", "Siete", "Ocho", "Nueve", "Diez"];

// "Un millón de pesos" / "Dos millones de pesos" — sólo si el total es
// millones exactos (los montos son configurables y pueden no serlo).
function enPalabras(total) {
  if (!total || total % 1_000_000 !== 0) return null;
  const m = total / 1_000_000;
  if (m > 10) return null;
  return m === 1 ? "Un millón de pesos" : `${UNIDADES[m]} millones de pesos`;
}

function BadgeCiudad({ ciudad }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 900, letterSpacing: 0.5, textTransform: "uppercase",
      padding: "1px 6px", borderRadius: 5, flexShrink: 0,
      background: ciudad === "MED" ? "#ecfdf5" : "#fffbeb",
      color: ciudad === "MED" ? "#047857" : "#92400e",
      border: `1px solid ${CIUDAD_COLOR[ciudad]}40`,
    }}>{ciudad === "MED" ? "🟢 MED" : "🟡 BOG"}</span>
  );
}

function NotaBadge({ nota }) {
  return (
    <div style={{
      minWidth: 52, textAlign: "center", padding: "6px 8px", borderRadius: 12,
      background: bgN(nota), color: colorN(nota), fontWeight: 900, fontSize: 17,
      lineHeight: 1, flexShrink: 0,
    }}>{fmtN(nota)}</div>
  );
}

export default function TrimestreAdmin({ onVolver }) {
  const datos = useDatos();
  const hoy = hoyColombia();
  const qActual = trimestreActual();

  const [año, setAño] = useState(hoy.año);
  const [q, setQ] = useState(qActual);
  const [filtroCiudad, setFiltroCiudad] = useState("TODAS");

  const esAñoActual = año === hoy.año;
  const meses = mesesTrimestre(q);

  // Config de premios del trimestre (Admin > Config Premios)
  const cfg = datos.config?.premiosTrim?.[`${año}_Q${q}`] || {};
  const montoBase = Number(cfg.montoBase ?? 1_000_000);
  const montoExtra = Number(cfg.montoExtra ?? 1_000_000);

  // ¿El trimestre ya cerró (los 3 meses con snapshot)? Se lo pasamos a
  // `calcPremios` para que NO le quite el premio de un trimestre pasado a quien
  // salió de la operación después del cierre.
  const congelado = useMemo(() => esTrimestreCerrado(datos, año, q), [datos, año, q]);

  // ---------------------------------------------------------------------
  // ROSTER DEL TRIMESTRE — exactamente el que ve la vendedora
  // ---------------------------------------------------------------------
  // `derivarRankingTrimestreCiudad` → `participantes()`: ya aplicó R1+R3+R4 y
  // resolvió roster congelado (trimestre cerrado) vs vivo (en curso). Aquí sólo
  // se usa para saber QUIÉNES son; las notas se calculan abajo con el motor.
  const rosterTrim = useMemo(() => {
    const ciudades = filtroCiudad === "TODAS" ? ["MED", "BOG"] : [filtroCiudad];
    const fichas = new Map((datos.vendedoras || []).map(v => [String(v.id), v]));
    const vistos = new Set();
    const out = [];
    for (const c of ciudades) {
      // `{ id: null, ciudad }` = sonda: no es nadie, sólo fija la ciudad.
      const r = derivarRankingTrimestreCiudad(datos, { id: null, ciudad: c }, año, q);
      for (const f of [...(r.filas || []), ...(r.sinNota || [])]) {
        const k = String(f.id);
        if (vistos.has(k)) continue;
        vistos.add(k);
        // La ficha manda (trae eventual / fechaIngreso). Si no está en el
        // roster de hoy, se usa lo que quedó en el snapshot — nunca se inventa.
        out.push(fichas.get(k) || { id: f.id, nombre: f.nombre, ciudad: f.ciudad });
      }
    }
    return out;
  }, [datos, año, q, filtroCiudad]);

  // Nota trimestral + meses con peso — todo del motor (lib/calculos.js).
  // El roster que se le pasa a `calcTrimestre` es el de CÁLCULO: `datos.vendedoras`
  // completo, eventuales e inactivas incluidas, para que la ciudad (y con ella la
  // meta del mes) se pueda resolver siempre.
  const filas = useMemo(() => {
    const registros = datos.registros || {};
    const metas = datos.metas || {};
    const snapshots = datos.snapshots || {};
    const rosterCalculo = datos.vendedoras || [];
    const mesesQ = mesesTrimestre(q);
    return rosterTrim.map(v => {
      const t = calcTrimestre(registros, metas, v.id, año, q, snapshots, rosterCalculo);
      // Ventas del trimestre: se suman de los meses ya calculados (el mes cerrado
      // aporta el valor del snapshot, no el vivo). Es el mismo número con el que
      // desempata la pantalla de la vendedora.
      const realTrim = (t.datosMes || []).reduce((s, d) => s + (d?.real || 0), 0);
      return {
        id: v.id,
        nombre: v.nombre,
        ciudad: v.ciudad,
        activa: v.activa !== false,
        eventual: v.eventual === true,
        fechaIngreso: v.fechaIngreso || null,
        notaTrim: t.notaTrim,
        mesesTrim: mesesQ.map((m, i) => ({
          mes: m, nota: t.notasMes[i], peso: Math.round(PESOS_TRIMESTRE[i] * 100),
        })),
        mesesConDatos: t.mesesConDatos,
        completo: t.completo,
        completoALaFecha: t.completoALaFecha,
        realTrim,
      };
    });
  }, [datos, año, q, rosterTrim]);

  // ---------------------------------------------------------------------
  // RANKING — todas las que llegan aquí YA participan
  // ---------------------------------------------------------------------
  // El filtro lo hizo `participantes()` arriba. Aquí no hay ningún segundo
  // criterio: si estuviera duplicado, esta pantalla y la de la vendedora
  // podrían nombrar ganadoras distintas — que fue exactamente lo que pasó.
  const rankingTrim = filas
    .filter(v => v.notaTrim !== null)
    .sort((a, b) => (b.notaTrim - a.notaTrim) || ((b.realTrim ?? 0) - (a.realTrim ?? 0)))
    .map((v, i) => ({ ...v, rt: i + 1 }));

  // Participa, pero todavía no tiene nota (ningún mes del trimestre cerró).
  const sinDatos = filas.filter(v => v.notaTrim === null);

  // Premios — calcPremios separa MED de BOG; como el ranking ya viene filtrado
  // por ciudad, la ciudad excluida simplemente sale vacía. `{ año, q }` le
  // permite resolver `entroTarde`; `congelado` protege un trimestre ya cerrado.
  const premiosBrutos = calcPremios(rankingTrim, { año, q, congelado });
  const conBonoTodos = ["med", "bog"].flatMap(k => premiosBrutos[k].conBono);
  const extrasTodos = ["med", "bog"].map(k => premiosBrutos[k].extraCiudad).filter(Boolean);
  const idsConBono = new Set(conBonoTodos.map(v => v.id));
  const idsExtra = new Set(extrasTodos.map(v => v.id));

  // Ganadoras agrupadas por vendedora, con las razones de cada premio
  const ganadoras = [];
  const addRazon = (v, razon, monto, emoji) => {
    let g = ganadoras.find(x => x.id === v.id);
    if (!g) { g = { ...v, razones: [], total: 0 }; ganadoras.push(g); }
    g.razones.push({ razon, monto, emoji });
    g.total += monto;
  };
  conBonoTodos.forEach(v => addRazon(v, "Nota trimestral ≥4.50", montoBase, "⭐"));
  extrasTodos.forEach(v => addRazon(v, `La mejor de ${CIUDAD_NOMBRE[v.ciudad]}`, montoExtra, "🌟"));
  ganadoras.sort((a, b) => (b.total - a.total) || (b.notaTrim - a.notaTrim));
  const totalGeneral = ganadoras.reduce((s, g) => s + g.total, 0);

  // "(final)" vs "(tiempo real)": todas las de la lista participan, así que el
  // premio está definido cuando todas tienen los 3 meses.
  const trimestreFinal = rankingTrim.length > 0 && rankingTrim.every(v => v.completo);

  const años = [hoy.año, hoy.año - 1];
  const qsDisponibles = [1, 2, 3, 4].filter(n => !esAñoActual || n <= qActual);

  const tituloCiudad = filtroCiudad === "TODAS" ? "" : ` · ${CIUDAD_NOMBRE[filtroCiudad]}`;

  return (
    <div className="v-app">
      <div className="v-header-detalle">
        <button className="v-back-btn" onClick={onVolver}>‹ Volver</button>
        <div className="v-header-title">📈 Trimestre{tituloCiudad}</div>
        <div style={{ width: 60 }} />
      </div>

      {/* Filtro de ciudad */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, padding: 6, background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0" }}>
        {FILTROS.map(({ val, lab, col }) => {
          const sel = filtroCiudad === val;
          return (
            <button key={val} onClick={() => setFiltroCiudad(val)}
              style={{
                flex: 1, padding: "8px 4px", borderRadius: 9, border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: 900,
                background: sel ? col : "transparent",
                color: sel ? "#fff" : "#64748b",
              }}>{lab}</button>
          );
        })}
      </div>

      {/* Año + trimestre */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
        {años.map(a => {
          const sel = a === año;
          return (
            <button key={a} onClick={() => { setAño(a); if (a === hoy.año && q > qActual) setQ(qActual); }}
              style={{
                padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 900,
                background: sel ? "#1e1b4b" : "#fff", color: sel ? "#fff" : "#64748b",
                border: "1.5px solid " + (sel ? "transparent" : "#e2e8f0"),
              }}>{a}</button>
          );
        })}
        <div style={{ width: 1, height: 20, background: "#e2e8f0", margin: "0 2px" }} />
        {qsDisponibles.map(n => {
          const sel = q === n;
          return (
            <button key={n} onClick={() => setQ(n)}
              style={{
                padding: "5px 16px", borderRadius: 16, cursor: "pointer", fontSize: 11, fontWeight: 900,
                background: sel ? "linear-gradient(135deg, #7c3aed, #ec4899)" : "#fff",
                color: sel ? "#fff" : "#7c3aed",
                border: "1.5px solid " + (sel ? "transparent" : "#e2e8f0"),
              }}>Q{n}</button>
          );
        })}
      </div>

      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginBottom: 12 }}>
        {meses.map(m => MES_NAMES[m - 1]).join(" · ")} · Pesos: 20% · 30% · 50%
      </div>

      {/* ================= PREMIOS ================= */}
      {ganadoras.length > 0 && (
        <div style={{
          background: "linear-gradient(135deg, #fff7ed, #fff)",
          border: "2px solid #fed7aa", borderRadius: 18, padding: 14, marginBottom: 14,
          boxShadow: "0 8px 24px rgba(234, 88, 12, 0.10)",
        }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 900, color: "#ea580c", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4 }}>
              🏆 Premios {trimestreFinal ? "(final)" : "(tiempo real)"}
            </div>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#9a3412" }}>
              Total a entregar: <span style={{ fontSize: 20 }}>{formatoPesos(totalGeneral)}</span>
            </div>
            {/* El reconocimiento sorpresa (la TV) se retiró el 21-ago-2026: se
                podía escribir pero nunca llegaba a la vendedora. Vuelve en Q4,
                cuando Luis decida dónde se anuncia. */}
          </div>

          {ganadoras.map((g, idx) => {
            const esTop = idx === 0 && g.total >= montoBase + montoExtra;
            const fondoCard = g.total >= montoBase + montoExtra
              ? "linear-gradient(135deg, #fef9c3, #fff)"
              : g.ciudad === "MED"
                ? "linear-gradient(135deg, #ecfdf5, #fff)"
                : "linear-gradient(135deg, #fffbeb, #fff)";
            const bordeCard = esTop
              ? "2px solid #fde047"
              : `1px solid ${g.ciudad === "MED" ? "#6ee7b7" : "#fde68a"}`;
            const palabras = enPalabras(g.total);

            return (
              <div key={g.id} style={{
                background: fondoCard, border: bordeCard, borderRadius: 14,
                padding: "12px 14px", marginBottom: 9,
                boxShadow: esTop ? "0 0 16px rgba(251, 191, 36, 0.40)" : "0 1px 4px rgba(0,0,0,0.05)",
              }}>
                {/* Encabezado: vendedora + total que gana */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
                    background: CIUDAD_COLOR[g.ciudad], color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, fontWeight: 900,
                  }}>{(g.nombre || "?")[0]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 900, fontSize: 14, color: "#1e1b4b" }}>{g.nombre}</div>
                      <BadgeCiudad ciudad={g.ciudad} />
                    </div>
                    <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, marginTop: 2 }}>
                      Nota trimestral: <span style={{ color: colorN(g.notaTrim), fontWeight: 900 }}>{fmtN(g.notaTrim)}</span>
                      {!g.completo && <span style={{ color: "#94a3b8" }}> · {g.mesesConDatos}/3 meses</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 9, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>Gana</div>
                    <div style={{ fontSize: 18, fontWeight: 900, lineHeight: 1.1, color: esTop ? "#854d0e" : "#9a3412" }}>
                      {formatoPesos(g.total)}
                    </div>
                    {palabras && (
                      <div style={{ fontSize: 9, fontWeight: 700, color: "#64748b", marginTop: 2 }}>{palabras}</div>
                    )}
                  </div>
                </div>

                {/* Razones de cada premio */}
                <div style={{ borderTop: `1px dashed ${esTop ? "#fde047" : "#e2e8f0"}`, paddingTop: 8 }}>
                  {g.razones.map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", fontSize: 11, color: "#475569", fontWeight: 700 }}>
                      <span style={{ flexShrink: 0 }}>{r.emoji}</span>
                      <span style={{ flex: 1 }}>{r.razon}</span>
                      <span style={{ fontWeight: 900, color: "#1e1b4b" }}>{formatoPesos(r.monto)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rankingTrim.length > 0 && ganadoras.length === 0 && (
        <div style={{ padding: "12px 14px", background: "rgba(245, 158, 11, 0.10)", borderLeft: "3px solid #f59e0b", borderRadius: 10, fontSize: 11, color: "#92400e", fontWeight: 700, marginBottom: 12, lineHeight: 1.55 }}>
          🏆 Todavía nadie llega a 4.50 en el trimestre — sin premio por ahora.
        </div>
      )}

      {/* ================= RANKING TRIMESTRAL ================= */}
      {rankingTrim.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>
            Ranking trimestral
          </div>
          {rankingTrim.map(v => {
            const esExtra = idsExtra.has(v.id);
            const conBono = idsConBono.has(v.id);
            const colorBorde = esExtra ? "#fbbf24" : conBono ? "#ea580c" : "#cbd5e1";
            const fondo = esExtra
              ? "linear-gradient(90deg, #fef9c3, #fff 40%)"
              : conBono
                ? "linear-gradient(90deg, #ffedd5, #fff 40%)"
                : "#fff";
            return (
              <div key={v.id} style={{
                display: "flex", alignItems: "center", gap: 11,
                padding: "11px 13px", borderRadius: 14, marginBottom: 6,
                background: fondo,
                borderLeft: `5px solid ${colorBorde}`,
                boxShadow: conBono ? `0 2px 8px ${colorBorde}30` : "0 1px 4px rgba(0,0,0,0.05)",
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 900, fontSize: 15,
                  color: v.rt <= 3 ? "#fff" : "#64748b",
                  background:
                    v.rt === 1 ? "linear-gradient(135deg, #fbbf24, #f59e0b)" :
                    v.rt === 2 ? "linear-gradient(135deg, #cbd5e1, #94a3b8)" :
                    v.rt === 3 ? "linear-gradient(135deg, #fb923c, #c2410c)" : "#f1f5f9",
                }}>#{v.rt}</div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 900, fontSize: 13, color: "#1e1b4b" }}>{v.nombre}</div>
                    <BadgeCiudad ciudad={v.ciudad} />
                    {conBono && (
                      <span style={{ fontSize: 10, fontWeight: 900, color: "#9a3412", background: "#ffedd5", padding: "2px 8px", borderRadius: 8 }}>
                        ⭐ ≥4.50 · {formatoPesos(montoBase)}
                      </span>
                    )}
                    {esExtra && (
                      <span style={{ fontSize: 10, fontWeight: 900, color: "#854d0e", background: "#fef9c3", padding: "2px 8px", borderRadius: 8 }}>
                        🌟 +{formatoPesos(montoExtra)} EXTRA
                      </span>
                    )}
                    {!v.completo && (
                      <span style={{ fontSize: 9, fontWeight: 900, color: "#94a3b8", background: "#f1f5f9", padding: "1px 6px", borderRadius: 8 }}>
                        {v.mesesConDatos}/3 meses
                      </span>
                    )}
                  </div>

                  {/* Nota de cada mes con su peso ×20/30/50% */}
                  <div style={{ display: "flex", gap: 5, marginTop: 5, flexWrap: "wrap" }}>
                    {v.mesesTrim.map(m => (
                      <div key={m.mes} style={{ fontSize: 10, color: "#475569", background: "#f8fafc", borderRadius: 6, padding: "2px 6px", fontWeight: 700 }}>
                        {MES_NAMES[m.mes - 1]}: <span style={{ color: m.nota !== null ? colorN(m.nota) : "#94a3b8", fontWeight: 900 }}>{fmtN(m.nota)}</span>
                        <span style={{ color: "#cbd5e1" }}> ×{m.peso}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <NotaBadge nota={v.notaTrim} />
              </div>
            );
          })}
        </>
      )}

      {rankingTrim.length === 0 && sinDatos.length === 0 && (
        <div style={{ padding: "18px 16px", background: "rgba(148, 163, 184, 0.10)", borderRadius: 12, fontSize: 12, color: "#64748b", fontWeight: 700, textAlign: "center" }}>
          Sin vendedoras para este trimestre con el filtro seleccionado.
        </div>
      )}

      {/* ================= SIN DATOS AÚN ================= */}
      {sinDatos.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6 }}>
            Sin datos aún
          </div>
          {sinDatos.map(v => (
            <div key={v.id} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 13px", background: "#fff", borderRadius: 12, marginBottom: 4,
              opacity: 0.55, boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
            }}>
              <div style={{ fontWeight: 900, fontSize: 13, color: "#94a3b8" }}>{v.nombre}</div>
              <BadgeCiudad ciudad={v.ciudad} />
            </div>
          ))}
        </div>
      )}

      {/* Regla de quién entra — sin nombrar a nadie que no participe.
          El bloque "Solo ranking mensual" que había aquí (heredado de
          App.jsx:1608-1621) listaba justamente a quien el dueño dijo que "ni
          debe aparecer". Se eliminó: en su lugar queda esta nota de una línea
          que explica el criterio, no las personas. */}
      <div style={{ marginTop: 14, padding: "10px 13px", background: "rgba(148, 163, 184, 0.10)", borderRadius: 10, fontSize: 10.5, color: "#64748b", fontWeight: 700, lineHeight: 1.55 }}>
        {congelado
          ? "Trimestre cerrado: este ranking es el congelado de sus 3 meses. No cambia aunque hoy se desactive a alguien."
          : "En el trimestre solo compite quien está activa, entró antes o el mismo día en que arrancó el trimestre, y tiene los meses del trimestre que ya cerraron. Quien entró después compite desde el trimestre siguiente."}
      </div>

      <div style={{ marginTop: 12, textAlign: "center", fontSize: 10, color: "#94a3b8", fontWeight: 700 }}>
        📸 Toma pantallazo para el anuncio · calculado el {hoy.iso}
      </div>
    </div>
  );
}
