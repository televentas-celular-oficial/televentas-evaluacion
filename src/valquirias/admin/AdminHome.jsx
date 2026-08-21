// Panel del admin (Luis) — Valkyrias
// ============================================================================
// Especificación: docs/prototipo-3-perfiles.html → vPanel() y vVerComo().
//
// Sin barra de iconos arriba: el panel ES la navegación, igual que Carolina y
// la vendedora. De arriba a abajo:
//
//   1. Ventas del mes (total + MED + BOG)
//   2. El interruptor de acceso (config.whitelistActiva)
//   3. "Ver la app como vendedora" → selector agrupado por ciudad
//   4. SIETE tiles en tres grupos: El día a día · El mes · El trimestre
//   5. El recordatorio de que aquí no se administra a nadie
//
// LO QUE YA NO ESTÁ, POR DECISIÓN DEL DUEÑO: los tiles de "Vendedoras" y de
// "Magic Links / Acceso y correos". Las vendedoras se crean, se editan y se
// desactivan en systemlap, y el correo llega sincronizado desde allá. Lo único
// de acceso que vive aquí es el interruptor de arriba.
//
// El admin SÍ entra a Ingreso diario, y a diferencia de Carolina puede corregir
// días pasados.
//
// Nada de fórmulas propias: las pantallas hijas leen de data/derivar.js →
// src/lib/calculos.js. Aquí solo se suman las ventas ya sincronizadas, y cuando
// ese dato no existe se dice "no disponible" en vez de pintar un $0 falso.
// ============================================================================

import { useState, useEffect, useMemo } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase.js";
import { formatoPesos, hoyColombia } from "../lib/helpers.js";
import { claveMes } from "../../lib/calculos.js";
import { useDatos } from "../data/DatosContext.jsx";

import CargarMetas from "./CargarMetas.jsx";
import CerrarMes from "./CerrarMes.jsx";
import Backup from "./Backup.jsx";
import VistaTodas from "./VistaTodas.jsx";
import TrimestreAdmin from "./TrimestreAdmin.jsx";
import ConfigPremios from "./ConfigPremios.jsx";
import NominaComisiones from "./NominaComisiones.jsx";
import IngresoDiario from "../oficina/IngresoDiario.jsx";
import TabRankingIndicadores from "../tabs/TabRankingIndicadores.jsx";

// ── Paleta del prototipo ────────────────────────────────────────────────────
const TINTA = "#0f172a";
const APOYO = "#475569";
const LINEA = "#e2e8f0";
const VERDE_BG = "#f0fdf9";
const VERDE_BORDE = "#b6e6d5";
const VERDE_TXT = "#046c4e";
const GRIS_BG = "#f4f4f5";
const GRIS_BORDE = "#d9d9dd";
const GRIS_TXT = "#52525b";
const LILA_BG = "#f7f4ff";
const LILA_BORDE = "#ddd3f5";
const LILA_TXT = "#5b2ec4";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const COLOR_CIUDAD = { MED: "#10b981", BOG: "#f59e0b" };

// Los SEIS tiles, en los tres grupos que pidió el dueño.
const GRUPOS = [
  {
    titulo: "El día a día",
    tiles: [
      { id: "ingreso",  icono: "📝", titulo: "Ingreso diario", desc: "Corregir días pasados" },
      { id: "rankings", icono: "🏅", titulo: "Rankings",       desc: "Mes · trimestre · indicador" },
    ],
  },
  {
    titulo: "El mes",
    tiles: [
      { id: "metas",  icono: "🎯", titulo: "Metas del mes", desc: "Cargar MED y BOG" },
      { id: "cerrar", icono: "🔒", titulo: "Cerrar mes",    desc: "Fijar notas para siempre" },
      // La pantalla existía COMPLETA desde hace tiempo (NominaComisiones.jsx)
      // pero no estaba importada en ninguna parte: no había forma de abrirla.
      // Va en "El mes" y de última porque ese es el orden real del trabajo:
      // se carga la meta, se cierra el mes, y entonces se paga.
      { id: "nomina", icono: "💵", titulo: "Comisiones",    desc: "Cuánto pagarle a cada una" },
    ],
  },
  {
    titulo: "El trimestre",
    tiles: [
      // Dos pantallas distintas y fáciles de confundir por el nombre:
      //   · "premios" (TrimestreAdmin) LEE los montos y dice quién los ganó.
      //   · "montos"  (ConfigPremios)  es donde se ESCRIBEN esos montos.
      // TrimestreAdmin.jsx:16 ya mandaba aquí al lector ("se leen de Admin >
      // Config Premios"), pero el tile no existía: el dueño no tenía forma de
      // cambiar el valor de un premio desde la app.
      { id: "premios", icono: "💎", titulo: "Premios",          desc: "Quién ganó y cuánto entregar" },
      { id: "montos",  icono: "💰", titulo: "Montos del premio", desc: "Cuánto vale cada trimestre" },
    ],
  },
  {
    // Backup estaba colgado dentro de "El trimestre" y no tiene nada que ver
    // con trimestres: respalda TODO y se hace cuando uno quiera.
    titulo: "Respaldo",
    tiles: [
      { id: "backup",  icono: "💾", titulo: "Backup",            desc: "Descargar todo en JSON" },
    ],
  },
];

