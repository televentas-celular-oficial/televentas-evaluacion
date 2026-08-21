// Mi mes — pantalla de la vendedora.
// Especificación: el mockup aprobado por el dueño (agosto 2026).
//
// Orden fijo:
//   1. Vendido en <mes>      — tarjeta crema/dorada, cifra centrada, BARRA CON TRAMOS
//   2. Ganas hoy + Tu ritmo  — dos tarjetas pequeñas del mismo tamaño
//   3. Mi puesto en ventas   — ranking de SU ciudad
//   4. Tu nota de <mes>      — tarjeta crema/dorada, nota centrada, barra 1.00–5.00
//   5. El desglose           — comportamiento / ventas, cada uno con su barrita
//   6. Los indicadores       — nombre, nota y flecha, clicables
//
// REGLAS QUE SE RESPETAN AQUÍ
// - Cero fórmulas propias: todo sale de derivar.js → src/lib/calculos.js.
//   Los tramos, el piso de Medellín y el % por rol se leen, no se recalculan.
// - Meses cerrados: esta pantalla SIEMPRE mira el mes EN CURSO (hoyColombia()),
//   así que nunca toca la nota de un mes cerrado.
// - Dato que no existe → null → "no disponible". Nunca un 0 disfrazado de real.
//   OJO: calcNotaMensual devuelve `real = vendidas[id] ?? 0`, o sea un CERO DURO
//   cuando el dato no existe. Por eso la existencia de las ventas se decide con
//   derivarRankingMesCiudad (`misVentas`, que sí devuelve null), no con `mes.ventas`.
//   Y por eso la comisión NO se pinta cuando no hay ventas: sería un $0 inventado.
// - Cifras de plata SIEMPRE completas: formatoPesos(n) → "$5.678.400". Nunca formatoK.
// - CIUDAD: se resuelve o no se resuelve. NO hay ciudad por defecto (ver abajo).
// - EL PISO DE $15.000.000 ES SÓLO DE MEDELLÍN. La marca del piso en la barra y
//   la línea "te faltan … para el piso" cuelgan de `piso.aplica`, que en
//   derivar.js es `ciudad === "MED"`. En Bogotá no se nombra el piso en ninguna
//   parte de esta pantalla.
// - Cero rojo. Lleno contra hueco, nunca alarma.

import { useDatos } from "../data/DatosContext.jsx";
import { derivarMesDeVendedora, derivarRankingMesCiudad } from "../data/derivar.js";
import { formatoPesos, primerNombre, hoyColombia, PISO_MED, TRAMOS_2026 } from "../lib/helpers.js";

// Paleta Valkyrias — sólo colores.
// Los papeles de color viven en valquirias.css (:root). Aquí sólo se nombran.
const NOMBRE_CIUDAD = { MED: "Medellín", BOG: "Bogotá" };
const VERDE = "var(--vk-bien)";            // "verde de lo ganado y de las barras"
const TINTA = "var(--vk-titulo)";          // Tinta
const CIFRA = "var(--vk-cifra)";           // Tinta — cifras y notas
const APOYO = "var(--vk-secundario)";      // Niebla
const TENUE = "var(--vk-tenue)";           // Sin dato
const LINEA = "var(--vk-borde)";           // Borde
const FONDO = "var(--vk-fondo)";           // Lienzo
const PAPEL = "var(--vk-tarjeta)";         // Papel
const NEUTRO = "var(--vk-neutro)";         // Gris de resalte — riel de las barras

// La tarjeta destacada: crema con borde dorado. Es la misma pareja de papeles
// que ya usa la tarjeta que explica el indicador (--vk-lavanda-*).
const CREMA = "var(--vk-noche)";           // #FFFBEB — crema
const ORO = "var(--vk-metal)";             // #FCD34D — el dorado del borde
const ORO_FILO = "var(--vk-metal-borde)";  // #B45309 — el filo del oro
const C_TXT = "var(--vk-noche-texto)";     // tinta sobre la crema
const C_APOYO = "var(--vk-noche-apoyo)";   // secundario sobre la crema

