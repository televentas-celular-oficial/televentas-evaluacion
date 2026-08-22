// Piezas compartidas de las pantallas de la vendedora.
//
// Son las piezas que "Mi mes" (MiMes.jsx) ya tenía aprobadas y que "Mi
// trimestre" reusa tal cual, para que las dos pantallas se vean como la misma
// app: la tarjeta crema con borde dorado, la barra con marcas, el badge de la
// nota y el botón de volver.
//
// ⚠️ MiMes.jsx TODAVÍA tiene su propia copia de BarraMarcada y Badge. No se
// migró porque ese archivo está congelado (no se toca en esta tarea). Cuando el
// dueño lo autorice, MiMes puede importar de aquí y borrar sus copias: los
// cuerpos son idénticos, así que el cambio es sólo quitar y añadir un import.
//
// Reglas que se respetan aquí:
// - Cero hex escritos a mano: todos los colores salen de valquirias.css.
// - Cero rojo. Un dato que falta es un HUECO punteado, nunca una alarma.

// --- Papeles ---------------------------------------------------------------
export const VERDE = "var(--vk-bien)";
export const TINTA = "var(--vk-titulo)";
export const CIFRA = "var(--vk-cifra)";
export const APOYO = "var(--vk-secundario)";
export const TENUE = "var(--vk-tenue)";
export const LINEA = "var(--vk-borde)";
export const FONDO = "var(--vk-fondo)";
export const PAPEL = "var(--vk-tarjeta)";
export const NEUTRO = "var(--vk-neutro)";

// La tarjeta destacada: crema con borde dorado.
export const CREMA = "var(--vk-noche)";
export const ORO = "var(--vk-metal)";
export const ORO_FILO = "var(--vk-metal-borde)";
export const C_TXT = "var(--vk-noche-texto)";
export const C_APOYO = "var(--vk-noche-apoyo)";

// --- Escala de notas: lleno contra hueco, no el tono -----------------------
export const colorNota = (n) =>
  n >= 4.5 ? "var(--vk-bien-texto)" : n >= 3.5 ? "var(--est-atencion)" : n >= 2.5 ? "var(--est-medio)" : "var(--vk-medio)";
export const fondoNota = (n) =>
  n >= 4.5 ? "var(--vk-bien-fondo)" : n >= 3.5 ? "var(--vk-tarjeta)" : n >= 2.5 ? "var(--est-medio-fondo)" : "var(--vk-neutro)";
export const anilloNota = (n) =>
  n >= 3.5 && n < 4.5 ? "inset 0 0 0 1.5px var(--est-atencion-borde)" : "none";

// Nota → % de la barra de 1.00 a 5.00 (el rango real de una nota).
export const pctNota = (n) => Math.max(0, Math.min(100, ((n - 1) / 4) * 100));

// Una etiqueta de marca centrada bajo su punto, sin salirse de la barra.
export const anclaje = (p) =>
  p <= 12
    ? { left: 0, transform: "none" }
    : p >= 88
    ? { left: `${p}%`, transform: "translateX(-100%)" }
    : { left: `${p}%`, transform: "translateX(-50%)" };

// --- Estilos base compartidos ---------------------------------------------
export const S_BASE = {
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
  // El resalte de "TÚ": el mismo crema con filo dorado de la tarjeta destacada.
  miniYo: { background: CREMA, boxShadow: `inset 0 0 0 1.5px ${ORO}` },
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
  pieCard: {
    fontSize: 12,
    color: APOYO,
    fontWeight: 600,
    marginTop: 9,
    paddingTop: 9,
    borderTop: `1px dashed ${LINEA}`,
    lineHeight: 1.55,
  },
};

// EL botón de volver de toda la app. Un solo aspecto: la píldora gris de
// `.v-back-btn` en valquirias.css. Antes había CINCO implementaciones distintas
// —esta, una copia en MiMes, otra en MiCash, otra en el panel y otra en el
// ingreso diario— y se veían todas diferentes.
export function BotonVolver({ onVolver, texto = "‹ Volver" }) {
  return (
    <div style={{ padding: "0 0 12px" }}>
      <button className="v-back-btn" onClick={onVolver}>{texto}</button>
    </div>
  );
}


// ---------------------------------------------------------------------------
// BARRA CON MARCAS
// ---------------------------------------------------------------------------
// `pct` es dónde va el relleno. `marcas` son puntos FIJOS de la escala (el piso,
// el arranque de un tramo, el 4.50 del premio): una raya discreta sobre el riel
// y su etiqueta debajo. `fila` reparte las etiquetas en dos alturas cuando dos
// marcas quedan tan cerca que sus textos se pisarían.
export function BarraMarcada({ pct, marcas = [], alto = 10, relleno = VERDE, riel = NEUTRO }) {
  // Sólo se reserva alto para etiquetas si alguna marca TRAE etiqueta. Sin esto,
  // una barra de marcas sin texto dejaba una franja vacía debajo.
  const conTexto = marcas.filter((m) => m.texto);
  const filas = conTexto.length ? Math.max(...conTexto.map((m) => m.fila || 0)) + 1 : 0;
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
          {conTexto.map((m) => (
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

// El badge de una nota. Sin dato: hueco con borde punteado, nunca un 0.
export function Badge({ nota, grande = false, extra = null }) {
  const hay = nota !== null && nota !== undefined;
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
        ...(hay ? null : { outline: "1.5px dashed var(--est-sin-dato)", outlineOffset: "-1.5px" }),
        fontSize: grande ? 23 : 13,
        minWidth: grande ? 72 : 42,
        padding: grande ? "8px 13px" : "3px 10px",
        ...extra,
      }}
    >
      {hay ? Number(nota).toFixed(2) : "—"}
    </span>
  );
}