// Los tres rankings que agrupa el tile "Rankings".
const RANKINGS = [
  { id: "rank-mes",  icono: "📊", titulo: "Del mes",       desc: "Notas e indicadores de todas" },
  { id: "rank-trim", icono: "📈", titulo: "Del trimestre", desc: "Avance del Q y premios" },
  { id: "rank-ind",  icono: "🏅", titulo: "Por indicador",  desc: "Quién va mejor en cada uno" },
];

const S = {
  titulo: { fontSize: 22, fontWeight: 800, margin: "0 0 12px", color: TINTA },
  rotulo: {
    fontSize: 12, fontWeight: 800, color: "#334155", textTransform: "uppercase",
    letterSpacing: ".7px", margin: "16px 0 7px",
  },
  // Rejilla que se acomoda sola: 2 columnas en el celular, 4 en el Mac.
  // Antes era "1fr 1fr" fijo — con el panel ancho quedaban dos botones
  // enormes de 580px cada uno. El `maxWidth` es a propósito: el panel entero
  // mide 1180px porque las TABLAS lo necesitan, pero un menú de botones
  // desparramado a lo ancho de la pantalla se lee peor, no mejor.
  tiles: {
    display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 8, maxWidth: 640, marginLeft: "auto", marginRight: "auto",
  },
  tile: {
    background: "#fff", border: `1px solid ${LINEA}`, borderRadius: 13,
    padding: "16px 12px", textAlign: "center", cursor: "pointer", font: "inherit",
  },
  volver: {
    background: "none", border: "none", font: "inherit", fontSize: 14, fontWeight: 700,
    color: APOYO, cursor: "pointer", padding: "0 0 12px",
    display: "flex", alignItems: "center", gap: 5,
  },
};

// ---------------------------------------------------------------------------
// Ventas del mes por ciudad — con honestidad sobre lo que NO existe.
//
// `metas[claveMes].vendidas` lo escribe la sincronización de systemlap. Si una
// ciudad todavía no tiene ni un valor numérico, su total es null (→ "no
// disponible"), no un 0. Un 0 aquí se leería como "no vendieron nada".
// ---------------------------------------------------------------------------
function ventasDelMesPorCiudad(datos, año, mes) {
  const vendidas = datos?.metas?.[claveMes(año, mes)]?.vendidas;
  const total = { MED: null, BOG: null };
  if (!vendidas) return total;

  (datos?.vendedoras || []).forEach(v => {
    if (v.ciudad !== "MED" && v.ciudad !== "BOG") return;
    const bruto = vendidas[v.id];
    if (bruto === undefined || bruto === null || bruto === "") return;
    const n = Number(bruto);
    if (!Number.isFinite(n)) return;
    total[v.ciudad] = (total[v.ciudad] || 0) + n;
  });
  return total;
}

const textoPesos = (n) => (n == null ? "no disponible" : formatoPesos(n));

