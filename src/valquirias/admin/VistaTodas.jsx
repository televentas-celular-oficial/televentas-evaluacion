// Admin > Vista de TODAS las vendedoras (tabla maestra del mes)
// ============================================================================
// Lo que Luis pidió: "veo los datos de todas, veo sus calificaciones por cada
// indicador, veo cuántos minutos llegan tarde y cuántos días. Tengo mucha
// información y como yo la quiera ver".
//
// Es funcionalidad NUEVA (la clásica sólo tenía ranking de una métrica a la vez
// y el boletín individual). Aquí todo el mes cabe en una sola tabla:
//   nombre · ciudad · rol · ventas · %meta · nota final · UNA COLUMNA POR
//   INDICADOR · días de retardo · minutos acumulados
//
// "Como yo la quiera ver" = ordenable por CUALQUIER columna (toca el encabezado),
// filtrable por ciudad y mes, y con buscador por nombre.
//
// NO recalcula nada: todo sale del motor (data/derivar.js → lib/calculos.js),
// así hereda V1/V2, snapshots de mes cerrado y penalizaciones automáticamente.
// ============================================================================

import { useState, useMemo } from "react";
import { useDatos } from "../data/DatosContext.jsx";
import {
  derivarMesDeVendedora,
  derivarRetardosDeVendedora,
  derivarDetalleVendedoraMes,
} from "../data/derivar.js";
import { getIndicadores } from "../../lib/constantes.js";
import { fmtN, colorN, bgN } from "../../lib/calculos.js";
import { formatoPesos, formatoK, hoyColombia } from "../lib/helpers.js";

const MES_NOMBRES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const CIUDAD_LABEL = { MED: "🟢 MED", BOG: "🟡 BOG" };
const CIUDAD_COLOR = { MED: "#10b981", BOG: "#f59e0b" };

// Normaliza para buscar sin tildes ni mayúsculas
const norm = (s) => (s || "")
  .toString()
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "");

// null siempre al final, sin importar la dirección
function comparar(a, b, dir) {
  const aNull = a === null || a === undefined;
  const bNull = b === null || b === undefined;
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  if (typeof a === "string" || typeof b === "string") {
    return String(a).localeCompare(String(b), "es") * dir;
  }
  return (a - b) * dir;
}

