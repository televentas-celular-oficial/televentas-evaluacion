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
import { fmtN, fechaLarga } from "../../lib/calculos.js";

// Paleta Valkyrias — sólo colores. `colorN`/`bgN` de lib/calculos.js siguen
// intactos porque los usan el admin y el ingreso diario; aquí la vendedora
// tiene su propia escala, sin rojo y sin morado.
//
// La tarjeta de la nota del trimestre es la tarjeta NOCHE de esta pantalla:
// los tokens LILA_* son ahora los de esa superficie oscura.
// Los papeles de color viven en valquirias.css (:root). Aquí sólo se nombran.
const LILA_BG = "var(--vk-noche)";        // Noche
const LILA_BORDE = "var(--vk-noche)";     // Noche
const LILA_TXT = "var(--vk-noche-texto)"; // sobre la noche
const N_APOYO = "var(--vk-noche-apoyo)";  // secundario sobre la noche
// Los premios de este trimestre TODAVÍA no están ganados, así que aquí no va
// oro: el oro se reserva para lo que ya se ganó.
const AMBAR_BG = "var(--vk-fondo)";       // Lienzo
const AMBAR_BORDE = "var(--vk-borde)";    // Borde
const AMBAR_TXT = "var(--vk-titulo)";     // Tinta
const LINEA = "var(--vk-borde)";          // Borde
const APOYO = "var(--vk-secundario)";     // Niebla
const TENUE = "var(--vk-tenue)";          // Sin dato
const TINTA = "var(--vk-titulo)";         // Tinta
const CIFRA = "var(--vk-cifra)";          // Tinta — cifras y notas
const PAPEL = "var(--vk-tarjeta)";        // Papel
const FONDO = "var(--vk-fondo)";          // Lienzo
const VERDE = "var(--vk-bien)";           // Meta cumplida
const VERDE_FONDO = "var(--vk-bien-fondo)"; // Verde claro

// Escala de notas: el canal principal es lleno contra hueco, no el tono.
const colorNota = (n) =>
  n >= 4.5 ? "var(--vk-bien-texto)" : n >= 3.5 ? "var(--est-atencion)" : n >= 2.5 ? "var(--est-medio)" : "var(--vk-medio)";
const fondoNota = (n) =>
  n >= 4.5 ? "var(--vk-bien-fondo)" : n >= 3.5 ? "var(--vk-tarjeta)" : n >= 2.5 ? "var(--est-medio-fondo)" : "var(--vk-neutro)";
const anilloNota = (n) => (n >= 3.5 && n < 4.5 ? "inset 0 0 0 1.5px var(--est-atencion-borde)" : "none");