// Escala de notas: el canal principal es lleno contra hueco, no el tono.
const colorNota = (n) =>
  n >= 4.5 ? "var(--vk-bien-texto)" : n >= 3.5 ? "var(--est-atencion)" : n >= 2.5 ? "var(--est-medio)" : "var(--vk-medio)";
const fondoNota = (n) =>
  n >= 4.5 ? "var(--vk-bien-fondo)" : n >= 3.5 ? "var(--vk-tarjeta)" : n >= 2.5 ? "var(--est-medio-fondo)" : "var(--vk-neutro)";
const anilloNota = (n) => (n >= 3.5 && n < 4.5 ? "inset 0 0 0 1.5px var(--est-atencion-borde)" : "none");

const capitalizar = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
const nDias = (n) => (n === 1 ? "1 día" : `${n} días`);

// Nota → % de la barra de 1.00 a 5.00 (el rango real de una nota).
const pctNota = (n) => Math.max(0, Math.min(100, ((n - 1) / 4) * 100));

// Una etiqueta de marca centrada bajo su tramo, sin salirse de la barra.
const anclaje = (p) =>
  p <= 12
    ? { left: 0, transform: "none" }
    : p >= 88
    ? { left: `${p}%`, transform: "translateX(-100%)" }
    : { left: `${p}%`, transform: "translateX(-50%)" };

