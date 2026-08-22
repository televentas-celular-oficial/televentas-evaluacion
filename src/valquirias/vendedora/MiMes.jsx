// Mi mes — pantalla de la vendedora.
// Especificación: el mockup aprobado por el dueño (agosto 2026).
//
// Orden fijo:
//   1. Vendido en <mes>      — tarjeta crema/dorada, cifra centrada, BARRA CON TRAMOS
//   2. Ganas hoy + Tu promedio — dos tarjetas pequeñas del mismo tamaño
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
import { formatoPesos, primerNombre, hoyColombia, PISO_MED, tramosDe } from "../lib/helpers.js";
import { BarraMarcada } from "../common/piezas.jsx";
import { hitoPendiente, marcarHito, periodoMes, nivelDelMes } from "../lib/hitos.js";
import { useState, useEffect } from "react";

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

// El botón de volver es UNO SOLO en toda la app: `.v-back-btn`. Aquí vivía una
// copia con su propio aspecto — texto gris sin fondo — que se veía distinta de
// la píldora gris del resto.
function BotonVolver({ onVolver }) {
  return (
    <div style={{ padding: "0 0 12px" }}>
      <button className="v-back-btn" onClick={onVolver}>‹ Volver</button>
    </div>
  );
}


// La copia local de BarraMarcada se borró el 22-ago-2026: era idéntica a la de
// common/piezas.jsx salvo el `export`, y al darle el barrido y los dos estados
// de marca, mantener dos copias garantizaba que la puerta se encendiera en una
// pantalla y en la otra no. Ahora se importa.