export default function VistaTodas({ onVolver }) {
  const datos = useDatos();
  const hoy = hoyColombia();

  const [selMes, setSelMes] = useState({ año: hoy.año, mes: hoy.mes });
  const [filtroCiudad, setFiltroCiudad] = useState("TODAS");
  const [busqueda, setBusqueda] = useState("");
  const [incluirInactivas, setIncluirInactivas] = useState(false);
  // col: "nombre" | "ciudad" | "rol" | "ventas" | "pct" | "nota" | "notaComp"
  //      | "retDias" | "retMin" | `ind:<id>`
  const [orden, setOrden] = useState({ col: "nota", dir: -1 });
  const [verVid, setVerVid] = useState(null);

  // Indicadores del mes seleccionado (5 en V2, 6 en V1) → columnas dinámicas
  const indicadores = useMemo(
    () => getIndicadores(selMes.año, selMes.mes),
    [selMes.año, selMes.mes]
  );

  // Roster base: nunca las eventuales (viven sólo en systemlap)
  const roster = useMemo(() => {
    return (datos.vendedoras || []).filter(v =>
      !v.eventual && (incluirInactivas || v.activa !== false)
    );
  }, [datos.vendedoras, incluirInactivas]);

  // Una fila por vendedora, todo derivado del motor
  const filasBase = useMemo(() => {
    return roster.map(v => {
      const mes = derivarMesDeVendedora(datos, v, selMes.año, selMes.mes);
      const ret = derivarRetardosDeVendedora(datos, v.id, selMes.año, selMes.mes);
      return {
        v,
        rol: v.rolTienda === "admin" ? "admin" : "asesora",
        mes,
        ret,
        porInd: mes.porInd || {},
      };
    });
  }, [roster, datos, selMes.año, selMes.mes]);

  const filas = useMemo(() => {
    const q = norm(busqueda.trim());
    const out = filasBase.filter(f => {
      if (filtroCiudad !== "TODAS" && f.v.ciudad !== filtroCiudad) return false;
      if (q && !norm(f.v.nombre).includes(q)) return false;
      return true;
    });

    const { col, dir } = orden;
    const valor = (f) => {
      if (col === "nombre") return f.v.nombre || "";
      if (col === "ciudad") return f.v.ciudad || "";
      if (col === "rol") return f.rol;
      if (col === "ventas") return f.mes.ventas ?? 0;
      if (col === "pct") return f.mes.meta > 0 ? f.mes.pctMeta : null;
      if (col === "nota") return f.mes.nota;
      if (col === "notaComp") return f.mes.notaComportamiento;
      if (col === "notaVentas") return f.mes.notaVentas;
      if (col === "retDias") return f.ret.dias;
      if (col === "retMin") return f.ret.minutos;
      if (col.startsWith("ind:")) return f.porInd[col.slice(4)] ?? null;
      return null;
    };

    return [...out].sort((a, b) => {
      const c = comparar(valor(a), valor(b), dir);
      if (c !== 0) return c;
      return (a.v.nombre || "").localeCompare(b.v.nombre || "", "es");
    });
  }, [filasBase, filtroCiudad, busqueda, orden]);

  function ordenarPor(col) {
    setOrden(o => {
      if (o.col === col) return { col, dir: o.dir * -1 };
      // Texto arranca A→Z; números arrancan de mayor a menor (lo útil de un día a día)
      const esTexto = col === "nombre" || col === "ciudad" || col === "rol";
      return { col, dir: esTexto ? 1 : -1 };
    });
  }

  // Selector: mes en curso primero, luego los 11 anteriores (nunca futuros)
  const meses = [];
  for (let i = 0; i < 12; i++) {
    let m = hoy.mes - i;
    let a = hoy.año;
    while (m <= 0) { m += 12; a -= 1; }
    meses.push({ año: a, mes: m });
  }

  // Sub-pantalla de detalle
  const vendedoraVista = verVid != null ? roster.find(v => v.id === verVid) : null;
  if (vendedoraVista) {
    return (
      <DetalleVendedoraMes
        datos={datos}
        vendedora={vendedoraVista}
        año={selMes.año}
        mes={selMes.mes}
        onVolver={() => setVerVid(null)}
      />
    );
  }

  // Resumen de la selección actual
  const conNota = filas.filter(f => f.mes.nota !== null);
  const promedio = conNota.length
    ? Math.round((conNota.reduce((s, f) => s + f.mes.nota, 0) / conNota.length) * 100) / 100
    : null;
  const totalVentas = filas.reduce((s, f) => s + (f.mes.ventas || 0), 0);
  const totalMin = filas.reduce((s, f) => s + f.ret.minutos, 0);
  const totalDiasTarde = filas.reduce((s, f) => s + f.ret.dias, 0);
  const mesCerrado = filas.some(f => f.mes.cerrado);
  const version = filasBase[0]?.mes?.version || null;

  return (
    <div className="v-app">
      <div className="v-header-detalle">
        <button className="v-back-btn" onClick={onVolver}>‹ Volver</button>
        <div className="v-header-title">📊 Todas las vendedoras</div>
        <div style={{ width: 60 }} />
      </div>

      {/* Selector de mes */}
      <div style={{ display: "flex", gap: 4, overflowX: "auto", padding: "0 0 10px" }}>
        {meses.map(m => {
          const activo = m.año === selMes.año && m.mes === selMes.mes;
          return (
            <button
              key={`${m.año}-${m.mes}`}
              onClick={() => setSelMes(m)}
              style={{
                padding: "6px 10px", fontSize: 11, fontWeight: 800,
                background: activo ? "linear-gradient(135deg, #7c3aed, #ec4899)" : "#fff",
                color: activo ? "#fff" : "#7c3aed",
                border: "1.5px solid " + (activo ? "transparent" : "#e2e8f0"),
                borderRadius: 8, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap",
              }}
            >{MES_NOMBRES[m.mes - 1].slice(0, 3)} {m.año}</button>
          );
        })}
      </div>

      {/* HERO resumen */}
      <div style={{
        background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #ec4899 100%)",
        color: "#fff", padding: "18px 20px", borderRadius: 20, marginBottom: 10,
        boxShadow: "0 12px 28px rgba(124, 58, 237, 0.32)",
        position: "relative", overflow: "hidden", textAlign: "center",
      }}>
        <div style={{ position: "absolute", top: "-50%", right: "-30%", width: 260, height: 260, background: "radial-gradient(circle, rgba(255,255,255,0.22), transparent 60%)", borderRadius: "50%", pointerEvents: "none" }} />
        <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 2, opacity: 0.95, marginBottom: 4, position: "relative" }}>
          📊 {MES_NOMBRES[selMes.mes - 1]} {selMes.año} · {filas.length} vendedora{filas.length === 1 ? "" : "s"}
        </div>
        <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1, position: "relative", textShadow: "0 2px 6px rgba(0,0,0,0.15)" }}>
          {promedio === null ? "—" : fmtN(promedio)}
        </div>
        <div style={{ fontSize: 11, marginTop: 4, opacity: 0.95, fontWeight: 700, position: "relative" }}>
          nota promedio del grupo
        </div>
        <div style={{ fontSize: 12, marginTop: 8, opacity: 0.95, fontWeight: 800, position: "relative" }}>
          💰 {formatoPesos(totalVentas)} · ⏰ {totalDiasTarde} días tarde · {totalMin} min
        </div>
        {(mesCerrado || version) && (
          <div style={{ fontSize: 10, marginTop: 6, opacity: 0.9, fontWeight: 800, position: "relative", letterSpacing: 0.5 }}>
            {mesCerrado ? "🔒 MES CERRADO · notas finales" : "⏳ Mes en curso · notas en vivo"}
            {version ? ` · fórmula ${version.toUpperCase()}` : ""}
          </div>
        )}
      </div>

      {/* Filtros: ciudad + buscador */}
      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        {["TODAS", "MED", "BOG"].map(c => {
          const activo = filtroCiudad === c;
          const label = c === "TODAS" ? "Todas" : (c === "MED" ? "🟢 Medellín" : "🟡 Bogotá");
          return (
            <button
              key={c}
              onClick={() => setFiltroCiudad(c)}
              style={{
                flex: 1, padding: "8px 6px", fontSize: 11, fontWeight: 900,
                background: activo ? "linear-gradient(135deg, #7c3aed, #ec4899)" : "#fff",
                color: activo ? "#fff" : "#7c3aed",
                border: "1.5px solid " + (activo ? "transparent" : "#e2e8f0"),
                borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
              }}
            >{label}</button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="🔍 Buscar por nombre…"
          style={{
            flex: 1, padding: "9px 12px", fontSize: 13, fontWeight: 700,
            border: "1.5px solid #e2e8f0", borderRadius: 10, fontFamily: "inherit",
            color: "#1e1b4b", background: "#fff", minWidth: 0,
          }}
        />
        {busqueda && (
          <button
            onClick={() => setBusqueda("")}
            style={{ padding: "9px 10px", fontSize: 12, fontWeight: 900, background: "#fff", color: "#7c3aed", border: "1.5px solid #e2e8f0", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}
          >✕</button>
        )}
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, color: "#64748b", marginBottom: 8, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={incluirInactivas}
          onChange={e => setIncluirInactivas(e.target.checked)}
          style={{ width: 15, height: 15, accentColor: "#7c3aed", cursor: "pointer" }}
        />
        Incluir inactivas (histórico)
      </label>

      {/* Ayuda de uso */}
      <div style={{ padding: "8px 12px", background: "rgba(168, 85, 247, 0.08)", borderLeft: "3px solid #a855f7", borderRadius: 10, fontSize: 11, color: "#5b21b6", fontWeight: 700, marginBottom: 8, lineHeight: 1.5 }}>
        💡 Toca un <strong>encabezado</strong> para ordenar por esa columna · toca una <strong>fila</strong> para ver el detalle del mes · desliza la tabla → para ver todos los indicadores.
      </div>

      {roster.length === 0 && (
        <div style={{ padding: "18px 16px", background: "rgba(239, 68, 68, 0.08)", borderLeft: "3px solid #ef4444", borderRadius: 10, fontSize: 12, color: "#991b1b", fontWeight: 700, textAlign: "center", lineHeight: 1.55 }}>
          🚫 Sin vendedoras sincronizadas — verifica el sync desde systemlap.
        </div>
      )}

      {roster.length > 0 && filas.length === 0 && (
        <div style={{ padding: "18px 16px", background: "rgba(245, 158, 11, 0.10)", borderLeft: "3px solid #f59e0b", borderRadius: 10, fontSize: 12, color: "#92400e", fontWeight: 700, textAlign: "center", lineHeight: 1.55 }}>
          🔍 Ninguna vendedora coincide con el filtro.
        </div>
      )}

      {/* TABLA — scroll horizontal en celular, primera columna fija */}
      {filas.length > 0 && (
        <div style={{
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
          background: "#fff",
          borderRadius: 14,
          boxShadow: "0 2px 10px rgba(124, 58, 237, 0.10)",
          border: "1px solid rgba(168, 85, 247, 0.12)",
        }}>
          <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "max-content", minWidth: "100%", fontSize: 11 }}>
            <thead>
              <tr>
                <Th col="nombre" label="Vendedora" orden={orden} onOrdenar={ordenarPor} sticky align="left" ancho={132} />
                <Th col="ciudad" label="Ciudad" orden={orden} onOrdenar={ordenarPor} />
                <Th col="rol" label="Rol" orden={orden} onOrdenar={ordenarPor} />
                <Th col="ventas" label="💰 Ventas" orden={orden} onOrdenar={ordenarPor} align="right" />
                <Th col="pct" label="% Meta" orden={orden} onOrdenar={ordenarPor} align="right" />
                <Th col="nota" label="🏅 Nota" orden={orden} onOrdenar={ordenarPor} destacado />
                <Th col="notaComp" label="Comport." orden={orden} onOrdenar={ordenarPor} />
                <Th col="notaVentas" label="N. Ventas" orden={orden} onOrdenar={ordenarPor} />
                {indicadores.map(ind => (
                  <Th
                    key={ind.id}
                    col={`ind:${ind.id}`}
                    label={`${ind.emoji} ${ind.label}`}
                    sub={`${ind.peso}%`}
                    orden={orden}
                    onOrdenar={ordenarPor}
                    color={ind.color}
                  />
                ))}
                <Th col="retDias" label="⏰ Días tarde" orden={orden} onOrdenar={ordenarPor} color="#3b82f6" />
                <Th col="retMin" label="⏰ Min acum." orden={orden} onOrdenar={ordenarPor} color="#3b82f6" />
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => {
                const zebra = i % 2 === 1 ? "#faf9ff" : "#fff";
                const inactiva = f.v.activa === false;
                return (
                  <tr
                    key={f.v.id}
                    onClick={() => setVerVid(f.v.id)}
                    style={{ cursor: "pointer", opacity: inactiva ? 0.6 : 1 }}
                  >
                    {/* Nombre — pegado a la izquierda al hacer scroll */}
                    <td style={{
                      ...tdBase, position: "sticky", left: 0, zIndex: 1,
                      background: zebra, textAlign: "left",
                      borderRight: "1px solid #ede9fe", minWidth: 132, maxWidth: 148,
                      boxShadow: "2px 0 4px rgba(0,0,0,0.03)",
                    }}>
                      <div style={{ fontWeight: 900, color: "#1e1b4b", fontSize: 12, lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {f.v.nombre}
                      </div>
                      <div style={{ fontSize: 9, color: "#94a3b8", fontWeight: 800, marginTop: 1 }}>
                        {f.mes.diasTrabajados} días{f.mes.cerrado ? " · 🔒" : ""}{inactiva ? " · inactiva" : ""}
                      </div>
                    </td>

                    <td style={{ ...tdBase, background: zebra }}>
                      <span style={{ fontWeight: 900, fontSize: 10, color: CIUDAD_COLOR[f.v.ciudad] || "#64748b" }}>
                        {CIUDAD_LABEL[f.v.ciudad] || f.v.ciudad || "—"}
                      </span>
                    </td>

                    <td style={{ ...tdBase, background: zebra }}>
                      <span style={{
                        fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.4,
                        padding: "2px 6px", borderRadius: 4,
                        background: f.rol === "admin" ? "#faf5ff" : "#f0fdf4",
                        color: f.rol === "admin" ? "#7c3aed" : "#047857",
                      }}>{f.rol === "admin" ? "Admin" : "Asesora"}</span>
                    </td>

                    <td style={{ ...tdBase, background: zebra, textAlign: "right", fontWeight: 900, color: "#1e1b4b", fontSize: 11 }}>
                      {formatoK(f.mes.ventas)}
                    </td>

                    <td style={{ ...tdBase, background: zebra, textAlign: "right", fontWeight: 900, fontSize: 11, color: f.mes.meta > 0 ? (f.mes.pctMeta >= 100 ? "#059669" : f.mes.pctMeta >= 70 ? "#d97706" : "#dc2626") : "#94a3b8" }}>
                      {f.mes.meta > 0 ? `${f.mes.pctMeta}%` : "—"}
                    </td>

                    <td style={{ ...tdBase, background: zebra }}>
                      <Nota n={f.mes.nota} grande />
                      {f.mes.bono > 0 && (
                        <div style={{ fontSize: 8, fontWeight: 900, color: "#059669", marginTop: 1 }}>+{f.mes.bono.toFixed(1)} bono</div>
                      )}
                    </td>

                    <td style={{ ...tdBase, background: zebra }}><Nota n={f.mes.notaComportamiento} /></td>
                    <td style={{ ...tdBase, background: zebra }}><Nota n={f.mes.notaVentas} /></td>

                    {indicadores.map(ind => (
                      <td key={ind.id} style={{ ...tdBase, background: zebra }}>
                        <Nota n={f.porInd[ind.id] ?? null} />
                      </td>
                    ))}

                    <td style={{ ...tdBase, background: zebra, fontWeight: 900, fontSize: 11, color: f.ret.dias > 0 ? "#dc2626" : "#059669" }}>
                      {f.ret.dias}
                      {f.ret.diasGraves > 0 && (
                        <div style={{ fontSize: 8, fontWeight: 900, color: "#dc2626" }}>{f.ret.diasGraves} grave{f.ret.diasGraves === 1 ? "" : "s"}</div>
                      )}
                    </td>

                    <td style={{ ...tdBase, background: zebra, fontWeight: 900, fontSize: 11, color: f.ret.minutos > 0 ? "#dc2626" : "#059669" }}>
                      {f.ret.minutos}
                      {f.ret.minutos > 0 && (
                        <div style={{ fontSize: 8, fontWeight: 800, color: "#94a3b8" }}>{f.ret.promedioMin}/día</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 12, textAlign: "center", fontSize: 10, color: "#94a3b8", fontWeight: 700, lineHeight: 1.5 }}>
        Ordenado por <strong>{etiquetaOrden(orden.col, indicadores)}</strong> {orden.dir === -1 ? "↓ mayor a menor" : "↑ menor a mayor"}
        <br />Generado el {hoy.iso} · datos en vivo desde Firestore
      </div>
    </div>
  );
}

// ============================================================================
// PIEZAS DE LA TABLA
// ============================================================================

const tdBase = {
  padding: "8px 8px",
  textAlign: "center",
  borderTop: "1px solid #f1f5f9",
  whiteSpace: "nowrap",
  verticalAlign: "middle",
};

function Th({ col, label, sub, orden, onOrdenar, align = "center", sticky = false, ancho, color, destacado }) {
  const activo = orden.col === col;
  return (
    <th
      onClick={() => onOrdenar(col)}
      style={{
        padding: "8px 8px",
        textAlign: align,
        fontSize: 10,
        fontWeight: 900,
        color: activo ? "#fff" : (color || "#5b21b6"),
        background: activo
          ? "linear-gradient(135deg, #7c3aed, #ec4899)"
          : (destacado ? "#f5f3ff" : "#faf5ff"),
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
        borderBottom: "2px solid #ede9fe",
        position: sticky ? "sticky" : "static",
        left: sticky ? 0 : undefined,
        zIndex: sticky ? 3 : 2,
        minWidth: ancho || undefined,
        top: 0,
      }}
      title="Toca para ordenar"
    >
      {label}{activo ? (orden.dir === -1 ? " ↓" : " ↑") : ""}
      {sub && (
        <div style={{ fontSize: 8, fontWeight: 800, opacity: activo ? 0.9 : 0.6, marginTop: 1 }}>{sub}</div>
      )}
    </th>
  );
}

function Nota({ n, grande = false }) {
  const vacio = n === null || n === undefined;
  return (
    <span style={{
      display: "inline-block",
      minWidth: grande ? 42 : 38,
      padding: grande ? "3px 7px" : "2px 6px",
      borderRadius: 7,
      fontSize: grande ? 12 : 11,
      fontWeight: 900,
      color: vacio ? "#94a3b8" : colorN(n),
      background: vacio ? "#f8fafc" : bgN(n),
    }}>{fmtN(n)}</span>
  );
}

function etiquetaOrden(col, indicadores) {
  if (col.startsWith("ind:")) {
    const id = col.slice(4);
    const ind = indicadores.find(i => i.id === id);
    return ind ? ind.label : id;
  }
  const map = {
    nombre: "nombre", ciudad: "ciudad", rol: "rol", ventas: "ventas",
    pct: "% de meta", nota: "nota final", notaComp: "comportamiento",
    notaVentas: "nota de ventas", retDias: "días tarde", retMin: "minutos acumulados",
  };
  return map[col] || col;
}

// ============================================================================
// DETALLE DE UNA VENDEDORA EN EL MES
// ============================================================================
function DetalleVendedoraMes({ datos, vendedora, año, mes, onVolver }) {
  const d = useMemo(
    () => derivarDetalleVendedoraMes(datos, vendedora, año, mes),
    [datos, vendedora, año, mes]
  );
  const [verTodosLosDias, setVerTodosLosDias] = useState(false);

  return (
    <div className="v-app">
      <div className="v-header-detalle">
        <button className="v-back-btn" onClick={onVolver}>‹ Volver</button>
        <div className="v-header-title">{vendedora.nombre}</div>
        <div style={{ width: 60 }} />
      </div>

      {/* HERO nota */}
      <div style={{
        background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #ec4899 100%)",
        color: "#fff", padding: "20px", borderRadius: 20, marginBottom: 10,
        boxShadow: "0 12px 28px rgba(124, 58, 237, 0.32)",
        position: "relative", overflow: "hidden", textAlign: "center",
      }}>
        <div style={{ position: "absolute", top: "-50%", right: "-30%", width: 240, height: 240, background: "radial-gradient(circle, rgba(255,255,255,0.22), transparent 60%)", borderRadius: "50%", pointerEvents: "none" }} />
        <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1.6, opacity: 0.95, position: "relative" }}>
          {d.nombreMes} {d.año} · {CIUDAD_LABEL[vendedora.ciudad] || vendedora.ciudad} · {d.version?.toUpperCase()}
        </div>
        <div style={{ fontSize: 48, fontWeight: 900, letterSpacing: -2, lineHeight: 1.1, position: "relative", textShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
          {fmtN(d.notaFinal)}
        </div>
        <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.95, position: "relative" }}>
          /5.00 · {d.cerrado ? "🔒 mes cerrado" : "⏳ en vivo"}
          {d.posicionCiudad ? ` · #${d.posicionCiudad} de ${d.totalCiudad}` : ""}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 12, position: "relative" }}>
          <MiniHero label="Comportamiento" valor={fmtN(d.notaComportamiento)} />
          <MiniHero label="Ventas" valor={fmtN(d.notaVentas)} />
          <MiniHero label="Bono" valor={d.bono > 0 ? `+${d.bono.toFixed(1)}` : "—"} />
        </div>
      </div>

      {/* Ventas */}
      <Card titulo="💰 Ventas del mes">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
          <Caja label="Vendido" valor={formatoPesos(d.ventas.real)} />
          <Caja label="Meta" valor={d.ventas.meta > 0 ? formatoPesos(d.ventas.meta) : "sin meta"} />
        </div>
        <div style={{ background: "#f1f5f9", height: 9, borderRadius: 5, overflow: "hidden", marginBottom: 6 }}>
          <div style={{
            height: "100%",
            width: `${Math.min(100, d.ventas.pct || 0)}%`,
            background: (d.ventas.pct || 0) >= 100 ? "#10b981" : (d.ventas.pct || 0) >= 70 ? "#f59e0b" : "#f97316",
            borderRadius: 5,
          }} />
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b" }}>
          {d.ventas.meta > 0 ? `${d.ventas.pct}% de la meta` : "Meta del mes no cargada"}
          {d.ventas.tramo ? ` · tramo ${d.ventas.tramo}` : ""}
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#047857", marginTop: 4 }}>
          Comisión estimada: {formatoPesos(d.ventas.comision)} <span style={{ color: "#94a3b8", fontWeight: 700 }}>· {d.ventas.comisionDetalle}</span>
        </div>
      </Card>

      {/* Indicadores */}
      <Card titulo={`📋 Indicadores · ${d.diasTrabajados} días trabajados`}>
        {d.indicadores.map(ind => (
          <div key={ind.id} style={{ padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: "#1e1b4b" }}>
                {ind.emoji} {ind.nombre}
                <span style={{ fontSize: 9, color: "#94a3b8", fontWeight: 800, marginLeft: 5 }}>Peso {ind.peso}%</span>
              </div>
              <Nota n={ind.nota} grande />
            </div>
            <div style={{ background: "#f1f5f9", height: 6, borderRadius: 3, overflow: "hidden", margin: "5px 0 4px" }}>
              <div style={{ height: "100%", width: `${((ind.nota ?? 0) / 5) * 100}%`, background: ind.color, borderRadius: 3 }} />
            </div>
            <div style={{ fontSize: 10.5, color: "#64748b", fontWeight: 700 }}>{ind.detalle}</div>
          </div>
        ))}
      </Card>

      {/* Retardos día por día */}
      <Card titulo="⏰ Retardos día por día">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 8 }}>
          <Caja label="Días tarde" valor={String(d.retardos.dias)} color={d.retardos.dias > 0 ? "#dc2626" : "#059669"} />
          <Caja label="Min acum." valor={String(d.retardos.minutos)} color={d.retardos.minutos > 0 ? "#dc2626" : "#059669"} />
          <Caja label="Graves ≥10" valor={String(d.retardos.diasGraves)} color={d.retardos.diasGraves > 0 ? "#dc2626" : "#059669"} />
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", marginBottom: 8 }}>
          {d.retardos.resumen} · promedio {d.retardos.promedioMin} min/día
        </div>

        {d.retardos.detallePorDia.length === 0 && (
          <div style={{ padding: "10px 12px", background: "rgba(16, 185, 129, 0.08)", borderLeft: "3px solid #10b981", borderRadius: 8, fontSize: 11, color: "#047857", fontWeight: 800 }}>
            ✅ Ni un solo retardo este mes.
          </div>
        )}

        {d.retardos.detallePorDia.map(dia => (
          <div key={dia.fecha} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "7px 10px", borderRadius: 8, marginBottom: 4,
            background: dia.grave ? "rgba(239, 68, 68, 0.08)" : "rgba(245, 158, 11, 0.08)",
            borderLeft: `3px solid ${dia.grave ? "#dc2626" : "#f59e0b"}`,
          }}>
            <div style={{ fontSize: 11.5, fontWeight: 900, color: "#1e1b4b" }}>
              {dia.fechaBonita}
              {dia.grave && <span style={{ fontSize: 9, fontWeight: 900, color: "#dc2626", marginLeft: 6 }}>GRAVE</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: dia.grave ? "#dc2626" : "#b45309" }}>{dia.minutos} min</span>
              <Nota n={dia.nota} />
            </div>
          </div>
        ))}
      </Card>

      {/* Días del mes */}
      <Card titulo={`📅 Días registrados (${d.diasRegistrados})`}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", marginBottom: 8 }}>
          {d.diasTrabajados} trabajados · {d.diasDescanso} de descanso
        </div>

        {d.registros.length === 0 && (
          <div style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8" }}>Sin registros este mes.</div>
        )}

        {(verTodosLosDias ? d.registros : d.registros.slice(0, 10)).map(r => (
          <div key={r.fecha} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
            padding: "6px 0", borderBottom: "1px solid #f1f5f9", opacity: r.descanso ? 0.55 : 1,
          }}>
            <div style={{ minWidth: 82 }}>
              <div style={{ fontSize: 11.5, fontWeight: 900, color: "#1e1b4b" }}>{r.fechaBonita}</div>
              {r.actitudNota && (
                <div style={{ fontSize: 9.5, color: "#b45309", fontWeight: 700, maxWidth: 180, whiteSpace: "normal" }}>📝 {r.actitudNota}</div>
              )}
            </div>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", flex: 1, textAlign: "right" }}>
              {r.descanso ? "😴 descanso" : [
                r.minutos > 0 ? `⏰ ${r.minutos}m` : null,
                r.resenas > 0 ? `⭐ ${r.resenas}` : null,
                r.planilla === "mal" ? "📋 mal" : null,
                r.actitud && r.actitud !== "bien" ? `💪 ${r.actitud}` : null,
                [r.tienda.orden, r.tienda.uniforme, r.tienda.deposito].some(x => x === "mal") ? "🏪 novedad" : null,
              ].filter(Boolean).join(" · ") || "✅ día perfecto"}
            </div>
            <Nota n={r.descanso ? null : r.nota} />
          </div>
        ))}

        {d.registros.length > 10 && (
          <button
            onClick={() => setVerTodosLosDias(v => !v)}
            style={{ marginTop: 8, width: "100%", padding: "8px", fontSize: 11, fontWeight: 900, color: "#7c3aed", background: "rgba(168, 85, 247, 0.1)", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}
          >
            {verTodosLosDias ? "▲ Ver menos" : `▼ Ver los ${d.registros.length} días`}
          </button>
        )}
      </Card>
    </div>
  );
}

function Card({ titulo, children }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 16, padding: "14px 14px", marginBottom: 10,
      boxShadow: "0 2px 10px rgba(124, 58, 237, 0.08)",
      border: "1px solid rgba(168, 85, 247, 0.12)",
    }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: "#5b21b6", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
        {titulo}
      </div>
      {children}
    </div>
  );
}

function Caja({ label, valor, color }) {
  return (
    <div style={{ background: "#f8fafc", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
      <div style={{ fontSize: 9, fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 900, color: color || "#1e1b4b", marginTop: 2 }}>{valor}</div>
    </div>
  );
}

function MiniHero({ label, valor }) {
  return (
    <div style={{ flex: 1, background: "rgba(255,255,255,0.18)", borderRadius: 10, padding: "7px 6px" }}>
      <div style={{ fontSize: 9, fontWeight: 900, opacity: 0.9, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 900, marginTop: 1 }}>{valor}</div>
    </div>
  );
}
