// Mi trimestre — pantalla de la vendedora (Valkyrias)
//
// Spec: docs/prototipo-3-perfiles.html → vTrimVend()
//
// Todo sale del motor. Este archivo NO calcula notas, ni comisiones, ni pesos:
// - derivarTrimestreEnVivo        → nota en vivo + los 3 meses con su peso/estado
// - derivarIndicadoresTrimestre   → cada indicador mes a mes (promedio PONDERADO)
// - derivarRankingTrimestreCiudad → ranking de SU ciudad (MED y BOG nunca se mezclan)
//
// Reglas que se respetan aquí:
// - Los meses CERRADOS se leen del snapshot tal cual. Esta pantalla sólo pinta.
// - Nunca se le dice si alcanza o no la meta: sólo la DISTANCIA de hoy.
// - Si un dato no existe → "no disponible". Nunca un 0 disfrazado de real.
// - La TV NO se entrega este trimestre (decisión del dueño): sólo la nota chica.

import { useEffect, useMemo } from "react";
import { useDatos } from "../data/DatosContext.jsx";
import {
  derivarTrimestreEnVivo,
  derivarIndicadoresTrimestre,
  derivarRankingTrimestreCiudad,
} from "../data/derivar.js";
import { formatoPesos, hoyColombia } from "../lib/helpers.js";
import { colorN, bgN, fmtN, fechaLarga } from "../../lib/calculos.js";

// Paleta del prototipo (lavanda del trimestre, ámbar de premios, azul del aviso)
const LILA_BG = "#f7f4ff";
const LILA_BORDE = "#ddd3f5";
const LILA_TXT = "#5b2ec4";
const AMBAR_BG = "#fffaf0";
const AMBAR_BORDE = "#f0d49a";
const AMBAR_TXT = "#8a5a08";
const LINEA = "#e2e8f0";
const APOYO = "#475569";
const TENUE = "#94a3b8";
const TINTA = "#0f172a";

const S = {
  volver: {
    background: "none", border: "none", font: "inherit", fontSize: 14, fontWeight: 700,
    color: APOYO, cursor: "pointer", padding: "0 0 12px", display: "flex",
    alignItems: "center", gap: 5,
  },
  titulo: { fontSize: 19, fontWeight: 800, margin: "0 0 12px", color: TINTA },
  subtitulo: { fontSize: 12, color: APOYO, margin: "-6px 0 12px" },
  card: {
    background: "#fff", border: `1px solid ${LINEA}`, borderRadius: 13,
    padding: 16, marginBottom: 10,
  },
  lbl: {
    fontSize: 12, fontWeight: 800, color: "#334155", textTransform: "uppercase",
    letterSpacing: ".7px", marginBottom: 4, display: "block",
  },
  barra: { height: 8, background: "#e6dcfb", borderRadius: 4, overflow: "hidden", marginTop: 12 },
  filaMes: {
    display: "flex", alignItems: "center", gap: 10, padding: "9px 0",
    borderBottom: `1px dashed ${LINEA}`,
  },
  indBtn: {
    display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 2px",
    background: "none", border: "none", borderBottom: `1px dashed ${LINEA}`,
    font: "inherit", cursor: "pointer", textAlign: "left",
  },
  mini: {
    display: "flex", alignItems: "center", gap: 9, padding: "7px 10px",
    borderRadius: 9, marginBottom: 3, fontSize: 12.5,
  },
  miniYo: { background: "#fffbeb", boxShadow: "inset 0 0 0 1.5px #fcd34d" },
  pieCard: {
    fontSize: 12, color: APOYO, fontWeight: 600, marginTop: 9, paddingTop: 9,
    borderTop: `1px dashed ${LINEA}`, lineHeight: 1.55,
  },
};

function badge(nota, extra = {}) {
  const hay = nota !== null && nota !== undefined;
  return {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    minWidth: 46, padding: "3px 10px", borderRadius: 8, fontWeight: 800, fontSize: 14,
    background: hay ? bgN(nota) : "#f1f5f9",
    color: hay ? colorN(nota) : TENUE,
    ...extra,
  };
}