// Una de las dos tarjetas pequeñas de la fila 2. Las dos miden lo mismo.
// `saltar` es el día que cruzó una puerta: la cifra escala y vuelve, una sola
// vez. No cuenta ni cambia de color — salta y se queda. Es el golpe de vista con
// el ojo ya bajando de la barra, y es donde está la plata.
function TarjetaChica({ titulo, cifra, pie, apagada = false, saltar = false }) {
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
        {saltar && !apagada ? <span className="v-salta">{cifra}</span> : cifra}
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
  // LA PUERTA SE ENCIENDE — cruzar un escalón de plata
  // --------------------------------------------------------------------------
  // Aprobado por Luis el 22-ago-2026 (docs/prototipo-celebraciones.html).
  //
  // ⚠️ LOS DOS HOOKS VAN AQUÍ ARRIBA, NO JUNTO A LA BARRA. Unas líneas más abajo
  // hay un return temprano (ciudad desconocida) y un hook declarado después de
  // un return se ejecuta en unos renders y no en otros: React lo prohíbe y la
  // pantalla revienta. Todo lo que necesitan sale de `mes` y `rk`, que ya están.
  //
  // Se decide UNA sola vez, al montar. Escribir después ya no cambia la
  // decisión, así que ir al Home y volver no vuelve a disparar el momento.
  // Sin confeti a propósito: cruzar el piso y el tramo 2 en un mismo mes son dos
  // momentos, y si cae confeti en todo deja de significar algo. El confeti se
  // reserva para el 4.50 del trimestre, que pasa una vez cada tres meses.
  const tablaTramos = tramosDe(año);
  const nivelHoy = nivelDelMes({
    hayVentas: !!(rk?.disponible && rk?.misVentas != null),
    tramoInfo: mes?.tramoInfo,
    piso: mes?.piso,
    tabla: tablaTramos,
  });
  const periodo = periodoMes(año, nMes);
  const [celebraNivel] = useState(() =>
    hitoPendiente("mes", vendedora?.id, periodo, nivelHoy) ? nivelHoy : null
  );
  useEffect(() => {
    marcarHito("mes", vendedora?.id, periodo, nivelHoy);
  }, [vendedora?.id, periodo, nivelHoy]);

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
  // Escala FIJA de $0 hasta donde arranca el último tramo. Es la
  // única que deja las tres puertas dentro del mismo riel y no se mueve de un
  // mes a otro: la barra significa siempre lo mismo. Con la escala pegada al
  // tramo siguiente (0 → tramo 2) la barra se re-escalaría al cruzar cada tramo
  // y el avance daría un salto hacia atrás; con una escala pegada a sus ventas,
  // el piso viajaría de sitio cada día.
  // Números leídos de la tabla de tramos del año y de PISO_MED — aquí no se
  // calcula ninguno. Si algún día vende por encima del último tramo, la escala
  // se estira hasta su cifra para que el relleno no mienta clavado en el 100%.
  const topeTramos = tablaTramos.at(-1).min;
  const escala = hayVentas ? Math.max(topeTramos, ventas) : topeTramos;
  const pctDe = (v) => Math.max(0, Math.min(100, (v / escala) * 100));

  // LAS MARCAS VAN SIN ETIQUETA (regla del dueño, 21-ago-2026).
  // Tres cifras apiladas bajo la barra —piso, tramo 2, tramo 3— se veían
  // amontonadas y le quitaban a la barra lo que la hace útil: que se entienda
  // de un vistazo. Ellas ya saben qué son los tramos; para eso están las rayas.
  // La línea de "te faltan X para el tramo 3" se queda: esa sí dice algo que la
  // barra no puede decir.
  const marcasTramos = [];
  // El piso SÓLO existe en Medellín (`piso.aplica` es `ciudad === "MED"`).
  // `monto` es el peso que hay que pasar para cruzar esa raya. Va en el mismo
  // sitio donde se crea cada marca: fijarlo después, por índice, era una bomba
  // el día que alguien reordene los push.
  if (piso.aplica && piso.monto > 0) {
    marcasTramos.push({ clave: "piso", pct: pctDe(piso.monto), monto: piso.monto });
  }
  // Una raya por cada tramo salvo el primero, que arranca en $0.
  tablaTramos.slice(1).forEach((t, i) => {
    marcasTramos.push({ clave: `t${i + 2}`, pct: pctDe(t.min), monto: t.min });
  });

  // Puerta cruzada = muesca blanca con punto verde. Es ESTADO, se deriva de sus
  // ventas de hoy en cada render: si una devolución la baja, vuelve sola a ser
  // raya dorada, sin decir una palabra.
  marcasTramos.forEach((m) => { m.cruzada = hayVentas && ventas >= m.monto; });

  // Qué raya acaba de cruzar. Nivel 2 en Medellín es el piso; de ahí para
  // arriba, el tramo. (Nivel 2 en Bogotá es el tramo 1, que no tiene raya —
  // pero tampoco se celebra nunca: la siembra silenciosa lo deja sembrado.)
  const clavePuerta =
    celebraNivel == null ? null
    : celebraNivel === 2 ? (piso.aplica ? "piso" : null)
    : `t${celebraNivel - 1}`;
  const puerta = clavePuerta ? marcasTramos.find((m) => m.clave === clavePuerta) : null;
  if (puerta) puerta.nueva = true;

  const esUltimoTramo = celebraNivel != null && celebraNivel === tablaTramos.length + 1;
  const lineaHito = !puerta
    ? null
    : celebraNivel === 2
    ? `Pasaste el piso de ${formatoPesos(PISO_MED)}. Desde aquí tu mes empieza a generar comisión.`
    : esUltimoTramo
    ? `Entraste al ${mes.tramoInfo.nombre.toLowerCase()}, el más alto. No hay escalón por encima: tu porcentaje queda en el máximo sobre todo lo vendido.`
    : `Entraste al ${mes.tramoInfo.nombre.toLowerCase()}. Tu porcentaje sube y se aplica sobre todo lo que llevas vendido en ${nombreMes}.`;

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

  // --------------------------------------------------------------------------
  // EL SIGUIENTE ESCALÓN — cuánto necesita AL DÍA para alcanzarlo
  // --------------------------------------------------------------------------
  // "Tu promedio" decía lo que trae, pero no lo que necesita: sin eso la cifra
  // no le sirve para decidir nada. El objetivo NO es fijo, sube por la escalera
  // de la plata y siempre es el PRÓXIMO peldaño que le cambia lo que gana:
  //
  //   Medellín, bajo el piso  → el piso ($15.000.000). Debajo de él gana $0.
  //   Ya pasó el piso         → el tramo 2 (su % se duplica)
  //   Ya pasó el tramo 2      → el tramo 3
  //   Ya está en el tramo 3   → no hay más escalón: se le reconoce y punto
  //
  // En Bogotá no hay piso, así que la escalera arranca en el tramo 2.
  // Nada de esto se calcula aquí: `piso.falta` y `sig.falta` vienen del motor.
  const objetivo =
    piso.aplica && !piso.superado && piso.falta > 0
      ? { nombre: "el piso", falta: piso.falta }
      : sig && sig.falta > 0
      ? { nombre: sig.nombre.toLowerCase(), falta: sig.falta }
      : null;

  // Si hoy es el último día del mes no hay "al día" que calcular: lo que falta
  // hay que hacerlo hoy. Se dice así, no se divide por cero.
  const necesitaDiario =
    objetivo && diasRestantes > 0 ? Math.ceil(objetivo.falta / diasRestantes) : null;

  const pieProm =
    ritmoActual == null
      ? motivoRitmo
      : objetivo == null
      ? "al día · vas en el tramo más alto"
      : necesitaDiario == null
      ? `al día · hoy es el último`
      : `al día · para ${objetivo.nombre} necesitas ${formatoPesos(necesitaDiario)}`;

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

            {/* `desde` sólo va el día del cruce: el relleno arranca clavado en
                la raya recién pasada y barre hasta su cifra. Se ve pasar la
                puerta. Cualquier otro día la barra se pinta quieta. */}
            <BarraMarcada
              pct={pctDe(ventas)}
              marcas={marcasTramos}
              desde={puerta ? puerta.pct : null}
            />

            {/* La frase del momento. En el último tramo REEMPLAZA la línea de
                siempre en vez de apilarse: "estás en el tramo 3, el más alto"
                debajo de "entraste al tramo 3, el más alto" diría lo mismo dos
                veces. */}
            {lineaHito && (
              <div
                style={{
                  fontSize: 14,
                  color: C_TXT,
                  fontWeight: 800,
                  marginTop: 10,
                  textAlign: "center",
                  lineHeight: 1.45,
                }}
              >
                {lineaHito}
              </div>
            )}

            {lineaFalta && !esUltimoTramo && (
              <div
                style={{
                  fontSize: 12.5,
                  color: lineaHito ? C_APOYO : C_TXT,
                  fontWeight: 700,
                  marginTop: lineaHito ? 5 : 10,
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
      {/* EL MES CON CAMBIO DE CARGO SE EXPLICA (Luis, 22-ago-2026).
          El motor ya prorratea día a día cuando el ascenso cae dentro del mes, y
          ya arma la frase — sólo que ninguna pantalla la pintaba. Sin ella, la
          cifra de "Ganas hoy" no cuadra con ningún porcentaje que ella conozca:
          no es el 2% ni el 4%, es una mezcla, y parecía un error nuestro.
          `mes.cambioRol` viene null salvo que el cambio haya ocurrido de verdad
          ese mes, así que esto NO agrega una línea a los meses normales — que
          era la condición de Luis: informarlo SÓLO cuando sucede. En un mes
          corriente el pie sigue siendo el hito de siempre. */}
      <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "stretch" }}>
        <TarjetaChica
          titulo="Ganas hoy"
          apagada={comisionHoy == null}
          cifra={comisionHoy != null ? formatoPesos(comisionHoy) : "no disponible"}
          pie={
            mes.cambioRol
              ? mes.comisionTexto
              : hito
              ? `${hito.que}: ${formatoPesos(hito.monto)}`
              : null
          }
          saltar={!!puerta}
        />
        <TarjetaChica
          titulo="Tu promedio"
          apagada={ritmoActual == null}
          cifra={ritmoActual != null ? formatoPesos(ritmoActual) : "no disponible"}
          pie={pieProm}
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
      <div className="v-full" style={S.card}>
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

      {/* Columna izquierda: su nota y de qué está hecha. */}
      <div className="v-col">
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

        {/* Aquí iba la fecha de corte del comportamiento ("contado hasta el
            jueves 20"). Se quitó el 21-ago-2026: metida ENTRE las dos filas del
            desglose las partía por la mitad y se leía como un remiendo.
            El dato no se perdió — vive donde de verdad se necesita, en el
            detalle de cada indicador, justo debajo de la tira de días, que es
            donde los días que faltan al final parecerían perdidos.
            `mes.comportamientoAtrasado` y `mes.ultimoRegistroTexto` siguen
            saliendo del motor por si alguna vez se quiere volver a mostrar. */}
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

      </div>{/* /col izquierda */}

      {/* Columna derecha: los indicadores. Las dos columnas suman altura
          parecida, así que ninguna queda con un hueco al lado. */}
      <div className="v-col">
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

      </div>{/* /col derecha */}

      </div>{/* /.v-cols */}
    </div>
  );
}
