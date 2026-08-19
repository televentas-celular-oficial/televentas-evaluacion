// Mi mes — pantalla de la vendedora.
// Especificación: docs/prototipo-3-perfiles.html → vMes()
//
// Orden fijo (el del prototipo, nada más y nada menos):
//   1. Tarjeta de la plata (borde izquierdo del color de su ciudad)
//   2. Mi puesto en ventas (ranking de SU ciudad)
//   3. Mi nota del mes + los 5 indicadores como botones de una línea
//   4. Cuadro lavanda del bono
//
// REGLAS QUE SE RESPETAN AQUÍ
// - Cero fórmulas propias: todo sale de derivar.js → src/lib/calculos.js.
//   Los tramos, el piso de Medellín y el % por rol se leen, no se recalculan.
// - Meses cerrados: esta pantalla SIEMPRE mira el mes EN CURSO (hoyColombia()),
//   así que nunca toca la nota de un mes cerrado. Y aunque la mirara, todo viene
//   de calcNotaMensual, que devuelve el snapshot tal cual cuando el mes cerró.
// - Dato que no existe → null → "no disponible". Nunca un 0 disfrazado de real.
//   OJO: calcNotaMensual devuelve `real = vendidas[id] ?? 0`, o sea un CERO DURO
//   cuando el dato no existe. Por eso la existencia de las ventas se decide con
//   derivarRankingMesCiudad (`misVentas`, que sí devuelve null), no con `mes.ventas`.
// - Cifras de plata SIEMPRE completas: formatoPesos(n) → "$5.678.400". Nunca formatoK.
// - CIUDAD: se resuelve o no se resuelve. NO hay ciudad por defecto (ver abajo).
// - Ningún texto afirma un porcentaje que el cálculo no garantice. En un mes con
//   cambio de rol la comisión es una pro-rata de DOS tarifas: se dicen las dos.

import { useDatos } from "../data/DatosContext.jsx";
import { derivarMesDeVendedora, derivarRankingMesCiudad } from "../data/derivar.js";
import { formatoPesos, primerNombre, hoyColombia, pctTexto, PISO_MED } from "../lib/helpers.js";

// Paleta del prototipo
const COL_CIUDAD = { MED: "#10b981", BOG: "#f59e0b" };
const NOMBRE_CIUDAD = { MED: "Medellín", BOG: "Bogotá" };
const VERDE = "#046c4e";
const LAVANDA_TXT = "#5b2ec4";
const TINTA = "#0f172a";
const APOYO = "#475569";
const TENUE = "#94a3b8";
const LINEA = "#e2e8f0";

const colorNota = (n) =>
  n >= 4.5 ? "#059669" : n >= 3.5 ? "#d97706" : n >= 2.5 ? "#ea580c" : "#dc2626";
const fondoNota = (n) =>
  n >= 4.5 ? "#d1fae5" : n >= 3.5 ? "#fef3c7" : n >= 2.5 ? "#ffedd5" : "#fee2e2";

const capitalizar = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
const nDias = (n) => (n === 1 ? "1 día" : `${n} días`);

const S = {
  card: {
    background: "#fff",
    border: `1px solid ${LINEA}`,
    borderRadius: 13,
    padding: 16,
    marginBottom: 10,
  },
  lbl: {
    fontSize: 12,
    fontWeight: 800,
    color: "#334155",
    textTransform: "uppercase",
    letterSpacing: ".7px",
    marginBottom: 4,
    display: "block",
  },
  barra: {
    height: 8,
    background: "#f1f5f9",
    borderRadius: 4,
    overflow: "hidden",
    marginTop: 10,
  },
  mini: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "7px 10px",
    borderRadius: 9,
    marginBottom: 3,
    fontSize: 12.5,
  },
  indBoton: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "9px 2px",
    background: "none",
    border: "none",
    borderBottom: `1px dashed ${LINEA}`,
    font: "inherit",
    cursor: "pointer",
    textAlign: "left",
  },
};

function BotonVolver({ onVolver }) {
  return (
    <button
      onClick={onVolver}
      style={{
        background: "none",
        border: "none",
        font: "inherit",
        fontSize: 14,
        fontWeight: 700,
        color: APOYO,
        cursor: "pointer",
        padding: "0 0 12px",
        display: "flex",
        alignItems: "center",
        gap: 5,
      }}
    >
      ‹ Volver
    </button>
  );
}