// Sólo estos dos valores son una ciudad. Cualquier otra cosa (null, "", "MEDELLIN",
// un typo del sync) NO es una ciudad y no se traduce a ninguna. Ver el bloque
// CIUDAD en el componente.
const NOMBRE_CIUDAD = { MED: "Medellín", BOG: "Bogotá" };

const capitaliza = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// "julio, agosto y septiembre"
function listaMeses(meses) {
  const n = meses.map(m => (m.nombre || "").toLowerCase()).filter(Boolean);
  if (n.length < 2) return n.join("");
  return `${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}`;
}

// "▲ subiendo · 0.20 más que en julio" — la diferencia exacta, con su mes.
function textoTendencia(ind, nombrePorMes) {
  if (ind.tendencia === null || ind.delta === null) return ind.texto;
  const prev = nombrePorMes[ind.mesPrevio] || "el mes anterior";
  if (ind.tendencia === "igual") return `Igual que en ${prev.toLowerCase()}`;
  const dif = Math.abs(ind.delta).toFixed(2);
  return ind.tendencia === "sube"
    ? `▲ subiendo · ${dif} más que en ${prev.toLowerCase()}`
    : `▼ bajando · ${dif} menos que en ${prev.toLowerCase()}`;
}

function colorTendencia(t) {
  if (t === "sube") return "#059669";
  if (t === "baja") return "#ea580c";
  return APOYO;
}

function Vacio({ onVolver, mensaje }) {
  return (
    <div>
      {onVolver && <button style={S.volver} onClick={onVolver}>‹ Volver</button>}
      <div style={S.titulo}>💎 Mi trimestre</div>
      <div style={{ ...S.card, textAlign: "center", padding: "38px 18px" }}>
        <div style={{ fontSize: 34 }}>💎</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: TINTA, marginTop: 10 }}>
          No disponible todavía
        </div>
        <div style={{ fontSize: 12.5, color: APOYO, marginTop: 7, lineHeight: 1.6 }}>
          {mensaje}
        </div>
      </div>
    </div>
  );
}

