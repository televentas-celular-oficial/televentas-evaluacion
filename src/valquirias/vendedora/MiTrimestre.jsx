// Mi trimestre — pantalla de la vendedora (Valkyrias)
//
// Especificación: el diseño aprobado por el dueño (agosto 2026), hermano del de
// "Mi mes" (MiMes.jsx). Mismo lenguaje visual, mismas piezas (common/piezas.jsx)
// y poquísimo texto.
//
// Orden fijo:
//   1. En juego              — tarjeta crema/dorada, cifra centrada, la frase del dueño
//   2. Tu nota               — tarjeta blanca, nota centrada, barra 1.00–5.00 con el 4.50
//   3. Cuánto pesa cada mes  — una fila por mes: barrita, nota y peso de HOY
//   4. Los indicadores       — nombre, nota y flecha, clicables
//   5. Mi puesto · <ciudad>  — el ranking completo, ella resaltada en crema
//
// Todo sale del motor. Este archivo NO calcula notas, ni premios, ni pesos:
// - derivarTrimestreEnVivo        → nota en vivo + los 3 meses con su peso/estado
// - derivarIndicadoresTrimestre   → cada indicador mes a mes (promedio PONDERADO)
// - derivarRankingTrimestreCiudad → ranking de SU ciudad (MED y BOG nunca se mezclan)
//
// Reglas que se respetan aquí:
// - Los meses CERRADOS se leen del snapshot tal cual. Esta pantalla sólo pinta.
// - Nunca se le dice si alcanza o no la meta: sólo la DISTANCIA de hoy.
// - Si un dato no existe → "no disponible". Nunca un 0 disfrazado de real.
// - Cifras de plata SIEMPRE completas: formatoPesos(n) → "$1.000.000".
// - Cero rojo. Lleno contra hueco, nunca alarma.
//
// ----------------------------------------------------------------------------
// LA REGLA DEL PREMIO, QUE ES LO QUE ESTA PANTALLA PROMETE
// ----------------------------------------------------------------------------
// Verificada contra `calcPremios` (src/lib/calculos.js:956-1009) antes de
// escribir la frase de la tarjeta 1:
//   · El BASE es una VARA, no un puesto: `llegan = enCiudad.filter(v =>
//     v.notaTrim >= 4.5)` — lo cobra CADA UNA que llegue.
//   · El EXTRA sólo existe si DOS O MÁS llegan: `if (conBono.length >= 2)`, y va
//     a la mejor de ellas. Si sólo una llega, cobra su millón y nada más.
//   · Si ninguna llega, esa ciudad no entrega premio.
// Por eso el pie del ranking NO dice "con X más pasas a Fulana" como en Mi mes:
// en el trimestre perseguir a la de arriba no da plata si ninguna de las dos
// llega al 4.50. Dice lo que le falta PARA LA VARA.

import { useEffect, useMemo, useState } from "react";
import { useDatos } from "../data/DatosContext.jsx";
import {
  derivarTrimestreEnVivo,
  derivarIndicadoresTrimestre,
  derivarRankingTrimestreCiudad,
} from "../data/derivar.js";
import { formatoPesos, hoyColombia } from "../lib/helpers.js";
import { fmtN, fechaLarga } from "../../lib/calculos.js";
import {
  BarraMarcada,
  Badge,
  BotonVolver,
  S_BASE,
  pctNota,
  colorNota,
  VERDE,
  TINTA,
  CIFRA,
  APOYO,
  TENUE,
  LINEA,
  PAPEL,
  C_TXT,
  C_APOYO,
  NEUTRO,
} from "../common/piezas.jsx";

// Los papeles de color viven en valquirias.css (:root). Aquí sólo se nombran.
const AMBAR_BORDE = "var(--vk-ambar-borde)";

const S = {
  ...S_BASE,
  titulo: { fontSize: 19, fontWeight: 800, margin: "0 0 12px", color: TINTA },
  subtitulo: { fontSize: 12, color: APOYO, margin: "-6px 0 12px" },
  filaMes: {
    display: "flex", alignItems: "center", gap: 10, padding: "10px 0",
    borderBottom: `1px dashed ${LINEA}`,
  },
};

// Sólo estos dos valores son una ciudad. Cualquier otra cosa (null, "", "MEDELLIN",
// un typo del sync) NO es una ciudad y no se traduce a ninguna. Ver el bloque
// CIUDAD en el componente.
const NOMBRE_CIUDAD = { MED: "Medellín", BOG: "Bogotá" };

