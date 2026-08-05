// Tab HOY — pantalla principal. Se abre 3-5 veces al día entre clientes.
// Responde en 2 segundos "cómo voy AHORA".

import { formatoPesos, formatoK, primerNombre } from "../lib/helpers.js";
import CardSemanaCerrada from "../common/CardSemanaCerrada.jsx";

export default function TabHoy({
  vendedora,
  ciudad,
  rol,
  hoy,          // { ventasDia, efectivoDia, tickets, fecha }
  foco,         // string
  focoTipo,     // "normal" | "piso"
  semana,       // { efectivo, meta: 2_500_000, gano50k, faltaExtra, top3 }
  mes,          // { ventas, dia, diasMes, tramo, ganado, siguienteTramo, faltaSiguiente, nota, pctMeta, pisoBog: false }
  rankingMes,   // array de {n, nombre, valor, gap, esYo, medal}
  trimestre,    // { nota, posicion, premio }
  comportamiento, // { estado: 'ok'|'warn', resenas }
  semanaCerrada,  // {fechaLabel, extra, ganadoras50k} — se muestra los lunes
  onCerrarSemanaCerrada,
  onDetalleTrim,
  onDetalleComp,
}) {
  const esPrePiso = ciudad === "MED" && mes?.pctMeta < 100 && mes?.ventas < 15_000_000;

  // ---- null vs 0 -----------------------------------------------------------
  // El motor devuelve `null` cuando el dato NO existe y un número cuando sí.
  // Un 0 REAL es información válida ("no ha vendido hoy") y debe pintarse.
  // Sólo `null` (o el flag `disponible:false`) dispara el mensaje de pendiente.
  const hoyDisponible =
    hoy?.disponible ??
    (hoy?.ventasDia != null || hoy?.efectivoDia != null || hoy?.tickets != null);

  const semanaDisponible = semana?.disponible ?? (semana?.efectivo != null);
  const metaSemana = semana?.meta || 2_500_000;
  const semanaPct = semanaDisponible
    ? Math.min(100, ((semana.efectivo || 0) / metaSemana) * 100)
    : 0;

  // El chip de comportamiento ya no es placeholder si el motor trae indicadores.
  const compIndicadores = comportamiento?.indicadores?.length || 0;
  const compNota = compIndicadores > 0 ? comportamiento?.notaTotal ?? null : null;

  return (
    <>
      {semanaCerrada && (
        <CardSemanaCerrada semanaCerrada={semanaCerrada} onCerrar={onCerrarSemanaCerrada} />
      )}

      <div className="v-hoy">
        <div className="v-hoy-titulo">📆 {hoy?.fecha || "Hoy"}</div>
        {/* null = dato ausente (derivar.js no inventa ceros) · 0 = cero real, se pinta */}
        {!hoyDisponible ? (
          <div className="v-hoy-dato">Ventas del día aún no disponibles — próximamente</div>
        ) : (
          <>
            <div className="v-hoy-dato">
              {hoy.ventasDia != null
                ? `${formatoPesos(hoy.ventasDia)} vendidos`
                : "Ventas del día aún no disponibles"}
              {hoy.tickets != null && ` · ${hoy.tickets} ${hoy.tickets === 1 ? "ticket" : "tickets"}`}
            </div>
            {hoy.efectivoDia != null && (
              <div className="v-hoy-sub">💵 Efectivo del día: {formatoPesos(hoy.efectivoDia)}</div>
            )}
          </>
        )}
      </div>

      <div className={"v-foco " + (focoTipo === "piso" ? "piso" : "")}>
        <div className="v-foco-titulo">🎯 Foco de hoy</div>
        <div className="v-foco-msg">{foco || "Cada venta cuenta 💪"}</div>
      </div>

      <div className="v-card v-semana">
        <div className="v-card-title">
          <span>⚡ Esta semana · efectivo</span>
          <span className="v-card-title-cierra">cierra dom</span>
        </div>
        {!semanaDisponible ? (
          <div className="v-semana-row">
            <span className="v-semana-of-pending">Efectivo de la semana aún no disponible — próximamente</span>
          </div>
        ) : (
          <>
            <div className="v-semana-row">
              <span className="v-semana-num">{formatoPesos(semana.efectivo)}</span>
              {semana?.gano50k ? (
                <span className="v-semana-of-ok">✓ +$50k</span>
              ) : (
                <span className="v-semana-of-pending">
                  {formatoK(Math.max(0, metaSemana - semana.efectivo))} para +$50k
                </span>
              )}
            </div>
            <div className="v-semana-bar">
              <div
                className={"v-semana-bar-fill" + (semana?.gano50k ? "" : " pending")}
                style={{ width: `${semanaPct}%` }}
              />
            </div>
          </>
        )}

        {semana?.gano50k && semana?.top3?.length > 0 && (
          <>
            <div className="v-mini-rank-title">🏆 Peleando los $50k EXTRA</div>
            {semana.top3.map((v, i) => (
              <div key={i} className={"v-mini-rank-row " + (v.esYo ? "tu" : "")}>
                <span>
                  <span style={{ display: "inline-block", width: 18, fontWeight: 900 }}>{v.n}.</span>
                  <span style={{ paddingLeft: 4 }}>{v.esYo ? "TÚ" : primerNombre(v.nombre)}</span>
                </span>
                <span>
                  <span className="valor">{formatoK(v.valor)}</span>
                  {v.gap && !v.esYo && <span className="delta">{v.gap}</span>}
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      <div className={"v-card v-mes" + (esPrePiso ? " pre-piso" : "")}>
        <div className="v-card-title">
          <span>📅 Este mes</span>
          <span className="v-card-title-cierra">día {mes?.dia || 1} de {mes?.diasMes || 30}</span>
        </div>
        <div className="v-mes-header">
          <span className="v-mes-num">{formatoPesos(mes?.ventas || 0)}</span>
          <span className="v-mes-dia">vendidos</span>
        </div>

        {esPrePiso ? (
          <>
            <div className="v-pre-piso-note">
              💙 <strong>Piso Medellín: $15M</strong> — vas al{" "}
              <span className="highlight">{Math.round(((mes?.ventas || 0) / 15_000_000) * 100)}%</span>
              <div style={{ marginTop: 4 }}>Cuando pases el piso, entras a META 1 (1%)</div>
            </div>
            <div className="v-mes-siguiente" style={{ marginTop: 8 }}>
              🚀 Con <span className="plus">{formatoK(Math.max(0, 15_000_000 - (mes?.ventas || 0)))} más</span> arrancas a ganar premio ventas
            </div>
          </>
        ) : (
          <>
            {mes?.tramo && (
              <div className="v-mes-linea-premio">
                <span className="tramo">Vas en {mes.tramo}</span>
                {mes.ganado > 0 && <> · llevas <span className="ganado">{formatoPesos(mes.ganado)}</span></>}
              </div>
            )}
            {mes?.siguienteTramo && (
              <div className="v-mes-siguiente">
                🚀 Con <span className="plus">{formatoK(mes.faltaSiguiente)} más</span> pasas a{" "}
                <strong>{mes.siguienteTramo}</strong>
              </div>
            )}
          </>
        )}

        <div className="v-mes-nota-line">
          <span>⭐ Aporte a tu nota: {mes?.pctMeta || 0}% de meta</span>
          <span className={"v-mes-nota-badge " + notaClase(mes?.nota)}>
            {mes?.nota != null ? mes.nota.toFixed(2) : "—"}
          </span>
        </div>
      </div>

      <div className="v-card v-ranking-mes">
        <div className="v-card-title">🏅 Ranking del mes · {ciudad === "BOG" ? "Bogotá" : "Medellín"}</div>
        {(rankingMes || []).map((r, i) => (
          <div key={i} className={"v-rank-full " + (r.esYo ? "tu" : "")}>
            <span>
              <span className={"n" + (r.n === 1 ? " top" : "")}>{r.n}.</span>
              <span style={{ paddingLeft: 6 }}>{r.esYo ? `TÚ (${primerNombre(vendedora?.nombre)})` : primerNombre(r.nombre)}</span>
            </span>
            <span>
              <span className="val">{formatoK(r.valor)}</span>
              {r.medal && <span className="medalla">{r.medal}</span>}
              {r.gap && !r.esYo && <span className="gap">{r.gap}</span>}
            </span>
          </div>
        ))}
      </div>

      {trimestre && (
        <button className="v-chip-clickable trim" onClick={onDetalleTrim} style={{ border: "none", width: "100%" }}>
          <div>💎 Trimestre {trimestre.q || "Q3"}: <strong>{trimestre.nota?.toFixed(2)}</strong>
            {trimestre.posicion && <> · #{trimestre.posicion}</>}
            {trimestre.premio && <> · <span style={{ color: "#ea580c" }}>{trimestre.premio}</span></>}
          </div>
          <div className="arrow">›</div>
        </button>
      )}
      {comportamiento && (
        <button className="v-chip-clickable comp" onClick={onDetalleComp} style={{ border: "none", width: "100%" }}>
          <div>
            📋 Comportamiento:{" "}
            {compNota != null ? (
              <>
                <strong>{compNota.toFixed(2)}</strong>
                {comportamiento.estado === "warn" && " ⚠️"}
                {comportamiento.aporteNota != null && (
                  <> · aporta {comportamiento.aporteNota.toFixed(2)} a tu nota</>
                )}
              </>
            ) : (
              comportamiento.estado === "warn" ? "✅ ⚠️" : "✅ ✅"
            )}
            {comportamiento.resenas != null && <> · {comportamiento.resenas.toFixed(1)}⭐</>}
          </div>
          <div className="arrow">›</div>
        </button>
      )}
    </>
  );
}

function notaClase(n) {
  if (!n) return "amarillo";
  if (n >= 4.5) return "";
  if (n >= 3.5) return "amarillo";
  return "naranja";
}