const S = {
  card: {
    background: PAPEL,
    border: `1px solid ${LINEA}`,
    borderRadius: 13,
    padding: 16,
    marginBottom: 10,
  },
  // La destacada: crema con borde dorado.
  cardOro: {
    background: CREMA,
    border: `1px solid ${ORO}`,
    borderLeft: `4px solid ${ORO_FILO}`,
    borderRadius: "0 13px 13px 0",
    padding: 16,
    marginBottom: 10,
  },
  lbl: {
    fontSize: 12,
    fontWeight: 800,
    color: APOYO,
    textTransform: "uppercase",
    letterSpacing: ".7px",
    marginBottom: 4,
    display: "block",
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

// ---------------------------------------------------------------------------
// BARRA CON MARCAS
// ---------------------------------------------------------------------------
// `pct` es dónde va el relleno. `marcas` son puntos FIJOS de la escala (el piso,
// el arranque de un tramo, el 4.50 del premio): una raya discreta sobre el riel
// y su etiqueta debajo. `fila` reparte las etiquetas en dos alturas cuando dos
// marcas quedan tan cerca que sus textos se pisarían.
function BarraMarcada({ pct, marcas = [], alto = 10, relleno = VERDE, riel = NEUTRO }) {
  const filas = marcas.length ? Math.max(...marcas.map((m) => m.fila || 0)) + 1 : 0;
  return (
    <div>
      <div style={{ position: "relative", height: alto, marginTop: 12 }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: riel,
            borderRadius: alto / 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "block",
              height: "100%",
              width: `${pct}%`,
              background: relleno,
              borderRadius: alto / 2,
            }}
          />
        </div>
        {marcas.map((m) => (
          <span
            key={m.clave}
            style={{
              position: "absolute",
              left: `${m.pct}%`,
              top: -3,
              marginLeft: -1,
              width: 2,
              height: alto + 6,
              borderRadius: 1,
              background: ORO_FILO,
            }}
          />
        ))}
      </div>
      {filas > 0 && (
        <div style={{ position: "relative", height: filas * 15, marginTop: 6 }}>
          {marcas.map((m) => (
            <span
              key={m.clave}
              style={{
                position: "absolute",
                top: (m.fila || 0) * 15,
                whiteSpace: "nowrap",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: ".2px",
                color: C_APOYO,
                ...anclaje(m.pct),
              }}
            >
              {m.texto}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Una de las dos tarjetas pequeñas de la fila 2. Las dos miden lo mismo.
function TarjetaChica({ titulo, cifra, pie, apagada = false }) {
  return (
    <div style={{ ...S.card, flex: 1, minWidth: 0, marginBottom: 0, padding: 14 }}>
      <div style={{ ...S.lbl, fontSize: 11, marginBottom: 5 }}>{titulo}</div>
      <div
        style={{
          fontSize: apagada ? 14 : 19,
          fontWeight: 800,
          letterSpacing: apagada ? 0 : "-.4px",
          color: apagada ? TENUE : CIFRA,
          lineHeight: 1.2,
        }}
      >
        {cifra}
      </div>
      {pie ? (
        <div style={{ fontSize: 11, color: APOYO, fontWeight: 600, marginTop: 5, lineHeight: 1.45 }}>
          {pie}
        </div>
      ) : null}
    </div>
  );
}

// Una fila del desglose: nombre · peso — barrita — nota.
function FilaDesglose({ titulo, peso, nota, motivo, ultima = false }) {
  return (
    <div
      style={{
        padding: "10px 0",
        borderBottom: ultima ? "none" : `1px dashed ${LINEA}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: TINTA, whiteSpace: "nowrap" }}>
          {titulo} <span style={{ color: APOYO, fontWeight: 700 }}>· {peso}%</span>
        </span>
        <span style={{ flex: 1, minWidth: 40 }}>
          <span
            style={{
              display: "block",
              height: 6,
              borderRadius: 3,
              background: NEUTRO,
              overflow: "hidden",
              ...(nota == null
                ? { outline: "1.5px dashed var(--est-sin-dato)", outlineOffset: "-1.5px" }
                : null),
            }}
          >
            {nota != null && (
              <span
                style={{
                  display: "block",
                  height: "100%",
                  width: `${pctNota(nota)}%`,
                  borderRadius: 3,
                  background: VERDE,
                }}
              />
            )}
          </span>
        </span>
        <Badge nota={nota} />
      </div>
      {nota == null && motivo ? (
        <div style={{ fontSize: 11.5, color: APOYO, fontWeight: 600, marginTop: 6, lineHeight: 1.5 }}>
          {motivo}
        </div>
      ) : null}
    </div>
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
        background: hay ? fondoNota(nota) : PAPEL,
        color: hay ? colorNota(nota) : TENUE,
        boxShadow: hay ? anilloNota(nota) : "none",
        // Sin dato: hueco con borde punteado, por dentro para no mover nada.
        ...(hay ? null : { outline: "1.5px dashed var(--est-sin-dato)", outlineOffset: "-1.5px" }),
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
  // derivar.js ya hace lo correcto: con ciudad desconocida devuelve
  // `ciudadDesconocida: true` y pone `comision` y `piso` en null. Traducir eso a
  // "es de Medellín" sería inventar el dato aquí. Sin ciudad no hay comisión que
  // mostrar: ni piso, ni tramo en pesos, ni meta, ni nota de ventas. Empty state.
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
            borderLeft: "4px solid var(--est-atencion-borde)",
            borderRadius: "0 13px 13px 0",
          }}
        >
          <div style={S.lbl}>No podemos mostrarte tu mes</div>
          <div style={{ fontSize: 13.5, color: APOYO, fontWeight: 600, lineHeight: 1.6 }}>
            No pudimos determinar tu ciudad, y sin ella no hay forma de calcular bien tu
            comisión: Medellín y Bogotá tienen reglas distintas — Medellín tiene un piso de{" "}
            <strong style={{ color: CIFRA }}>{formatoPesos(PISO_MED)}</strong> y Bogotá no.
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

  const ciudadTxt = NOMBRE_CIUDAD[ciudad];

  // ¿EXISTE el dato de ventas? (null-safe: ver nota de arriba)
  const hayVentas = !!(rk?.disponible && rk?.misVentas != null);
  const ventas = hayVentas ? mes.ventas : null;

  const piso = mes.piso || {};
  const sig = mes.siguienteTramoInfo || null;
  const notaComp = mes.notaComportamiento ?? null;

  // --------------------------------------------------------------------------
  // LAS DOS MITADES DE LA NOTA — se muestran, no se recalculan
  // --------------------------------------------------------------------------
  const esV1 = mes.version === "v1";
  const pesoComp = esV1 ? 70 : 40;
  const pesoVent = esV1 ? 30 : 60;
  const notaVent = mes.notaVentas ?? null;
  const hayMeta = mes.meta != null && mes.meta > 0;

  // --------------------------------------------------------------------------
  // LA BARRA CON TRAMOS — la escala
  // --------------------------------------------------------------------------
  // Escala FIJA de $0 hasta donde arranca el tramo 3 (TRAMOS_2026[2].min). Es la
  // única que deja las tres puertas dentro del mismo riel y no se mueve de un
  // mes a otro: la barra significa siempre lo mismo. Con la escala pegada al
  // tramo siguiente (0 → tramo 2) la barra se re-escalaría al cruzar cada tramo
  // y el avance daría un salto hacia atrás; con una escala pegada a sus ventas,
  // el piso viajaría de sitio cada día.
  // Números leídos de TRAMOS_2026 y de PISO_MED — aquí no se calcula ninguno.
  // Si algún día vende por encima del tramo 3, la escala se estira hasta su
  // cifra para que el relleno no mienta quedándose clavado en el 100%.
  const topeTramos = TRAMOS_2026[2].min;
  const escala = hayVentas ? Math.max(topeTramos, ventas) : topeTramos;
  const pctDe = (v) => Math.max(0, Math.min(100, (v / escala) * 100));

  const marcasTramos = [];
  // El piso SÓLO existe en Medellín (`piso.aplica` es `ciudad === "MED"`).
  if (piso.aplica && piso.monto > 0) {
    marcasTramos.push({
      clave: "piso",
      pct: pctDe(piso.monto),
      fila: 0,
      texto: `${formatoPesos(piso.monto)} piso`,
    });
  }
  marcasTramos.push({
    clave: "t2",
    pct: pctDe(TRAMOS_2026[1].min),
    // Con piso, las dos marcas quedan a 11 puntos: sus etiquetas se pisarían.
    fila: piso.aplica ? 1 : 0,
    texto: `${formatoPesos(TRAMOS_2026[1].min)} tramo 2`,
  });
  marcasTramos.push({
    clave: "t3",
    pct: pctDe(TRAMOS_2026[2].min),
    fila: 0,
    texto: `${formatoPesos(TRAMOS_2026[2].min)} tramo 3`,
  });

  // La única línea bajo la barra. Todas las cifras vienen del motor.
  const lineaFalta = !hayVentas
    ? null
    : piso.aplica && !piso.superado && piso.falta > 0
    ? `Te faltan ${formatoPesos(piso.falta)} para el piso`
    : sig && sig.falta > 0
    ? `Te faltan ${formatoPesos(sig.falta)} para el ${sig.nombre.toLowerCase()}`
    : mes.tramoInfo
    ? `Estás en el ${mes.tramoInfo.nombre.toLowerCase()}, el más alto`
    : null;

  // --------------------------------------------------------------------------
  // GANAS HOY
  // --------------------------------------------------------------------------
  // Sin ventas NO se pinta comisión: `calcNotaMensual` devuelve un cero duro
  // cuando el dato falta, y ese $0 no es real. Se dice "no disponible".
  const comisionHoy = hayVentas ? mes.comision : null;
  // El hito de abajo. `comisionAlLlegar` sale de calcComisionMensual con la
  // pro-rata ya aplicada, así que también es verdad en un mes con cambio de
  // cargo — por eso aquí no se afirma ningún porcentaje.
  const hito = !hayVentas
    ? null
    : piso.aplica && !piso.superado && piso.comisionAlLlegar != null
    ? { que: "al llegar al piso", monto: piso.comisionAlLlegar }
    : sig && sig.comisionAlLlegar != null
    ? { que: `al llegar al ${sig.nombre.toLowerCase()}`, monto: sig.comisionAlLlegar }
    : null;

  // --------------------------------------------------------------------------
  // TU RITMO
  // --------------------------------------------------------------------------
  // `mes.ventas` es el acumulado que sincroniza systemlap, que cierra con el día
  // ANTERIOR (el de hoy todavía se está vendiendo). Por eso el promedio se saca
  // sobre los días YA CERRADOS (dia - 1) y los días que quedan incluyen hoy:
  // los dos números suman el mes completo y no se pisan.
  // La división es la misma de siempre. Lo que cambió es el guard: antes exigía
  // `ventas > 0` y con un CERO REAL escondía el ritmo detrás de "todavía no hay
  // días cerrados", que era falso — los días estaban cerrados, la venta fue 0.
  // Ahora el ritmo se calcula siempre que HAYA dato de ventas y días cerrados;
  // un $0 al día se dice, y la ausencia de dato se dice aparte.
  const diasCerrados = Math.max(0, mes.dia - 1);
  const diasRestantes = Math.max(0, mes.diasMes - mes.dia + 1);
  const ritmoActual =
    hayVentas && diasCerrados > 0 ? Math.round(ventas / diasCerrados) : null;
  const motivoRitmo = !hayVentas ? "sin ventas cargadas" : "aún no hay días cerrados";

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
      {/* 1) VENDIDO EN <MES>                                                 */}
      {/* ------------------------------------------------------------------ */}
      <div style={S.cardOro}>
        <div style={{ ...S.lbl, color: C_APOYO, textAlign: "center" }}>
          Vendido en {nombreMes}
        </div>

        {!hayVentas ? (
          // Dato inexistente: no se inventa ni un peso ni un cero.
          <div style={{ fontSize: 13, color: C_APOYO, fontWeight: 600, lineHeight: 1.55 }}>
            Tus ventas de {nombreMes} todavía no llegan desde systemlap. Apenas lleguen
            aparecen aquí con tu comisión.
          </div>
        ) : (
          <>
            <div
              style={{
                fontSize: 30,
                fontWeight: 800,
                letterSpacing: "-.8px",
                color: C_TXT,
                textAlign: "center",
              }}
            >
              {formatoPesos(ventas)}
            </div>

            <BarraMarcada pct={pctDe(ventas)} marcas={marcasTramos} />

            {lineaFalta && (
              <div
                style={{
                  fontSize: 12.5,
                  color: C_TXT,
                  fontWeight: 700,
                  marginTop: 10,
                  textAlign: "center",
                  lineHeight: 1.5,
                }}
              >
                {lineaFalta}
              </div>
            )}
          </>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 2) GANAS HOY · TU RITMO                                             */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "stretch" }}>
        <TarjetaChica
          titulo="Ganas hoy"
          apagada={comisionHoy == null}
          cifra={comisionHoy != null ? formatoPesos(comisionHoy) : "no disponible"}
          pie={hito ? `${hito.que}: ${formatoPesos(hito.monto)}` : null}
        />
        <TarjetaChica
          titulo="Tu ritmo"
          apagada={ritmoActual == null}
          cifra={ritmoActual != null ? formatoPesos(ritmoActual) : "no disponible"}
          pie={
            ritmoActual != null ? `al día · faltan ${nDias(diasRestantes)}` : motivoRitmo
          }
        />
      </div>

      {/* De aquí abajo, en un computador las tarjetas se acomodan de a dos
          (`.v-cols`). El orden del DOM NO cambia: la rejilla llena de
          izquierda a derecha, así que se leen en la misma secuencia que en el
          celular. En pantalla angosta la clase no hace nada. Las dos tarjetas
          de arriba se quedan a lo ancho: la barra de ventas necesita el ancho
          completo para que las marcas del piso y del tramo no se apelmacen. */}
      <div className="v-cols">

      {/* ------------------------------------------------------------------ */}
      {/* 3) MI PUESTO EN VENTAS                                              */}
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
                  // "TÚ" se resalta en crema con borde dorado, igual que las
                  // dos tarjetas destacadas de esta pantalla.
                  ...(f.esYo
                    ? { background: CREMA, boxShadow: `inset 0 0 0 1.5px ${ORO}` }
                    : null),
                }}
              >
                <span
                  style={{
                    width: 20,
                    textAlign: "center",
                    fontWeight: 800,
                    flexShrink: 0,
                    color: f.medalla ? VERDE : TENUE,
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
                    color: f.sinDato ? TENUE : CIFRA,
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
                Con <strong style={{ color: CIFRA }}>{formatoPesos(rk.faltaParaSubir)}</strong> más
                pasas a {primerNombre(rk.arriba.nombre)}.
              </div>
            ) : rk.esPrimera ? (
              <div
                style={{
                  fontSize: 12,
                  color: VERDE,
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
      {/* 4) TU NOTA DE <MES>                                                 */}
      {/* ------------------------------------------------------------------ */}
      <div style={S.cardOro}>
        <div style={{ ...S.lbl, color: C_APOYO, textAlign: "center" }}>
          Tu nota de {nombreMes}
        </div>

        <div
          style={{
            fontSize: 34,
            fontWeight: 800,
            letterSpacing: "-1px",
            textAlign: "center",
            color: mes.nota != null ? C_TXT : TENUE,
          }}
        >
          {mes.nota != null ? mes.nota.toFixed(2) : "—"}
        </div>

        {/* Escala de la nota: 1.00 a 5.00, con el 4.50 del premio marcado.
            Sin nota la barra queda hueca — la marca sigue diciendo dónde está
            la puerta, que es lo que se quería mostrar. */}
        <BarraMarcada
          pct={mes.nota != null ? pctNota(mes.nota) : 0}
          marcas={[{ clave: "premio", pct: pctNota(4.5), fila: 0, texto: "4.50 premio" }]}
        />

        {/* --------------------------------------------------------------- */}
        {/* NOTA INCOMPLETA — falta un dato del sistema, no un desempeño     */}
        {/* --------------------------------------------------------------- */}
        {/* La nota del mes son dos mitades. Si las ventas no han llegado, el
            motor deja la nota final en null. Se dice qué mitad falta, que la
            que sí está es suya, y que lo que falta lo trae el sistema. */}
        {mes.nota == null && (
          <div
            style={{
              fontSize: 12,
              color: C_APOYO,
              fontWeight: 600,
              lineHeight: 1.55,
              marginTop: 10,
              textAlign: "center",
            }}
          >
            {notaComp != null ? (
              <>
                Falta la mitad de ventas para completarla. Tu comportamiento ya está y es{" "}
                <strong style={{ color: C_TXT }}>{notaComp.toFixed(2)}</strong> — eso es tuyo y no
                cambia. Es un dato que falta del sistema, no algo que hayas dejado de hacer.
              </>
            ) : (
              <>Tu nota de {nombreMes} todavía no está disponible.</>
            )}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 5) EL DESGLOSE                                                      */}
      {/* ------------------------------------------------------------------ */}
      {/* Nada de esto se calcula aquí: notaComportamiento y notaVentas ya
          vienen de calcNotaMensual. Sólo se nombran y se les pone su peso. */}
      <div style={{ ...S.card, paddingTop: 6, paddingBottom: 6 }}>
        <FilaDesglose
          titulo="Comportamiento"
          peso={pesoComp}
          nota={notaComp}
          motivo={`Tu comportamiento de ${nombreMes} todavía no está disponible.`}
        />
        <FilaDesglose
          titulo="Ventas"
          peso={pesoVent}
          nota={notaVent}
          ultima
          motivo={
            !hayMeta
              ? `Tu meta de ${nombreMes} todavía no está cargada.`
              : `Tus ventas de ${nombreMes} todavía no llegan desde systemlap.`
          }
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 6) LOS INDICADORES                                                  */}
      {/* ------------------------------------------------------------------ */}
      {(mes.indicadores || []).length > 0 && (
        <div style={{ ...S.card, paddingTop: 12, paddingBottom: 6 }}>
          <div style={{ ...S.lbl, fontSize: 11, color: TENUE }}>
            Mis {mes.indicadores.length} indicadores
          </div>
          {mes.indicadores.map((ind, i, arr) => (
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
              <span style={{ color: APOYO, fontWeight: 800, fontSize: 17 }}>›</span>
            </button>
          ))}
        </div>
      )}

      </div>{/* /.v-cols */}
    </div>
  );
}