const nDias = (n) => (n === 1 ? "1 día" : `${n} días`);

// "julio, agosto y septiembre"
function listaMeses(meses) {
  const n = meses.map(m => (m.nombre || "").toLowerCase()).filter(Boolean);
  if (n.length < 2) return n.join("");
  return `${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}`;
}

function Vacio({ onVolver, mensaje }) {
  return (
    <div>
      <BotonVolver onVolver={onVolver} />
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

// ---------------------------------------------------------------------------
// UNA FILA QUE SE DESPLIEGA
// ---------------------------------------------------------------------------
// La usan Ventas y CADA indicador, con la misma pieza a propósito: se ve el
// nombre y la nota, y al tocarla salen los tres meses con su barra y su nota.
// Regla del dueño (21-ago-2026): todo se comporta igual, sin excepciones.
//
// La barra significa cosas distintas según la fila, y por eso viene calculada
// de afuera: en Ventas es lo vendido contra la meta de ese mes; en un indicador
// es la nota sobre la escala 1.00–5.00.
function FilaDesplegable({ emoji, nombre, nota, abierta, onToggle, meses, ultima }) {
  const sinBorde = ultima && !abierta;
  return (
    <>
      <button
        style={{ ...S.indBoton, ...(sinBorde ? { borderBottom: "none" } : null) }}
        onClick={onToggle}
        aria-expanded={abierta}
      >
        <span style={{ fontSize: 18, width: 24, textAlign: "center", flexShrink: 0 }}>{emoji}</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: TINTA }}>
          {nombre}
        </span>
        <Badge nota={nota} />
        <span style={{
          color: APOYO, fontWeight: 800, fontSize: 17, display: "inline-block",
          transform: abierta ? "rotate(90deg)" : "none",
        }}>›</span>
      </button>

      {abierta && (
        <div style={{
          padding: "2px 0 9px 24px",
          borderBottom: ultima ? "none" : `1px solid ${LINEA}`,
        }}>
          {meses.map((f, i, arr) => {
            const hay = f.nota !== null && f.nota !== undefined;
            return (
              <div key={f.mes} style={{
                display: "flex", alignItems: "center", gap: 9, padding: "7px 0",
                borderBottom: i === arr.length - 1 ? "none" : `1px dashed ${LINEA}`,
              }}>
                <span style={{
                  fontSize: 11.5, fontWeight: 800, width: 68, flexShrink: 0,
                  color: hay ? TINTA : APOYO,
                }}>{f.nombre}</span>

                <span style={{ flex: 1, minWidth: 28 }}>
                  <span style={{
                    display: "block", height: 6, borderRadius: 3, background: NEUTRO,
                    overflow: "hidden",
                    ...(hay ? null : { outline: "1.5px dashed var(--est-sin-dato)", outlineOffset: "-1.5px" }),
                  }}>
                    {hay && (
                      <span style={{
                        display: "block", height: "100%", width: `${Math.max(0, Math.min(100, f.pct))}%`,
                        borderRadius: 3, background: VERDE,
                      }} />
                    )}
                  </span>
                </span>

                {f.valor && (
                  <span style={{
                    fontSize: 10.5, fontWeight: 800, color: APOYO,
                    whiteSpace: "nowrap", flexShrink: 0,
                  }}>{f.valor}</span>
                )}

                <Badge nota={f.nota} extra={{ fontSize: 11.5, minWidth: 42 }} />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function MiTrimestre({ vendedora, onVolver, onIndicador, año, q }) {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  // Qué fila está desplegada. Una sola a la vez: con dos columnas, varias
  // abiertas descuadran la rejilla y la pantalla salta.
  const [abierta, setAbierta] = useState(null);
  const alternar = (id) => setAbierta(a => (a === id ? null : id));

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
  const enJuego = montoBase + montoExtra;

  // --------------------------------------------------------------------------
  // CUÁNTOS DÍAS QUEDAN DEL TRIMESTRE
  // --------------------------------------------------------------------------
  // Es CALENDARIO, no una regla de negocio: el último día del último mes del
  // trimestre menos hoy, contando hoy. Es la misma cuenta que ya hace Mi mes
  // para "faltan N días" (MiMes.jsx: diasRestantes). Con el trimestre ya pasado
  // da 0 y entonces no se nombra en ninguna parte.
  const ultimoDiaQ = new Date(añoQ, qNum * 3, 0).getDate();
  const diasRestantes = Math.max(
    0,
    Math.round(
      (Date.UTC(añoQ, qNum * 3 - 1, ultimoDiaQ) - Date.UTC(hoy.año, hoy.mes - 1, hoy.dia)) / 86_400_000
    ) + 1
  );

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
  // Con `ciudad` en null, `participantes()` (calculos.js) no filtra nada
  // — `const enCiudad = ciudad ? universo.filter(...) : universo` — así que
  // `derivarRankingTrimestreCiudad` devolvería MED y BOG MEZCLADAS, y la
  // pantalla le mostraría una posición y un premio calculados contra un ranking
  // que no es el suyo. MED y BOG son dos empresas separadas con premios
  // separados. Sin ciudad tampoco hay meta de ventas (`metaParaCiudad` → null),
  // así que la nota del trimestre queda coja. No se muestra nada calculado: se dice.
  const ciudad = trim.ciudad === "MED" || trim.ciudad === "BOG" ? trim.ciudad : null;

  if (ciudad === null) {
    return (
      <div>
        <BotonVolver onVolver={onVolver} />
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
  const meta = trim.meta;                       // 4.50 — la vara del premio
  const nota = trim.nota;                       // number | null — en vivo
  const falta = trim.falta;                     // number | null
  const hayNota = nota !== null && nota !== undefined;
  const pasoLaVara = hayNota && nota >= meta;

  // ¿Participa en el trimestre? Si no, NO se le muestra el ranking: ella no
  // está en esa tabla (regla del dueño: quien entró con el trimestre arrancado
  // "ni debe aparecer"). Enseñarle una lista donde no figura sería peor que no
  // mostrarla. En su lugar va una explicación clara y sin castigo.
  const participa = trim.compite !== false;
  const motivo = trim.motivoNoCompite;

  // --------------------------------------------------------------------------
  // LOS PESOS QUE SE LE NOMBRAN SON LOS NOMINALES: 20/30/50
  // --------------------------------------------------------------------------
  // Por dentro, mientras falte un mes, calcTrimestre RENORMALIZA: reparte el
  // peso del mes sin nota entre los que sí la tienen (`suma(nota_i × peso_i) /
  // suma(peso_i con dato)`, lib/calculos.js). Eso hace que hoy julio pese 40% y
  // agosto 60% — que es la MISMA proporción 20:30, sólo repartida entre dos.
  //
  // Ese 40/60 NO se muestra. A ella se le dijo 20/30/50 y eso es lo que ve: un
  // porcentaje distinto le diría que le cambiaron la regla, y encima cambiaría
  // solo cuando entre septiembre. El costo es que la nota no le cierra con una
  // cuenta a mano — se prefiere eso antes que mostrarle un número que no es el
  // suyo. Los pesos nominales vienen ya calculados en `m.pesoPct`.
  const faltanMeses = trim.meses.some(m => m.nota === null || m.nota === undefined);
  const reglaPesos = trim.meses
    .map(m => `${m.pesoPct}% ${m.nombre.toLowerCase()}`)
    .join(" · ");

  // --------------------------------------------------------------------------
  // EL PIE DEL RANKING — lo que le falta PARA EL PREMIO, no para un puesto
  // --------------------------------------------------------------------------
  // Todo sale de `rank`, que ya viene calculado. Aquí sólo se elige la frase que
  // es verdad en su situación de hoy (ver la regla verificada arriba).
  const hayExtra = !!rank?.hayExtra;             // 2+ llegaron al 4.50 en su ciudad
  // El extra NO se gana pasando a la de arriba: se gana quedando de PRIMERA
  // (calculos.js — el extra va a `ordenado[0]`). Si ella va cuarta, pasar a la
  // tercera no le da nada. Por eso la distancia que se nombra es la distancia
  // a la PRIMERA, no a la de arriba. Es una resta entre dos notas ya
  // calculadas; no se calcula ninguna nota aquí.
  const primera = rank?.filas?.[0] || null;
  const faltaParaPrimera =
    primera && hayNota ? Math.round((primera.nota - nota) * 100) / 100 : null;
  const pieRanking = !hayNota
    ? null
    : !pasoLaVara
    ? <>Te faltan <strong style={{ color: CIFRA }}>{fmtN(falta)}</strong> para los {formatoPesos(montoBase)}.</>
    : !hayExtra
    ? <>Hoy vas por encima del {meta.toFixed(2)}. El extra de {formatoPesos(montoExtra)} sólo existe si otra llega al {meta.toFixed(2)}.</>
    : rank?.esPrimera
    ? <>Hoy vas de primera de {ciudadLarga}, y el extra de {formatoPesos(montoExtra)} es para la primera. 🏆</>
    : primera && faltaParaPrimera !== null
    ? <>Ya vas por los {formatoPesos(montoBase)}. El extra de {formatoPesos(montoExtra)} es para la primera de {ciudadLarga}: hoy te faltan <strong style={{ color: CIFRA }}>{fmtN(faltaParaPrimera)}</strong> para alcanzar a {primera.nombreCorto}.</>
    : null;

  return (
    <div style={{ color: TINTA }}>
      <BotonVolver onVolver={onVolver} />

      <div style={S.titulo}>💎 Mi trimestre</div>
      <div style={S.subtitulo}>
        {trim.q} · {listaMeses(trim.meses)} · {ciudadLarga}
        {diasRestantes > 0 ? ` · quedan ${nDias(diasRestantes)}` : ""}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 1) EN JUEGO                                                         */}
      {/* ------------------------------------------------------------------ */}
      {/* La frase es TEXTUAL, la escogió el dueño. Los montos salen de
          config.premiosTrim; la vara sale de META_NOTA_TRIMESTRE. */}
      <div style={S.cardOro}>
        <div style={{ ...S.lbl, color: C_APOYO, textAlign: "center" }}>En juego</div>

        <div
          style={{
            fontSize: 30, fontWeight: 800, letterSpacing: "-.8px",
            color: C_TXT, textAlign: "center",
          }}
        >
          {formatoPesos(enJuego)}
        </div>

        <div
          style={{
            fontSize: 13, color: C_TXT, fontWeight: 600, lineHeight: 1.7,
            marginTop: 10, textAlign: "center",
          }}
        >
          <strong>{formatoPesos(montoBase)}</strong> al llegar a {meta.toFixed(2)}.<br />
          Si llegan dos o más, la mejor gana <strong>{formatoPesos(montoExtra)}</strong> extra.
        </div>

        {/* Si NO participa en el trimestre, se dice aquí mismo, junto a los
            montos — no en letra chica ni escondido. Y con el tono que
            corresponde: es alguien que acaba de entrar a trabajar, no alguien
            que hizo algo mal. Nada de "no clasificaste". */}
        {!participa && (
          <div style={{
            marginTop: 12, padding: "10px 12px", borderRadius: 9,
            background: PAPEL, border: `1px solid ${AMBAR_BORDE}`,
            fontSize: 12, color: TINTA, fontWeight: 600, lineHeight: 1.6,
            textAlign: "left",
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
      </div>

      {/* De aquí abajo las tarjetas se acomodan de a dos en un computador
          (`.v-cols`), en el mismo orden. "En juego" se queda a lo ancho: es
          la primera cosa que tiene que ver, y compartir renglón la achica. */}
      <div className="v-cols">

      {/* Columna izquierda: su nota y cómo va cada mes. */}
      <div className="v-col">
      {/* ------------------------------------------------------------------ */}
      {/* 2) TU NOTA                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div style={S.card}>
        <div style={{ ...S.lbl, textAlign: "center" }}>Tu nota</div>

        <div
          style={{
            fontSize: 34, fontWeight: 800, letterSpacing: "-1px",
            textAlign: "center", color: hayNota ? CIFRA : TENUE,
          }}
        >
          {fmtN(nota)}
        </div>

        {/* Escala de la nota: 1.00 a 5.00, con el 4.50 del premio marcado.
            Sin nota la barra queda hueca — la marca sigue diciendo dónde está
            la vara, que es lo que se quería mostrar. */}
        <BarraMarcada
          pct={hayNota ? pctNota(nota) : 0}
          marcas={[{ clave: "premio", pct: pctNota(meta), fila: 0, texto: `${meta.toFixed(2)} premio` }]}
        />

        {/* La distancia a la vara SÓLO se le nombra a quien puede cobrarla. A
            quien entró con el trimestre andando se le mostraría "te faltan
            1.23" para un premio que este trimestre no puede ganar. Su nota sí
            se le muestra: es suya y es real. */}
        {(hayNota && !participa) ? null : (
        <div
          style={{
            fontSize: 12.5, color: hayNota ? TINTA : APOYO, fontWeight: 700,
            marginTop: 10, textAlign: "center", lineHeight: 1.55,
          }}
        >
          {!hayNota ? (
            <>
              Tu nota del trimestre todavía no está disponible: aún no hay días
              registrados en {listaMeses(trim.meses)}.
            </>
          ) : !pasoLaVara ? (
            diasRestantes > 0 ? (
              <>Te faltan {fmtN(falta)} y quedan {nDias(diasRestantes)}.</>
            ) : (
              <>Te faltaron {fmtN(falta)} para el {meta.toFixed(2)}.</>
            )
          ) : diasRestantes > 0 ? (
            <>Ya pasaste el {meta.toFixed(2)} y quedan {nDias(diasRestantes)}.</>
          ) : (
            <>Cerraste por encima del {meta.toFixed(2)}. ✓</>
          )}
        </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 3) MES A MES                                                        */}
      {/* ------------------------------------------------------------------ */}
      {/* Las filas NO llevan porcentaje. La regla va una sola vez al pie, con
          los pesos nominales — los mismos que ella ya conoce. */}
      <div style={{ ...S.card, paddingTop: 12, paddingBottom: 6 }}>
        <div style={S.lbl}>Mes a mes</div>
        {trim.meses.map((m, i) => {
          const hay = m.nota !== null && m.nota !== undefined;
          return (
            <div
              key={m.mes}
              style={{
                ...S.filaMes,
                borderBottom: i === trim.meses.length - 1 ? "none" : S.filaMes.borderBottom,
              }}
            >
              <span style={{ fontSize: 12.5, fontWeight: 800, color: hay ? TINTA : APOYO, whiteSpace: "nowrap" }}>
                {m.nombre}
              </span>
              <span style={{ flex: 1, minWidth: 40 }}>
                <span
                  style={{
                    display: "block", height: 6, borderRadius: 3, background: NEUTRO,
                    overflow: "hidden",
                    ...(hay ? null : { outline: "1.5px dashed var(--est-sin-dato)", outlineOffset: "-1.5px" }),
                  }}
                >
                  {hay && (
                    <span style={{
                      display: "block", height: "100%", width: `${pctNota(m.nota)}%`,
                      borderRadius: 3, background: VERDE,
                    }} />
                  )}
                </span>
              </span>
              <Badge nota={m.nota} extra={{ fontSize: 13, minWidth: 46 }} />
              {/* Un mes cerrado ya no se mueve. Sin este sello, julio y agosto
                  se ven idénticos y puede creer que alcanza a recuperar julio. */}
              {m.cerrado && (
                <span style={{ fontSize: 11.5, fontWeight: 700, color: TENUE, whiteSpace: "nowrap" }}>
                  cerrado
                </span>
              )}
            </div>
          );
        })}

        {/* La regla, tal como ella la conoce. Y el aviso de que lo de hoy es
            parcial — sólo mientras de verdad falte un mes. */}
        <div style={{
          fontSize: 12, color: APOYO, fontWeight: 600, lineHeight: 1.6,
          marginTop: 4, paddingTop: 9, paddingBottom: 6, borderTop: `1px dashed ${LINEA}`,
        }}>
          El trimestre es {reglaPesos}.
          {faltanMeses && (
            <><br />Esta nota es parcial. La definitiva sale con los tres meses.</>
          )}
        </div>
      </div>


      </div>{/* /col izquierda */}

      {/* Columna derecha: de qué está hecha esa nota — ventas (60%) y
          comportamiento (40%). Las dos columnas suman altura parecida,
          así que ninguna queda con un hueco al lado. */}
      <div className="v-col">
      {/* ------------------------------------------------------------------ */}
      {/* 2b) VENTAS                                                          */}
      {/* ------------------------------------------------------------------ */}
      {/* Las ventas son el 60% de cada nota mensual — la mitad más pesada de la
          nota del trimestre — y la pantalla sólo mostraba los cinco indicadores
          de comportamiento, que son el 40% restante.
          Va en tarjeta aparte, no dentro de la lista de indicadores: no es un
          indicador más, pesa más que los cinco juntos.
          Y va aquí, pegada a "Tu nota", porque las dos son cortas: en el
          computador comparten renglón sin dejar un hueco al lado. */}
      {trim.ventas && trim.ventas.promedio !== null && (
        <div style={{ ...S.card, paddingTop: 12, paddingBottom: 6 }}>
          <FilaDesplegable
            emoji="💰"
            nombre="Ventas"
            nota={trim.ventas.promedio}
            abierta={abierta === "ventas"}
            onToggle={() => alternar("ventas")}
            ultima
            meses={trim.ventas.meses.map(f => ({
              mes: f.mes,
              nombre: f.nombre,
              nota: f.nota,
              // Lo vendido contra la meta DE ESE MES.
              pct: f.pct === null || f.pct === undefined ? 0 : f.pct,
              valor: f.real !== null && f.real !== undefined ? formatoPesos(f.real) : null,
            }))}
          />
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 4) LOS INDICADORES DEL TRIMESTRE                                    */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ ...S.card, paddingTop: 12, paddingBottom: 6 }}>
        <div style={{ ...S.lbl, fontSize: 11, color: TENUE }}>
          Mis indicadores en el trimestre
        </div>
        {!indTrim || !indTrim.indicadores.length ? (
          <div style={{ fontSize: 12.5, color: APOYO, lineHeight: 1.6, paddingBottom: 8 }}>
            Tus indicadores del trimestre no están disponibles todavía.
          </div>
        ) : (
          // Cada indicador se despliega igual que Ventas: la MISMA pieza.
          // Antes esto navegaba a la pantalla de detalle; ahora el mes a mes
          // sale aquí mismo, que es lo que se quería ver.
          indTrim.indicadores.map((ind, i, arr) => (
            <FilaDesplegable
              key={ind.id}
              emoji={ind.emoji}
              nombre={ind.nombre}
              nota={ind.promedio}
              abierta={abierta === ind.id}
              onToggle={() => alternar(ind.id)}
              ultima={i === arr.length - 1}
              meses={(indTrim.meses || []).map((mm, j) => ({
                mes: mm.mes,
                nombre: mm.nombre,
                nota: ind.notasMes[j] ?? null,
                // En un indicador la barra es la nota sobre la escala 1.00–5.00
                // (la misma que usa la barra grande de "Tu nota"), no un
                // porcentaje de meta: aquí no hay meta que perseguir.
                pct: pctNota(ind.notasMes[j] ?? null),
                valor: null,
              }))}
            />
          ))
        )}
      </div>

      </div>{/* /col derecha */}

      {/* ------------------------------------------------------------------ */}
      {/* 5) MI PUESTO · <CIUDAD>                                             */}
      {/* ------------------------------------------------------------------ */}
      {/* Sólo si ELLA está en él. Si no participa, mostrarle esta tabla sería
          enseñarle una lista de la que fue excluida — no se hace. */}
      {/* `v-full`: el ranking ocupa el ancho completo. Es una lista de trece
          renglones — embutida en media pantalla dejaba un hueco enorme al lado
          y se leía apretada. En el celular la clase no hace nada. */}
      {participa ? (
        <div className="v-full" style={S.card}>
          <div style={S.lbl}>Mi puesto · {ciudadLarga}</div>
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
                  <span style={{
                    fontWeight: 800, whiteSpace: "nowrap",
                    color: f.nota === null || f.nota === undefined ? TENUE : colorNota(f.nota),
                  }}>
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

              {/* El pie del ranking: lo que le falta PARA EL PREMIO. En el
                  trimestre el premio es una vara, no un puesto. */}
              {(pieRanking || rank.filas.length > 0) && (
                <div style={S.pieCard}>
                  {/* El caso CERO también se dice: que hoy nadie llegue al 4.50
                      es justamente el dato que le avisa que el extra todavía no
                      está en disputa. Callarlo la deja creyendo que sí. */}
                  {rank.filas.length > 0 && (
                    rank.clubCount > 0 ? (
                      <>💰 = hoy va en {meta.toFixed(2)} o más · van {rank.clubCount} en {ciudadLarga}.<br /></>
                    ) : (
                      <>Hoy todavía nadie llega al {meta.toFixed(2)} en {ciudadLarga}.<br /></>
                    )
                  )}
                  {pieRanking}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="v-full" style={S.card}>
          <div style={S.lbl}>Mi puesto · {ciudadLarga}</div>
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

      </div>{/* /.v-cols */}
    </div>
  );
}