function Badge({ nota, grande = false }) {
  const hay = nota != null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        fontWeight: 800,
        background: hay ? fondoNota(nota) : "#f1f5f9",
        color: hay ? colorNota(nota) : TENUE,
        fontSize: grande ? 23 : 13,
        minWidth: grande ? 72 : 42,
        padding: grande ? "8px 13px" : "3px 10px",
      }}
    >
      {hay ? nota.toFixed(2) : "—"}
    </span>
  );
}

export default function MiMes({ vendedora, onVolver, onIndicador }) {
  const datos = useDatos();
  const hoy = hoyColombia();
  const año = hoy.año;
  const nMes = hoy.mes;

  const mes = derivarMesDeVendedora(datos, vendedora, año, nMes);
  const rk = derivarRankingMesCiudad(datos, vendedora, año, nMes);

  const nombreMes = mes?.nombreMes || "";

  // --------------------------------------------------------------------------
  // CIUDAD — se resuelve o no se resuelve. NO hay ciudad por defecto.
  // --------------------------------------------------------------------------
  // Antes: `mes?.ciudad === "BOG" ? "BOG" : "MED"`. Eso pintaba de Medellín a
  // CUALQUIERA cuya ciudad no se pudiera resolver — título, color, nombre de
  // ciudad y, lo caro, el piso de $15.000.000 que quizá no le aplica. Es el
  // mismo fallback que se eliminó del núcleo (calculos.js), una capa más arriba.
  //
  // derivar.js ya hace lo correcto: con ciudad desconocida devuelve
  // `ciudadDesconocida: true` y pone `comision` y `piso` en null. Traducir eso a
  // "es de Medellín" era volver a inventar el dato aquí. Sin ciudad no hay
  // comisión que mostrar: ni piso, ni tramo en pesos, ni meta, ni nota de
  // ventas (calcNotaMensual deja `meta`/`notaVentas` en null). Empty state.
  const ciudad = mes?.ciudad === "MED" || mes?.ciudad === "BOG" ? mes.ciudad : null;

  if (!mes || mes.ciudadDesconocida || ciudad === null) {
    return (
      <div style={{ color: TINTA }}>
        <BotonVolver onVolver={onVolver} />
        <div style={{ fontSize: 19, fontWeight: 800, margin: "0 0 12px", color: TINTA }}>
          📅 Mi mes
        </div>
        <div
          style={{
            ...S.card,
            borderLeft: "4px solid #f59e0b",
            borderRadius: "0 13px 13px 0",
          }}
        >
          <div style={S.lbl}>No podemos mostrarte tu mes</div>
          <div style={{ fontSize: 13.5, color: APOYO, fontWeight: 600, lineHeight: 1.6 }}>
            No pudimos determinar tu ciudad, y sin ella no hay forma de calcular bien tu
            comisión: Medellín y Bogotá tienen reglas distintas — Medellín tiene un piso de{" "}
            <strong style={{ color: TINTA }}>{formatoPesos(PISO_MED)}</strong> y Bogotá no.
          </div>
          <div
            style={{
              fontSize: 13.5,
              color: APOYO,
              fontWeight: 600,
              lineHeight: 1.6,
              marginTop: 10,
              paddingTop: 10,
              borderTop: `1px dashed ${LINEA}`,
            }}
          >
            Preferimos no mostrarte una cifra antes que mostrarte una equivocada.{" "}
            <strong style={{ color: TINTA }}>Escríbele al administrador</strong> para que
            corrija tu ciudad. Apenas quede lista, aquí aparece tu mes completo — tus ventas,
            tu comisión y tu nota.
          </div>
          <div style={{ fontSize: 12, color: TENUE, fontWeight: 600, marginTop: 10 }}>
            Nada se pierde: tus días ya registrados siguen guardados.
          </div>
        </div>
      </div>
    );
  }

  const colC = COL_CIUDAD[ciudad];
  const ciudadTxt = NOMBRE_CIUDAD[ciudad];
  const rolTxt = mes.rol === "admin" ? "administradora" : "asesora";

  // ¿EXISTE el dato de ventas? (null-safe: ver nota de arriba)
  const hayVentas = !!(rk?.disponible && rk?.misVentas != null);
  const ventas = hayVentas ? mes.ventas : null;

  const piso = mes.piso || {};
  const sig = mes.siguienteTramoInfo || null;
  const notaComp = mes.notaComportamiento ?? null;

  // --------------------------------------------------------------------------
  // ¿EL % DE UN SOLO ROL EXPLICA LA COMISIÓN DE ESTE MES?
  // --------------------------------------------------------------------------
  // Si hubo cambio de rol dentro del mes, NO: la cifra salió de una pro-rata de
  // dos tarifas (unos días al 2% de asesora, el resto al 4% de administradora),
  // así que "4% sobre todo lo vendido" y la plata que se muestra no cuadran —
  // y ella lo va a notar. `cambioRol` trae el desglose auditable; `mixto` y
  // `ascensoEnEsteMes` son las banderas por si el desglose no viniera.
  const rolMixto = !!(mes.cambioRol || mes.ascensoEnEsteMes || mes.tramoInfo?.mixto);
  const cr = mes.cambioRol || null;

  return (
    <div style={{ color: TINTA }}>
      <BotonVolver onVolver={onVolver} />

      <div style={{ fontSize: 19, fontWeight: 800, margin: "0 0 12px", color: TINTA }}>
        📅 Mi mes
      </div>
      <div style={{ fontSize: 12, color: APOYO, margin: "-6px 0 12px" }}>
        {capitalizar(nombreMes)} {año} · día {mes.dia} de {mes.diasMes} · {ciudadTxt}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 1) LA PLATA                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ ...S.card, borderLeft: `4px solid ${colC}`, borderRadius: "0 13px 13px 0" }}>
        <div style={S.lbl}>Vendido en {nombreMes}</div>

        {!hayVentas ? (
          // Dato inexistente: no se inventa ni un peso ni un cero.
          <div style={{ fontSize: 13, color: APOYO, fontWeight: 600, lineHeight: 1.55 }}>
            Tus ventas de {nombreMes} todavía no están disponibles. Se sincronizan desde
            systemlap — apenas lleguen aparecen aquí con tu comisión.
          </div>
        ) : piso.aplica && !piso.superado ? (
          <>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-.8px", color: TINTA }}>
              {formatoPesos(ventas)}
            </div>
            <div style={S.barra}>
              <div
                style={{
                  display: "block",
                  height: "100%",
                  borderRadius: 4,
                  background: colC,
                  width: `${Math.min(100, Math.round((ventas / piso.monto) * 100))}%`,
                }}
              />
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: APOYO,
                fontWeight: 600,
                marginTop: 8,
                lineHeight: 1.55,
              }}
            >
              {ciudadTxt} tiene piso de <strong>{formatoPesos(piso.monto)}</strong>. Te faltan{" "}
              <strong style={{ color: TINTA }}>{formatoPesos(piso.falta)}</strong> para empezar a
              ganar comisión.{" "}
              {/* El % sólo se afirma si UN solo rol explica el mes. Con cambio de
                  rol la comisión es pro-rata de dos tarifas: se dice eso, no un %. */}
              {rolMixto ? (
                <>
                  Este mes cambiaste de cargo, así que tu comisión se calcula por días con dos
                  porcentajes distintos.
                </>
              ) : piso.pct != null ? (
                <>
                  Ahí ganas el <strong>{pctTexto(piso.pct)}</strong> de todo, por ser {rolTxt}.
                </>
              ) : null}
              {piso.comisionAlLlegar != null ? (
                <>
                  {" "}
                  Al tocar el piso serían{" "}
                  <strong style={{ color: TINTA }}>{formatoPesos(piso.comisionAlLlegar)}</strong>.
                </>
              ) : null}
            </div>
            <div
              style={{
                marginTop: 10,
                paddingTop: 10,
                borderTop: `1px dashed ${LINEA}`,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
              }}
            >
              <span style={{ fontSize: 12.5, fontWeight: 700, color: APOYO }}>
                Mi comisión hasta hoy
              </span>
              {/* Este $0 es REAL (calcComisionMensual devuelve 0 bajo el piso),
                  no un dato ausente. Aun así sale del motor, no hardcodeado. */}
              <span style={{ fontSize: 19, fontWeight: 800, color: APOYO }}>
                {mes.comision != null ? formatoPesos(mes.comision) : "no disponible"}
              </span>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-.8px", color: TINTA }}>
              {formatoPesos(ventas)}
            </div>
            <div style={{ fontSize: 12, color: APOYO, fontWeight: 600, marginTop: 4 }}>
              {/* `ciudadTxt` sale de la ciudad YA resuelta (arriba se hace early
                  return si no se pudo determinar), así que aquí no se le puede
                  decir "en Bogotá..." a alguien de ciudad desconocida. */}
              {piso.aplica
                ? `Piso de ${formatoPesos(piso.monto)} superado ✓`
                : `En ${ciudadTxt} ganas desde el primer peso ✓`}
            </div>
            <div
              style={{
                marginTop: 11,
                paddingTop: 11,
                borderTop: `1px dashed ${LINEA}`,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
              }}
            >
              <span style={{ fontSize: 12.5, fontWeight: 700, color: VERDE }}>
                Mi comisión hasta hoy
              </span>
              <span style={{ fontSize: 24, fontWeight: 800, color: VERDE }}>
                {mes.comision != null ? formatoPesos(mes.comision) : "no disponible"}
              </span>
            </div>

            {/* ---------------------------------------------------------------- */}
            {/* CÓMO SE EXPLICA ESA COMISIÓN                                      */}
            {/* ---------------------------------------------------------------- */}
            {/* Antes esto decía siempre "{pct}% sobre todo lo vendido". En un mes
                en el que la ascendieron a mitad de mes, la comisión sale de una
                pro-rata de DOS tarifas: el porcentaje pintado y la plata pintada
                no cuadran. Ahora, cuando hubo cambio de rol, se dicen los dos
                tramos, sus dos porcentajes y sus días — que es la verdad. */}
            {rolMixto && cr ? (
              <>
                <div style={{ fontSize: 12, color: VERDE, fontWeight: 700, marginTop: 3 }}>
                  {mes.tramoInfo ? `${mes.tramoInfo.nombre} · ` : ""}Este mes cambiaste de cargo
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: APOYO,
                    fontWeight: 600,
                    marginTop: 5,
                    lineHeight: 1.6,
                  }}
                >
                  Tu comisión se repartió por días:{" "}
                  <strong style={{ color: TINTA }}>
                    {nDias(cr.desde.dias)} como {cr.desde.rolLargo} al {cr.desde.pctTexto}
                  </strong>{" "}
                  ({formatoPesos(cr.desde.comision)}) +{" "}
                  <strong style={{ color: TINTA }}>
                    {nDias(cr.hasta.dias)} como {cr.hasta.rolLargo} al {cr.hasta.pctTexto}
                  </strong>{" "}
                  ({formatoPesos(cr.hasta.comision)}).
                  {mes.pctEfectivoTexto ? (
                    <> En total te quedó en {mes.pctEfectivoTexto} de todo lo vendido.</>
                  ) : null}
                </div>
              </>
            ) : rolMixto ? (
              // Hubo cambio de rol pero no llegó el desglose: se muestra la
              // comisión SIN afirmar un porcentaje único (que sería falso).
              <div style={{ fontSize: 12, color: APOYO, fontWeight: 600, marginTop: 3 }}>
                {mes.tramoInfo ? `${mes.tramoInfo.nombre} · ` : ""}Este mes cambiaste de cargo, así
                que tu comisión se calculó por días con dos porcentajes distintos.
                {mes.pctEfectivoTexto ? (
                  <> En total te quedó en {mes.pctEfectivoTexto} de todo lo vendido.</>
                ) : null}
              </div>
            ) : mes.comisionTexto ? (
              // Mes de un solo rol: `comisionTexto` ya es "2% sobre todo lo vendido".
              <div style={{ fontSize: 12, color: VERDE, fontWeight: 600, marginTop: 3 }}>
                {mes.tramoInfo ? `${mes.tramoInfo.nombre} · ` : ""}
                {mes.comisionTexto}, por ser {rolTxt}
              </div>
            ) : mes.tramoInfo ? (
              <div style={{ fontSize: 12, color: VERDE, fontWeight: 600, marginTop: 3 }}>
                {mes.tramoInfo.nombre}
              </div>
            ) : null}
            {sig && sig.comisionAlLlegar != null && (
              <div
                style={{
                  marginTop: 10,
                  padding: "10px 12px",
                  background: "#f0fdf9",
                  borderRadius: 9,
                  fontSize: 12.5,
                  color: VERDE,
                  fontWeight: 600,
                  lineHeight: 1.55,
                }}
              >
                {/* `sig.pctTexto` es el % del rol FINAL. En un mes con cambio de
                    rol NO es lo que cobraría (la pro-rata mezcla dos tarifas), así
                    que ahí se nombra el tramo y se muestra la plata — que sí sale
                    de calcComisionMensual con la pro-rata aplicada. */}
                🚀 Con <strong>{formatoPesos(sig.falta)}</strong> más{" "}
                {rolMixto ? (
                  <>
                    pasas al <strong>{sig.nombre}</strong>
                  </>
                ) : (
                  <>
                    subes al <strong>{sig.pctTexto}</strong>
                  </>
                )}{" "}
                — sobre <em>todo</em> lo vendido, no solo lo nuevo. Tu comisión pasaría a{" "}
                <strong>{formatoPesos(sig.comisionAlLlegar)}</strong>.
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ fontSize: 11.5, color: TENUE, margin: "-4px 0 14px", paddingLeft: 2 }}>
        Es lo que llevas hasta hoy · la cifra final se define al cerrar el mes
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 2) MI PUESTO EN VENTAS                                              */}
      {/* ------------------------------------------------------------------ */}
      <div style={S.card}>
        <div style={S.lbl}>Mi puesto en ventas · {ciudadTxt}</div>

        {!rk?.disponible || !rk.filas.length ? (
          <div style={{ fontSize: 12.5, color: APOYO, fontWeight: 600, lineHeight: 1.55 }}>
            El ranking de {nombreMes} todavía no está disponible.
          </div>
        ) : (
          <>
            {rk.filas.map((f) => (
              <div
                key={f.id}
                style={{
                  ...S.mini,
                  ...(f.esYo
                    ? { background: "#fffbeb", boxShadow: "inset 0 0 0 1.5px #fcd34d" }
                    : null),
                }}
              >
                <span
                  style={{
                    width: 20,
                    textAlign: "center",
                    fontWeight: 800,
                    flexShrink: 0,
                    color: f.medalla ? "#059669" : TENUE,
                  }}
                >
                  {f.medalla || f.n || "—"}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontWeight: 700, color: TINTA }}>
                  {f.esYo ? `TÚ · ${f.nombreCorto}` : f.nombreCorto}
                </span>
                <span
                  style={{
                    fontWeight: 800,
                    whiteSpace: "nowrap",
                    color: f.sinDato ? TENUE : TINTA,
                  }}
                >
                  {f.sinDato ? "no disponible" : formatoPesos(f.ventas)}
                </span>
              </div>
            ))}

            {rk.arriba && rk.faltaParaSubir != null ? (
              <div
                style={{
                  fontSize: 12,
                  color: APOYO,
                  fontWeight: 600,
                  marginTop: 8,
                  paddingTop: 8,
                  borderTop: `1px dashed ${LINEA}`,
                }}
              >
                Con <strong style={{ color: TINTA }}>{formatoPesos(rk.faltaParaSubir)}</strong> más
                pasas a {primerNombre(rk.arriba.nombre)} y subes al puesto {rk.miPosicion - 1}.
              </div>
            ) : rk.esPrimera ? (
              <div
                style={{
                  fontSize: 12,
                  color: "#059669",
                  fontWeight: 700,
                  marginTop: 8,
                  paddingTop: 8,
                  borderTop: `1px dashed ${LINEA}`,
                }}
              >
                🏆 Vas de primera en tu ciudad.
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 3) MI NOTA DEL MES + LOS 5 INDICADORES                              */}
      {/* ------------------------------------------------------------------ */}
      <div style={S.card}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 4 }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...S.lbl, marginBottom: 2 }}>Mi nota de {nombreMes}</div>
            <div style={{ fontSize: 11.5, color: APOYO, lineHeight: 1.45 }}>
              No cambia tu comisión — suma para el premio del trimestre
            </div>
          </div>
          <Badge nota={mes.nota ?? null} grande />
        </div>

        {/* --------------------------------------------------------------- */}
        {/* NOTA INCOMPLETA — falta un dato del sistema, no un desempeño     */}
        {/* --------------------------------------------------------------- */}
        {/* La nota del mes son dos mitades: comportamiento y ventas. Si las
            ventas no han llegado, el motor deja la nota final en null (antes
            devolvía un 1.00 de ventas armado con un cero inventado, que con el
            60% de peso hundía la nota a 2.5 y parecía una calificación real).
            Aquí se dice qué mitad falta, que la que sí está es suya, y que lo
            que falta lo trae el sistema — no ella. */}
        {mes.nota == null && notaComp != null && (
          <div
            style={{
              display: "flex",
              gap: 9,
              alignItems: "flex-start",
              background: "#f8fafc",
              border: `1px solid ${LINEA}`,
              borderRadius: 10,
              padding: "10px 12px",
              margin: "8px 0 2px",
            }}
          >
            <span style={{ fontSize: 15, lineHeight: 1.35, flexShrink: 0 }} aria-hidden="true">⏳</span>
            <div style={{ fontSize: 12.5, color: APOYO, fontWeight: 600, lineHeight: 1.6 }}>
              Tu nota de {nombreMes} todavía no está completa: se arma con tu{" "}
              <strong style={{ color: TINTA }}>comportamiento</strong> y con tus{" "}
              <strong style={{ color: TINTA }}>ventas</strong>, y las ventas del mes aún no
              llegan desde systemlap.
              <div style={{ marginTop: 6 }}>
                Tu comportamiento ya está y es{" "}
                <strong style={{ color: colorNota(notaComp) }}>{notaComp.toFixed(2)}</strong> —
                eso es tuyo y no cambia. Apenas entren las ventas aparece tu nota completa.
              </div>
              <div style={{ marginTop: 6, color: TENUE, fontSize: 12 }}>
                Es un dato que falta del sistema, no algo que hayas dejado de hacer.
              </div>
            </div>
          </div>
        )}

        <div style={{ borderTop: `1px dashed ${LINEA}`, marginTop: 8, paddingTop: 2 }}>
          {(mes.indicadores || []).map((ind, i, arr) => (
            <button
              key={ind.id}
              onClick={() => onIndicador && onIndicador(ind.id)}
              style={{
                ...S.indBoton,
                ...(i === arr.length - 1 ? { borderBottom: "none" } : null),
              }}
            >
              <span style={{ fontSize: 18, width: 24, textAlign: "center", flexShrink: 0 }}>
                {ind.emoji}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: TINTA }}>
                {ind.nombre}
              </span>
              <Badge nota={ind.nota} />
              <span style={{ color: "#a855f7", fontWeight: 800, fontSize: 17 }}>›</span>
            </button>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 4) EL BONO                                                          */}
      {/* ------------------------------------------------------------------ */}
      {/* El bono escalonado (hasta 0.8) SÓLO existe en la fórmula V2: en V1 la
          nota es 70/30 y `bonoVentas` ni se llama (src/lib/calculos.js). Pintar
          esta tarjeta en un mes V1 sería prometer puntos que no se pueden ganar. */}
      {mes.version !== "v1" && (
        <div
          style={{
            borderRadius: 16,
            padding: "16px 18px",
            marginTop: 12,
            lineHeight: 1.6,
            background: "#f7f4ff",
            border: "1px solid #ddd3f5",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 5, color: LAVANDA_TXT }}>
            Puntos extra que puedes ganarte
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: LAVANDA_TXT }}>
            Si cierras el mes con tu comportamiento en <strong>4.50 o más</strong> y pasas tu meta,
            sumas hasta <strong>0.8 puntos</strong>.{" "}
            {notaComp == null ? (
              <>Tu nota de comportamiento de {nombreMes} todavía no está disponible.</>
            ) : notaComp >= 4.5 ? (
              <>
                Vas en {notaComp.toFixed(2)} — ya tienes el comportamiento. Ahora es pasar tu meta.
              </>
            ) : (
              <>
                Vas en {notaComp.toFixed(2)} — te faltan {(4.5 - notaComp).toFixed(2)}.
              </>
            )}
            {/* La meta se carga por ciudad desde Admin. Si todavía no está, no se
                puede decir "pasa tu meta" como si existiera un número. */}
            {mes.meta == null ? (
              <> Tu meta de {nombreMes} todavía no está cargada.</>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