export default function MiTrimestre({ vendedora, onVolver, onIndicador, año, q }) {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  const datos = useDatos();
  const hoy = hoyColombia();
  const añoQ = Number(año) || hoy.año;
  const qNum = Number(q) || Math.ceil(hoy.mes / 3);

  const trim = useMemo(
    () => (vendedora ? derivarTrimestreEnVivo(datos, vendedora, añoQ, qNum) : null),
    [datos, vendedora, añoQ, qNum]
  );
  const indTrim = useMemo(
    () => (vendedora ? derivarIndicadoresTrimestre(datos, vendedora, añoQ, qNum) : null),
    [datos, vendedora, añoQ, qNum]
  );
  const rank = useMemo(
    () => (vendedora ? derivarRankingTrimestreCiudad(datos, vendedora, añoQ, qNum) : null),
    [datos, vendedora, añoQ, qNum]
  );

  const premios = datos?.config?.premiosTrim?.[`${añoQ}_Q${qNum}`] || {};
  const montoBase = Number(premios.montoBase) > 0 ? Number(premios.montoBase) : 1_000_000;
  const montoExtra = Number(premios.montoExtra) > 0 ? Number(premios.montoExtra) : 1_000_000;

  if (!vendedora || !trim) {
    return (
      <Vacio
        onVolver={onVolver}
        mensaje="Todavía no podemos identificar tus datos. Cuando la app termine de cargar tu perfil, aquí verás tu nota del trimestre."
      />
    );
  }

  // --------------------------------------------------------------------------
  // CIUDAD — se resuelve o no se resuelve. NO hay ciudad por defecto.
  // --------------------------------------------------------------------------
  // Antes: `trim.ciudad === "BOG" ? "Bogotá" : "Medellín"`. Ese ternario le
  // rotulaba "Medellín" a CUALQUIERA cuya ciudad no se pudiera resolver. Es el
  // mismo fallback que ya se eliminó del núcleo (calculos.js) y de MiMes.jsx;
  // esta era la copia que quedaba, y en la peor pantalla: la del premio
  // trimestral.
  //
  // Y no era sólo una etiqueta equivocada. Con `ciudad` en null, `participantes()`
  // (calculos.js) no filtra nada — `const enCiudad = ciudad ? universo.filter(...)
  // : universo` — así que `derivarRankingTrimestreCiudad` devuelve MED y BOG
  // MEZCLADAS. La pantalla le mostraba entonces una posición, un club de premio,
  // un "te faltan X para pasar a Fulana" y un "vas de primera" calculados contra
  // un ranking que no es el suyo, bajo el título de una ciudad que no es la suya.
  // MED y BOG son dos empresas separadas con premios separados.
  //
  // Sin ciudad tampoco hay meta de ventas (`metaParaCiudad` → null), así que la
  // nota del trimestre en sí queda coja. No se muestra nada calculado: se dice.
  const ciudad = trim.ciudad === "MED" || trim.ciudad === "BOG" ? trim.ciudad : null;

  if (ciudad === null) {
    return (
      <div>
        {onVolver && <button style={S.volver} onClick={onVolver}>‹ Volver</button>}
        <div style={S.titulo}>💎 Mi trimestre</div>
        <div style={{ ...S.card, borderLeft: "4px solid #f59e0b", borderRadius: "0 13px 13px 0" }}>
          <div style={S.lbl}>No podemos mostrarte tu trimestre</div>
          <div style={{ fontSize: 13.5, color: APOYO, fontWeight: 600, lineHeight: 1.6 }}>
            No pudimos determinar tu ciudad, y sin ella no hay forma de mostrarte bien tu
            trimestre: <strong style={{ color: TINTA }}>Medellín y Bogotá compiten por
            separado</strong>, con su propio ranking y su propio premio. Mostrarte el de la
            ciudad equivocada sería mostrarte una carrera que no es la tuya.
          </div>
          <div style={{
            fontSize: 13.5, color: APOYO, fontWeight: 600, lineHeight: 1.6,
            marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${LINEA}`,
          }}>
            Preferimos no mostrarte una posición antes que mostrarte una equivocada.{" "}
            <strong style={{ color: TINTA }}>Escríbele al administrador</strong> para que
            corrija tu ciudad. Apenas quede lista, aquí aparece tu trimestre completo — tu
            nota, tus indicadores y el ranking de tu ciudad.
          </div>
          <div style={{ fontSize: 12, color: TENUE, fontWeight: 600, marginTop: 10 }}>
            Nada se pierde: tus días ya registrados siguen guardados, y tu mes y tu semana
            siguen contando igual que siempre.
          </div>
        </div>
      </div>
    );
  }

  const ciudadLarga = NOMBRE_CIUDAD[ciudad];
  const meta = trim.meta;
  const nota = trim.nota;                       // number | null — en vivo
  const falta = trim.falta;                     // number | null
  const ultimo = trim.meses[trim.meses.length - 1];
  const ultimoNombre = (ultimo?.nombre || "").toLowerCase();
  const nombrePorMes = Object.fromEntries((indTrim?.meses || []).map(m => [m.mes, m.nombre]));

  // ¿Participa en el trimestre? Si no, NO se le muestra el ranking: ella no
  // está en esa tabla (regla del dueño: quien entró con el trimestre arrancado
  // "ni debe aparecer"). Enseñarle una lista donde no figura sería peor que no
  // mostrarla. En su lugar va una explicación clara y sin castigo.
  const participa = trim.compite !== false;
  const motivo = trim.motivoNoCompite;

  return (
    <div>
      {onVolver && <button style={S.volver} onClick={onVolver}>‹ Volver</button>}

      <div style={S.titulo}>💎 Mi trimestre</div>
      <div style={S.subtitulo}>
        {trim.q} · {listaMeses(trim.meses)} · {ciudadLarga}
      </div>

      {/* ── 1. Nota del trimestre EN VIVO ─────────────────────────────────── */}
      <div style={{ ...S.card, background: LILA_BG, borderColor: LILA_BORDE }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...S.lbl, color: LILA_TXT, marginBottom: 2 }}>
              Mi nota del trimestre · en vivo
            </div>
            <div style={{ fontSize: 11.5, color: LILA_TXT, fontWeight: 600, lineHeight: 1.45 }}>
              Se actualiza todos los días
            </div>
          </div>
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            background: "#fff", color: nota === null ? TENUE : LILA_TXT,
            fontSize: 26, fontWeight: 800, minWidth: 80, padding: "9px 15px", borderRadius: 8,
          }}>
            {fmtN(nota)}
          </span>
        </div>

        {nota === null ? (
          <div style={{ fontSize: 12.5, color: LILA_TXT, fontWeight: 600, marginTop: 12, lineHeight: 1.55 }}>
            Tu nota del trimestre <strong>no está disponible</strong> todavía: aún no hay
            días registrados en {listaMeses(trim.meses)}.
          </div>
        ) : (
          <>
            <div style={S.barra}>
              <i style={{
                display: "block", height: "100%", borderRadius: 4,
                width: `${Math.min(100, (nota / meta) * 100)}%`, background: "#7c3aed",
              }} />
            </div>
            <div style={{ fontSize: 12.5, color: LILA_TXT, fontWeight: 600, marginTop: 8, lineHeight: 1.55 }}>
              {falta > 0 ? (
                <>El premio es para quien cierre en <strong>{meta.toFixed(2)}</strong>.
                {" "}Hoy te faltan <strong>{falta.toFixed(2)}</strong>.</>
              ) : (
                <>Hoy vas por encima del <strong>{meta.toFixed(2)}</strong> ✓</>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── 2. Aviso azul — lo más importante de la pantalla ───────────────── */}
      {/* Sin este mensaje la nota en vivo desmotiva: al empezar el mes se ve baja
          porque el mes en curso apenas lleva unos días. */}
      <div style={{
        padding: "11px 13px", borderRadius: 10, fontSize: 12, fontWeight: 700,
        lineHeight: 1.6, marginBottom: 10,
        background: "#eff6ff", color: "#1e40af", borderLeft: "3px solid #3b82f6",
      }}>
        {trim.enCurso ? (
          <>
            📈 <strong>Es normal que al empezar el mes esta nota se vea baja.</strong>{" "}
            {capitaliza(trim.nombreMesEnCurso)} va en el día {trim.dia} de {trim.diasMes} —
            apenas lleva el {trim.pctMes}% del mes. Sube todos los días con tus ventas y tu
            comportamiento. La nota que cuenta es la del último día de {ultimoNombre}.
          </>
        ) : trim.cerradoCompleto ? (
          <>
            📈 Este trimestre ya cerró. Esta es la nota definitiva: la del último día
            de {ultimoNombre}.
          </>
        ) : (
          <>
            📈 <strong>Es normal que esta nota se vea baja mientras el trimestre avanza.</strong>{" "}
            Sube todos los días con tus ventas y tu comportamiento. La nota que cuenta es la
            del último día de {ultimoNombre}.
          </>
        )}
      </div>

      {/* ── 3. Cómo se arma la nota: 3 meses, peso y estado ────────────────── */}
      <div style={S.card}>
        <div style={S.lbl}>Cómo se arma la nota</div>
        {trim.meses.map((m, i) => (
          <div
            key={m.mes}
            style={{ ...S.filaMes, borderBottom: i === trim.meses.length - 1 ? "none" : S.filaMes.borderBottom }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: m.cerrado ? TINTA : APOYO }}>
                {m.nombre}
              </div>
              <div style={{ fontSize: 11.5, color: APOYO, marginTop: 2 }}>
                Pesa {m.pesoPct}% · {m.etiquetaEstado}
              </div>
            </div>
            <span style={badge(m.nota, { fontSize: 14, minWidth: 46 })}>{fmtN(m.nota)}</span>
          </div>
        ))}
        <div style={{ ...S.pieCard, borderTop: `1px dashed ${LINEA}` }}>
          {ultimo?.nombre} pesa el {ultimo?.pesoPct}%
          {ultimo?.estado === "pendiente"
            ? " y todavía no ha empezado. Ahí es donde más se mueve todo."
            : ultimo?.estado === "curso"
              ? ` y va en curso — día ${ultimo.dia} de ${ultimo.diasMes}. Ahí es donde más se mueve todo.`
              : " del trimestre: es el mes que más mueve la nota."}
        </div>
      </div>

      {/* ── 4. Premios ─────────────────────────────────────────────────────── */}
      <div style={{ ...S.card, background: AMBAR_BG, borderColor: AMBAR_BORDE }}>
        <div style={{ ...S.lbl, color: AMBAR_TXT }}>🏆 Premios de este trimestre</div>
        <div style={{ fontSize: 13, color: AMBAR_TXT, fontWeight: 600, lineHeight: 1.7 }}>
          💰 <strong>{formatoPesos(montoBase)}</strong> para cada una que cierre el trimestre
          en {meta.toFixed(2)} o más.<br />
          👑 <strong>{formatoPesos(montoExtra)} extra</strong> a la #1 de {ciudadLarga},
          si al menos dos llegan al {meta.toFixed(2)}.
        </div>
        {/* Si NO participa en el trimestre, se dice aquí mismo, junto a los
            montos — no en letra chica ni escondido. Y con el tono que
            corresponde: es alguien que acaba de entrar a trabajar, no alguien
            que hizo algo mal. Nada de "no clasificaste". */}
        {!participa && (
          <div style={{
            marginTop: 10, padding: "10px 12px", borderRadius: 9,
            background: "#fff", border: `1px solid ${AMBAR_BORDE}`,
            fontSize: 12, color: AMBAR_TXT, fontWeight: 600, lineHeight: 1.6,
          }}>
            {motivo === "entroTarde" ? (
              <>
                👋 <strong>Este trimestre todavía no entra en la disputa — y está
                bien.</strong> Empezaste
                el {trim.fechaIngreso ? fechaLarga(trim.fechaIngreso) : "con el trimestre ya empezado"},
                y el premio trimestral se juega con los tres meses completos desde el
                primer día. Nada de esto es una falta tuya: es simple calendario.
                <br /><br />
                Mientras tanto <strong>sí compites en tu mes y en tu semana</strong>, y
                todo lo que hagas ahora es la base con la que arrancas.
                Desde el próximo trimestre entras en la pelea por el premio, en igualdad
                de condiciones con todas. 💜
              </>
            ) : motivo === "eventual" || motivo === "inactiva" ? (
              <>
                👋 Tu vinculación no está activa para este trimestre, así que no entra
                en la disputa del premio trimestral. Todos tus datos se conservan.
              </>
            ) : (
              <>
                📋 El premio trimestral pide tener registro en <strong>todos los meses
                del trimestre que ya cerraron</strong>. Hoy falta alguno, así que este
                trimestre no entra en el reparto. Tu mes y tu semana siguen contando
                igual que siempre.
              </>
            )}
          </div>
        )}

        <div style={{
          fontSize: 11.5, color: AMBAR_TXT, marginTop: 9, paddingTop: 9,
          borderTop: `1px dashed ${AMBAR_BORDE}`,
        }}>
          📺 La TV entra en juego el próximo trimestre.
        </div>
      </div>

      {/* ── 5. Indicadores del trimestre ───────────────────────────────────── */}
      <div style={S.card}>
        <div style={S.lbl}>Mis indicadores en el trimestre</div>
        <div style={{ fontSize: 11.5, color: APOYO, fontWeight: 600, margin: "-4px 0 6px", lineHeight: 1.5 }}>
          Toca cualquiera para ver cómo vienes mes a mes
        </div>
        {!indTrim || !indTrim.indicadores.length ? (
          <div style={{ fontSize: 12.5, color: APOYO, lineHeight: 1.6 }}>
            Tus indicadores del trimestre no están disponibles todavía.
          </div>
        ) : (
          indTrim.indicadores.map((ind, i) => (
            <button
              key={ind.id}
              style={{
                ...S.indBtn,
                borderBottom: i === indTrim.indicadores.length - 1 ? "none" : S.indBtn.borderBottom,
              }}
              onClick={() => onIndicador && onIndicador(ind.id)}
            >
              <span style={{ fontSize: 18, width: 24, textAlign: "center", flexShrink: 0 }}>
                {ind.emoji}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: TINTA }}>
                {ind.nombre}
                <div style={{
                  fontSize: 11, fontWeight: 400, marginTop: 2,
                  color: colorTendencia(ind.tendencia),
                }}>
                  {textoTendencia(ind, nombrePorMes)}
                </div>
              </span>
              <span style={badge(ind.promedio, { fontSize: 13, minWidth: 42 })}>
                {fmtN(ind.promedio)}
              </span>
              <span style={{ color: "#a855f7", fontWeight: 800, fontSize: 17 }}>›</span>
            </button>
          ))
        )}
      </div>

      {/* ── 6. Ranking del trimestre de su ciudad ──────────────────────────── */}
      {/* Sólo si ELLA está en él. Si no participa, mostrarle esta tabla sería
          enseñarle una lista de la que fue excluida — no se hace. */}
      {participa ? (
        <div style={S.card}>
          <div style={S.lbl}>Ranking del trimestre · {ciudadLarga}</div>
          {!rank || (!rank.filas.length && !rank.sinNota.length) ? (
            <div style={{ fontSize: 12.5, color: APOYO, lineHeight: 1.6 }}>
              El ranking de tu ciudad no está disponible todavía.
            </div>
          ) : (
            <>
              {/* Todas las que están aquí participan en el trimestre. No hay
                  filas marcadas "no compite": quien no participa no aparece. */}
              {rank.filas.map(f => (
                <div key={f.id} style={{ ...S.mini, ...(f.esYo ? S.miniYo : null) }}>
                  <span style={{
                    width: 20, textAlign: "center", fontWeight: 800, flexShrink: 0,
                    color: f.medalla ? "#059669" : TENUE,
                  }}>
                    {f.medalla || f.n}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 700, color: TINTA }}>
                    {f.esYo ? `TÚ · ${f.nombreCorto}` : f.nombreCorto}
                    {f.ganaPremio ? " 💰" : ""}
                  </span>
                  <span style={{ fontWeight: 800, whiteSpace: "nowrap", color: colorN(f.nota) }}>
                    {fmtN(f.nota)}
                  </span>
                </div>
              ))}

              {rank.sinNota.map(f => (
                <div key={f.id} style={{ ...S.mini, ...(f.esYo ? S.miniYo : null), opacity: 0.75 }}>
                  <span style={{ width: 20, textAlign: "center", fontWeight: 800, flexShrink: 0, color: TENUE }}>
                    —
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 700, color: APOYO }}>
                    {f.esYo ? `TÚ · ${f.nombreCorto}` : f.nombreCorto}
                  </span>
                  <span style={{ fontWeight: 700, whiteSpace: "nowrap", color: TENUE, fontSize: 11.5 }}>
                    sin nota todavía
                  </span>
                </div>
              ))}

              <div style={S.pieCard}>
                {rank.clubCount
                  ? `💰 = hoy va en ${rank.meta.toFixed(2)} o más. Van ${rank.clubCount} en tu ciudad.`
                  : `Hoy todavía nadie llega al ${rank.meta.toFixed(2)} en tu ciudad.`}
                {rank.arriba && rank.faltaParaSubir !== null ? (
                  <> Con <strong style={{ color: TINTA }}>{rank.faltaParaSubir.toFixed(2)}</strong> más
                  {" "}pasas a {rank.arriba.nombreCorto}.</>
                ) : rank.esPrimera ? " Vas de primera 🏆" : ""}
                <br />
                Este ranking también se mueve todos los días — nada está definido hasta que
                cierre {ultimoNombre}.
              </div>
            </>
          )}
        </div>
      ) : (
        <div style={S.card}>
          <div style={S.lbl}>Ranking del trimestre · {ciudadLarga}</div>
          <div style={{ fontSize: 12.5, color: APOYO, lineHeight: 1.65 }}>
            {motivo === "entroTarde" ? (
              <>
                Este trimestre ya venía andando cuando empezaste, así que el ranking
                trimestral de {ciudadLarga} se juega entre las que estaban desde el
                primer día. <strong style={{ color: TINTA }}>Desde el próximo trimestre
                apareces ahí con todas.</strong>
                <br /><br />
                Mientras tanto, mira <strong style={{ color: TINTA }}>Mi mes</strong> y{" "}
                <strong style={{ color: TINTA }}>Mi cash</strong>: ahí sí estás
                compitiendo desde ya, y esos son los que se mueven cada día. 💜
              </>
            ) : (
              <>
                Este trimestre no entras en el ranking trimestral de {ciudadLarga}.
                Tu mes y tu semana siguen contando igual que siempre, y todos tus datos
                se conservan.
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