// ---------------------------------------------------------------------------
// Barra de volver que se le monta a IngresoDiario. Ese componente nació como
// pantalla única de Carolina y su header propio solo trae "Salir": sin esto,
// Luis quedaría atrapado adentro o tendría que cerrar sesión para salir.
// ---------------------------------------------------------------------------
function ConVolver({ onVolver, children }) {
  return (
    <div>
      <div style={{
        position: "sticky", top: 0, zIndex: 30, padding: "10px 12px",
        background: "#fff", borderBottom: `1px solid ${LINEA}`,
      }}>
        <button
          onClick={onVolver}
          style={{
            background: "#fff", border: `1px solid ${LINEA}`, color: APOYO,
            fontWeight: 800, fontSize: 13, borderRadius: 10, padding: "8px 14px",
            cursor: "pointer", fontFamily: "inherit",
          }}
        >‹ Volver al panel</button>
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Selector "Ver la app como vendedora" (prototipo: vVerComo).
// Solo las ACTIVAS, agrupadas por ciudad. Al tocar una, el padre la abre dentro
// de esta misma app — no en pestaña nueva.
// ---------------------------------------------------------------------------
function SelectorVerComo({ activas, onVolver, onElegir }) {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  const med = activas.filter(v => v.ciudad === "MED");
  const bog = activas.filter(v => v.ciudad === "BOG");
  const otras = activas.filter(v => v.ciudad !== "MED" && v.ciudad !== "BOG");

  const fila = (v) => (
    <button
      key={v.id}
      onClick={() => onElegir?.(v)}
      style={{
        display: "flex", alignItems: "center", gap: 9, width: "100%",
        background: "#fff", border: "none", borderRadius: 9,
        boxShadow: "0 1px 3px rgba(0,0,0,.06)", marginBottom: 4,
        padding: "11px 12px", textAlign: "left", cursor: "pointer", font: "inherit",
      }}
    >
      <span style={{
        width: 30, height: 30, borderRadius: "50%",
        background: COLOR_CIUDAD[v.ciudad] || "#94a3b8", color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 800, fontSize: 14, flexShrink: 0,
      }}>{(v.nombre || "?")[0]}</span>
      <span style={{ flex: 1, minWidth: 0, fontWeight: 700, color: TINTA, fontSize: 12.5 }}>
        {v.nombre}
        <div style={{ fontSize: 11, color: APOYO, fontWeight: 400, marginTop: 1 }}>
          {v.rolTienda === "admin" ? "Administradora" : "Asesora"}
        </div>
      </span>
      <span style={{ color: "#a855f7", fontWeight: 800, fontSize: 17 }}>›</span>
    </button>
  );

  return (
    <div className="v-app v-ancho">
      <button style={S.volver} onClick={onVolver}>‹ Volver al panel</button>
      <div style={{ ...S.titulo, fontSize: 19 }}>👁️ Ver como vendedora</div>
      <div style={{ fontSize: 12, color: APOYO, margin: "-6px 0 14px" }}>
        Abre su vista con sus datos reales. Vuelves con el botón de arriba.
      </div>

      {med.length > 0 && (
        <>
          <div style={{ ...S.rotulo, color: COLOR_CIUDAD.MED, marginTop: 0 }}>🟢 Medellín</div>
          {med.map(fila)}
        </>
      )}
      {bog.length > 0 && (
        <>
          <div style={{ ...S.rotulo, color: COLOR_CIUDAD.BOG }}>🟡 Bogotá</div>
          {bog.map(fila)}
        </>
      )}
      {otras.length > 0 && (
        <>
          <div style={{ ...S.rotulo, color: APOYO }}>Sin ciudad asignada</div>
          {otras.map(fila)}
        </>
      )}
      {activas.length === 0 && (
        <div style={{ fontSize: 13, fontWeight: 700, color: APOYO, padding: "20px 2px", lineHeight: 1.6 }}>
          No hay vendedoras activas en el roster. Entran y salen desde systemlap.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Los tres rankings que agrupa el tile "Rankings"
// ---------------------------------------------------------------------------
function MenuRankings({ onVolver, onIr }) {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <div className="v-app v-ancho">
      <button style={S.volver} onClick={onVolver}>‹ Volver al panel</button>
      <div style={{ ...S.titulo, fontSize: 19 }}>🏅 Rankings</div>
      <div style={{ fontSize: 12, color: APOYO, margin: "-6px 0 14px" }}>
        El mismo mes, el mismo trimestre y los mismos indicadores que ven ellas.
      </div>
      {RANKINGS.map(r => (
        <button
          key={r.id}
          onClick={() => onIr(r.id)}
          style={{
            display: "flex", alignItems: "center", gap: 11, width: "100%",
            background: "#fff", border: `1px solid ${LINEA}`, borderRadius: 13,
            padding: "15px 16px", marginBottom: 8, cursor: "pointer",
            font: "inherit", textAlign: "left",
          }}
        >
          <span style={{ fontSize: 22, flexShrink: 0 }}>{r.icono}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: TINTA }}>{r.titulo}</div>
            <div style={{ fontSize: 11.5, color: APOYO, marginTop: 2 }}>{r.desc}</div>
          </span>
          <span style={{ fontSize: 19, fontWeight: 800, color: APOYO, opacity: 0.45 }}>›</span>
        </button>
      ))}
    </div>
  );
}

// ===========================================================================
// `user` no se usa aquí para decidir nada: entra solo para bajárselo a
// IngresoDiario, que es quien necesita saber si puede corregir un día guardado.
export default function AdminHome({ user = null, onVerComo }) {
  const datos = useDatos();
  const [seccion, setSeccion] = useState(null);
  // El interruptor de acceso: si el guardado falla, el switch vuelve solo a su
  // posición real y sin esto nadie explicaba por qué. Un control que "rebota"
  // sin decir nada se lee como un bug del dedo, no como un guardado fallido.
  const [errorAcceso, setErrorAcceso] = useState(null);
  const [cambiandoAcceso, setCambiandoAcceso] = useState(false);
  const hoy = hoyColombia();

  useEffect(() => { window.scrollTo(0, 0); }, [seccion]);

  const activas = useMemo(
    () => (datos.vendedoras || []).filter(v => v.activa !== false && !v.eventual),
    [datos.vendedoras]
  );

  const ventas = useMemo(
    () => ventasDelMesPorCiudad(datos, hoy.año, hoy.mes),
    [datos, hoy.año, hoy.mes]
  );

  // ── Sub-pantallas ────────────────────────────────────────────────────────
  if (seccion === "ingreso") {
    return (
      <ConVolver onVolver={() => setSeccion(null)}>
        {/* El admin es el único que puede corregir un día YA guardado. Eso lo
            decide IngresoDiario a partir de `user` con rolDe(): antes se le
            mandaba una prop `puedeCorregirDiasPasados` que ese componente nunca
            leyó — el permiso quedaba escrito, pero no aplicado. */}
        <IngresoDiario
          vendedoras={datos.vendedoras || []}
          user={user}
          // Mismo camino transaccional que usa Carolina: sólo se manda el parche
          // de esta fecha. Antes se mandaba `{...datos.registros}` desde memoria y
          // el admin podía borrar en silencio los días que ella acababa de meter.
          // Se devuelve la promesa para que IngresoDiario muestre el error si falla.
          onGuardar={({ fecha, filas, vids }) => datos.guardarDiaRegistros(fecha, filas, vids)}
        />
      </ConVolver>
    );
  }

  if (seccion === "rankings") {
    return <MenuRankings onVolver={() => setSeccion(null)} onIr={setSeccion} />;
  }
  if (seccion === "rank-mes")  return <VistaTodas onVolver={() => setSeccion("rankings")} />;
  if (seccion === "rank-trim") return <TrimestreAdmin onVolver={() => setSeccion("rankings")} />;
  if (seccion === "rank-ind") {
    return (
      <TabRankingIndicadores
        datos={datos}
        ciudad={null}
        miId={null}
        esAdmin
        onVolver={() => setSeccion("rankings")}
      />
    );
  }

  if (seccion === "metas")   return <CargarMetas onVolver={() => setSeccion(null)} />;
  if (seccion === "cerrar")  return <CerrarMes onVolver={() => setSeccion(null)} />;
  if (seccion === "premios") return <TrimestreAdmin onVolver={() => setSeccion(null)} />;
  if (seccion === "montos")  return <ConfigPremios onVolver={() => setSeccion(null)} />;
  if (seccion === "nomina")  return <NominaComisiones onVolver={() => setSeccion(null)} />;
  if (seccion === "backup")  return <Backup onVolver={() => setSeccion(null)} />;

  if (seccion === "vercomo") {
    return (
      <SelectorVerComo
        activas={activas}
        onVolver={() => setSeccion(null)}
        onElegir={(v) => onVerComo?.(v)}
      />
    );
  }

  // ── Panel ────────────────────────────────────────────────────────────────
  const config = datos.config || {};
  const accesoOn = !!config.whitelistActiva;

  // Sólo la clave que cambia: así no puede pisar `premiosTrim` ni ningún otro
  // ajuste que otro haya guardado mientras este panel estaba abierto.
  async function toggleAcceso() {
    if (cambiandoAcceso) return;
    const querido = !accesoOn;
    setCambiandoAcceso(true);
    setErrorAcceso(null);
    try {
      await datos.guardarClaves("config", { whitelistActiva: querido });
    } catch (e) {
      // Si falla, el optimista se revierte en DatosContext y el switch vuelve
      // solo a su posición real. Eso SE VE; lo que faltaba era decir por qué, y
      // sobre todo que el acceso quedó como estaba — no como se acaba de tocar.
      console.error("No se pudo cambiar el acceso general", e);
      setErrorAcceso({
        querido,
        detalle: e?.message || "No hubo respuesta del servidor.",
      });
    } finally {
      setCambiandoAcceso(false);
    }
  }

  const totalMes = ventas.MED == null && ventas.BOG == null
    ? null
    : (ventas.MED || 0) + (ventas.BOG || 0);

  return (
    <div className="v-app v-ancho">
      <div className="v-header">
        <div className="v-brand">⚡ Valkyrias</div>
        <button
          onClick={() => signOut(auth)}
          style={{
            fontSize: 12, fontWeight: 700, color: "#94a3b8", background: "transparent",
            border: `1px solid ${LINEA}`, padding: "6px 10px", borderRadius: 8,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >Salir</button>
      </div>

      <div style={S.titulo}>⚙️ Panel</div>

      {/* Ventas del mes */}
      <div style={{
        background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff",
        border: "none", borderRadius: 13, padding: 16, marginBottom: 10,
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "1.3px", opacity: 0.92 }}>
          Ventas del mes · {MESES[hoy.mes - 1]}
        </div>
        <div style={{ fontSize: 29, fontWeight: 800, letterSpacing: "-.8px", marginTop: 3 }}>
          {textoPesos(totalMes)}
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 600, opacity: 0.95, marginTop: 4 }}>
          🟢 MED {textoPesos(ventas.MED)} · 🟡 BOG {textoPesos(ventas.BOG)}
        </div>
        {totalMes == null && (
          <div style={{ fontSize: 11.5, fontWeight: 600, opacity: 0.9, marginTop: 6, lineHeight: 1.5 }}>
            Las ventas del mes todavía no llegan de systemlap.
          </div>
        )}
      </div>

      {/* Interruptor de acceso */}
      <div style={{
        background: accesoOn ? VERDE_BG : GRIS_BG,
        border: `1px solid ${accesoOn ? VERDE_BORDE : GRIS_BORDE}`,
        borderRadius: 13, padding: 16, marginBottom: 10,
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: accesoOn ? VERDE_TXT : GRIS_TXT }}>
            {accesoOn ? "App abierta para las vendedoras" : "App cerrada"}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: accesoOn ? VERDE_TXT : GRIS_TXT, marginTop: 2 }}>
            {accesoOn
              ? `Las ${activas.length} pueden entrar con su correo`
              : "Nadie puede entrar aunque tenga el link"}
          </div>
        </div>
        <button
          onClick={toggleAcceso}
          disabled={cambiandoAcceso}
          aria-label={accesoOn ? "Cerrar el acceso a la app" : "Abrir el acceso a la app"}
          aria-pressed={accesoOn}
          aria-busy={cambiandoAcceso}
          style={{
            width: 54, height: 30, borderRadius: 15, border: "none",
            cursor: cambiandoAcceso ? "progress" : "pointer",
            opacity: cambiandoAcceso ? 0.6 : 1,
            flexShrink: 0, background: accesoOn ? "#059669" : "#a1a1aa",
            position: "relative", padding: 0,
          }}
        >
          <span style={{
            position: "absolute", top: 3, left: accesoOn ? 27 : 3,
            width: 24, height: 24, borderRadius: "50%", background: "#fff",
            transition: "left .18s",
          }} />
        </button>
      </div>

      {/* El cambio de acceso falló: decirlo, y decir en qué estado quedó */}
      {errorAcceso && (
        <div style={{
          background: "#fee2e2", border: "2px solid #dc2626", borderRadius: 12,
          padding: "11px 13px", marginBottom: 10, color: "#991b1b",
        }}>
          <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 3 }}>
            ❌ No se pudo {errorAcceso.querido ? "ABRIR" : "CERRAR"} el acceso
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.5 }}>
            {errorAcceso.detalle}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 800, marginTop: 5, lineHeight: 1.5 }}>
            El interruptor volvió a como estaba: la app sigue{" "}
            <strong>{accesoOn ? "abierta para las vendedoras" : "cerrada"}</strong>. Revisa la conexión
            e inténtalo otra vez.
          </div>
          <button
            onClick={() => setErrorAcceso(null)}
            style={{
              marginTop: 8, background: "#fff", border: "1px solid #fca5a5", color: "#991b1b",
              borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 800,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >Entendido</button>
        </div>
      )}

      {/* Ver la app como vendedora */}
      <button
        onClick={() => setSeccion("vercomo")}
        style={{
          display: "block", width: "100%", textAlign: "left",
          background: LILA_BG, border: `1px solid ${LILA_BORDE}`, borderRadius: 18,
          padding: "18px 20px", marginBottom: 6, cursor: "pointer", font: "inherit",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <span style={{
            width: 38, height: 38, borderRadius: "50%", background: "#e6dcfb",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 19, flexShrink: 0,
          }}>👁️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: "-.2px", color: LILA_TXT }}>
              Ver la app como vendedora
            </div>
            <div style={{ fontSize: 12, color: LILA_TXT, fontWeight: 600, marginTop: 2 }}>
              {activas.length > 0
                ? `Elige a cuál de las ${activas.length}`
                : "Todavía no hay vendedoras activas"}
            </div>
          </div>
          <span style={{ fontSize: 20, fontWeight: 800, opacity: 0.45, color: LILA_TXT }}>›</span>
        </div>
      </button>

      {/* Los seis tiles */}
      {GRUPOS.map(g => (
        <div key={g.titulo}>
          <div style={S.rotulo}>{g.titulo}</div>
          <div style={S.tiles}>
            {g.tiles.map((t, i) => {
              // Grupo con cantidad impar: la última ficha ocupa las dos columnas
              // en vez de dejar un hueco. Misma ficha, mismo estilo — sólo el ancho.
              const solaEnSuFila = g.tiles.length % 2 === 1 && i === g.tiles.length - 1;
              return (
                <button
                  key={t.id}
                  style={solaEnSuFila ? { ...S.tile, gridColumn: "1 / -1" } : S.tile}
                  onClick={() => setSeccion(t.id)}
                >
                  <div style={{ fontSize: 26, lineHeight: 1 }}>{t.icono}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, marginTop: 6, color: TINTA }}>{t.titulo}</div>
                  <div style={{ fontSize: 11, color: APOYO, marginTop: 3, lineHeight: 1.35 }}>{t.desc}</div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Dónde se administra a las vendedoras (y dónde NO) */}
      <div style={{
        marginTop: 18, padding: "11px 13px", borderRadius: 10,
        background: "#eff6ff", color: "#1e40af", borderLeft: "3px solid #3b82f6",
        fontSize: 12, fontWeight: 700, lineHeight: 1.65,
      }}>
        💡 <strong>Aquí no se crea ni se edita nada de vendedoras.</strong> Entran, salen, cambian
        de ciudad o de rol en systemlap, y esta app lo recibe sola. Los únicos datos que se
        escriben acá son los que llena Carolina cada día.
      </div>
    </div>
  );
}