const S = {
  volver: {
    background: "none", border: "none", font: "inherit", fontSize: 14, fontWeight: 700,
    color: APOYO, cursor: "pointer", padding: "0 0 12px", display: "flex",
    alignItems: "center", gap: 5,
  },
  titulo: { fontSize: 19, fontWeight: 800, margin: "0 0 12px", color: TINTA },
  subtitulo: { fontSize: 12, color: APOYO, margin: "-6px 0 12px" },
  card: {
    background: PAPEL, border: `1px solid ${LINEA}`, borderRadius: 13,
    padding: 16, marginBottom: 10,
  },
  lbl: {
    fontSize: 12, fontWeight: 800, color: APOYO, textTransform: "uppercase",
    letterSpacing: ".7px", marginBottom: 4, display: "block",
  },
  // Va dentro de la tarjeta noche: el riel es un blanco muy tenue.
  barra: { height: 8, background: "rgba(var(--vk-velo-rgb),.14)", borderRadius: 4, overflow: "hidden", marginTop: 12 },
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
  // "TÚ" se marca con un anillo de tinta, no con un color de aviso.
  miniYo: { background: FONDO, boxShadow: "inset 0 0 0 1.5px var(--vk-titulo)" },
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
    background: hay ? fondoNota(nota) : PAPEL,
    color: hay ? colorNota(nota) : TENUE,
    boxShadow: hay ? anilloNota(nota) : "none",
    // Sin dato: hueco con borde punteado, por dentro para no mover nada.
    ...(hay ? null : { outline: "1.5px dashed var(--est-sin-dato)", outlineOffset: "-1.5px" }),
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

// "julio 40% y agosto 60%" — la misma lista, cada mes con el peso que le toque.
function listaMesesConPeso(meses, peso) {
  const p = meses.map(m => `${(m.nombre || "").toLowerCase()} ${peso(m)}`);
  if (p.length < 2) return p.join("");
  return `${p.slice(0, -1).join(", ")} y ${p[p.length - 1]}`;
}

// 0.4 → "40%" · 0.2857… → "28,6%". Un decimal sólo cuando hace falta, para que
// los pesos mostrados sigan sumando 100 y la cuenta se pueda rehacer a mano.
function pctPeso(x) {
  if (x === null || x === undefined) return null;
  const v = Math.round(x * 1000) / 10;
  return `${String(v).replace(".", ",")}%`;
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
  if (t === "sube") return VERDE;
  // Bajando ya no es naranja de alarma: es ámbar de atención, no una urgencia.
  if (t === "baja") return "var(--est-atencion)";
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
        <div style={{ ...S.card, borderLeft: "4px solid var(--est-atencion-borde)", borderRadius: "0 13px 13px 0" }}>
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

  // --------------------------------------------------------------------------
  // CUÁNTO PESA CADA MES **HOY**
  // --------------------------------------------------------------------------
  // Los pesos del trimestre son 20/30/50, pero la nota en vivo se saca sólo con
  // los meses que YA tienen nota y RENORMALIZA: calcTrimestre hace
  // `suma(nota_i × peso_i) / suma(peso_i con dato)` (lib/calculos.js). Sin
  // septiembre eso significa que julio no pesa 20% sino 20/50 = 40%, y agosto
  // 30/50 = 60%.
  //
  // La pantalla decía 20 / 30 / 50 igual. Con esos números la nota del trimestre
  // NO se puede reconstruir, y lo que ella concluye no es "me equivoqué en la
  // cuenta", es "el número es inventado". Aquí no se cambia ni un cálculo: se
  // nombra el peso que la fórmula ya está usando, y se dice cuál va a ser
  // cuando entre el mes que falta.
  const pesosConDato = trim.pesosConDato || 0;
  const pesoHoy = (m) => (m.nota === null || m.nota === undefined || !pesosConDato ? null : m.peso / pesosConDato);

  const mesesConNota = trim.meses.filter(m => m.nota !== null && m.nota !== undefined);
  const mesesSinNota = trim.meses.filter(m => m.nota === null || m.nota === undefined);

  // La cuenta se pinta SÓLO si cuadra con la nota que se está mostrando, y se
  // rehace con los mismos porcentajes redondeados que ella ve. Si por redondeo
  // no diera exacto, no se muestra ninguna cuenta: una cuenta que no da es peor
  // que ninguna cuenta.
  const cuenta = mesesConNota.length && pesosConDato
    ? Math.round(
        mesesConNota.reduce((s, m) => s + m.nota * (Math.round(pesoHoy(m) * 1000) / 1000), 0) * 100
      ) / 100
    : null;
  const cuentaCuadra = cuenta !== null && nota !== null && cuenta === nota;

  return (
    <div>
      {onVolver && <button style={S.volver} onClick={onVolver}>‹ Volver</button>}

      <div style={S.titulo}>💎 Mi trimestre</div>
      <div style={S.subtitulo}>
        {trim.q} · {listaMeses(trim.meses)} · {ciudadLarga}
      </div>

      {/* ── 1. Nota del trimestre EN VIVO ─────────────────────────────────── */}
      {/* LA TARJETA NOCHE DE ESTA PANTALLA: la cifra principal de "Mi
          trimestre" es esta nota. Es la única que se pinta en oscuro. */}
      <div style={{ ...S.card, background: LILA_BG, borderColor: LILA_BORDE }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...S.lbl, color: N_APOYO, marginBottom: 2 }}>
              Mi nota del trimestre · en vivo
            </div>
            <div style={{ fontSize: 11.5, color: N_APOYO, fontWeight: 600, lineHeight: 1.45 }}>
              Se actualiza todos los días
            </div>
          </div>
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            background: LILA_TXT, color: nota === null ? TENUE : CIFRA,
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
                width: `${Math.min(100, (nota / meta) * 100)}%`, background: VERDE_FONDO,
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
        background: "var(--est-medio-fondo)", color: "var(--est-medio)", borderLeft: "3px solid var(--est-medio)",
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
        <div style={{ fontSize: 11.5, color: APOYO, fontWeight: 600, margin: "-4px 0 4px", lineHeight: 1.5 }}>
          Cuánto pesa cada mes <strong style={{ color: TINTA }}>hoy</strong>
        </div>
        {trim.meses.map((m, i) => {
          const ph = pesoHoy(m);
          return (
            <div
              key={m.mes}
              style={{ ...S.filaMes, borderBottom: i === trim.meses.length - 1 ? "none" : S.filaMes.borderBottom }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: m.cerrado ? TINTA : APOYO }}>
                  {m.nombre}
                </div>
                <div style={{ fontSize: 11.5, color: APOYO, marginTop: 2 }}>
                  {ph === null
                    ? `Hoy no pesa · ${m.etiquetaEstado}`
                    : `Hoy pesa ${pctPeso(ph)} · ${m.etiquetaEstado}`}
                </div>
              </div>
              <span style={badge(m.nota, { fontSize: 14, minWidth: 46 })}>{fmtN(m.nota)}</span>
            </div>
          );
        })}

        {/* La cuenta exacta, sólo si cuadra con la nota de arriba. Es la
            diferencia entre "entiendo mi nota" y "ese número es inventado". */}
        {cuentaCuadra && (
          <div style={{ ...S.pieCard, fontWeight: 700 }}>
            {mesesConNota.map((m, i) => (
              <span key={m.mes}>
                {i > 0 ? " + " : ""}
                {(m.nombre || "").toLowerCase()} {fmtN(m.nota)} × {pctPeso(pesoHoy(m))}
              </span>
            ))}
            {" = "}
            <strong style={{ color: CIFRA }}>{fmtN(nota)}</strong>
          </div>
        )}

        {/* --------------------------------------------------------------- */}
        {/* POR QUÉ NO DICE 20 / 30 / 50                                     */}
        {/* --------------------------------------------------------------- */}
        {/* Los pesos de siempre son 20/30/50, pero mientras falte un mes la
            nota se reparte sólo entre los que ya tienen nota. Decirlo de una
            vez es también lo que el dueño quiere que entiendan: el trimestre se
            mueve, y el mes que más pesa es el que todavía no ha pasado. */}
        <div style={S.pieCard}>
          {mesesSinNota.length === 0 ? (
            <>
              Los tres meses ya tienen nota, así que cada uno pesa lo suyo:{" "}
              {listaMesesConPeso(trim.meses, m => `${m.pesoPct}%`)}.
            </>
          ) : mesesConNota.length === 0 ? (
            <>
              Cuando haya notas, el trimestre se reparte así:{" "}
              {listaMesesConPeso(trim.meses, m => `${m.pesoPct}%`)}.
            </>
          ) : (
            <>
              Hoy la nota se arma sólo con {listaMeses(mesesConNota)}, porque{" "}
              {listaMeses(mesesSinNota)} todavía no{" "}
              {mesesSinNota.length > 1 ? "tienen" : "tiene"} nota: su peso se reparte entre lo
              que sí hay, y por eso hoy{" "}
              {listaMesesConPeso(mesesConNota, m => pctPeso(pesoHoy(m)))}.
              <br />
              Cuando {listaMeses(mesesSinNota)}{" "}
              {mesesSinNota.length > 1 ? "tengan" : "tenga"} nota, los pesos vuelven a ser los de
              siempre: {listaMesesConPeso(trim.meses, m => `${m.pesoPct}%`)}.
              {ultimo && (ultimo.nota === null || ultimo.nota === undefined)
                ? ` Por eso el mes que más mueve la nota del trimestre es ${ultimoNombre}, que todavía no ha pasado.`
                : ""}
            </>
          )}
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
            background: PAPEL, border: `1px solid ${AMBAR_BORDE}`,
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
              <span style={{ color: APOYO, fontWeight: 800, fontSize: 17 }}>›</span>
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
                    color: f.medalla ? VERDE : TENUE,
                  }}>
                    {f.medalla || f.n}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 700, color: TINTA }}>
                    {f.esYo ? `TÚ · ${f.nombreCorto}` : f.nombreCorto}
                    {f.ganaPremio ? " 💰" : ""}
                  </span>
                  <span style={{ fontWeight: 800, whiteSpace: "nowrap", color: f.nota === null || f.nota === undefined ? TENUE : colorNota(f.nota) }}>
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
                  <> Con <strong style={{ color: CIFRA }}>{rank.faltaParaSubir.toFixed(2)}</strong> más
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
