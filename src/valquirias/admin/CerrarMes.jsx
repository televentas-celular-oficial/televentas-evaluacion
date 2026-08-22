// Admin > Cerrar mes
// Portado de PantallaAdmin (App.jsx:1689-1770 + 1856-1936) al estilo Valquirias TLV
//
// Cerrar mes = generar snapshot con notas fijas para siempre
// Requiere: todos los días llenados por Carolina + meta MED/BOG cargada
// Es IRREVERSIBLE (aunque hay opción avanzada de "abrir" en emergencias)
//
// ════════════════════════════════════════════════════════════════════════════
// DE DÓNDE SALEN LOS NÚMEROS QUE SE CONGELAN
// ════════════════════════════════════════════════════════════════════════════
// Antes, el snapshot se calculaba con `datos.registros` / `datos.metas` /
// `datos.vendedoras` — o sea con la copia que tenía ESTE navegador. Si a esa
// copia le faltaba un día (porque la pestaña llevaba horas abierta, o porque la
// lectura de Firestore falló y `cargado` se marcó igual), el mes quedaba
// congelado con notas más bajas PARA SIEMPRE. Y ese snapshot es exactamente lo
// que paga comisiones y premios. Ya ocurrió: al forzar el cierre de julio
// quedaron notas equivocadas.
//
// Ahora hay dos lecturas del servidor y ninguna usa el estado del navegador:
//   1. Vista previa — `leerFrescos()` al abrir la confirmación y otra vez al
//      confirmar. Muestra lo que se va a congelar y detecta si algo cambió
//      mientras la ventana estaba abierta.
//   2. El cálculo que se guarda — dentro de `cerrarMesFresco`, con los
//      documentos leídos DENTRO de la transacción.
// Lo que se ve en pantalla puede envejecer entre clic y clic; lo que se escribe
// no, porque se recalcula en el mismo commit.
//
// `forzarCierre` sigue existiendo (el dueño lo necesita), pero ya no cierra a
// ciegas: dice CON NOMBRE PROPIO a quién se le va a quedar la nota hundida.
//
// ════════════════════════════════════════════════════════════════════════════
// POR QUÉ LOS FALTANTES VAN CON NOMBRE Y AGRUPADOS POR PERSONA
// ════════════════════════════════════════════════════════════════════════════
// La ventana decía "Día 1: 1 vendedora(s) sin registrar" trece veces, truncado
// en ocho con un "… y 5 más". Un conteo sin nombre no es accionable: no dice a
// quién le falta ni por qué, y lo único que queda es forzar el cierre — que
// congela notas hundidas para siempre y con esas notas se pagan comisiones y
// premios.
//
// Ahora `detectarFaltantes` devuelve estructura, no frases: quién, qué días, y
// la causa probable. El caso real de julio 2026 (trece días seguidos, siempre
// la misma persona, desde el día 1) es una fechaIngreso anterior al inicio real
// — se arregla en systemlap, no digitando días que nunca se trabajaron. Un
// hueco en la mitad del mes sí es un día sin digitar, y se distingue. Nada se
// trunca: si son trece días se ven los trece, con scroll propio si hace falta.
// ════════════════════════════════════════════════════════════════════════════

import { useState, useMemo } from "react";
import { useDatos } from "../data/DatosContext.jsx";
import {
  hoyColombia, rolDeMes, calcComisionMensual, tramosDe, pisoAplica, PISO_MED,
} from "../lib/helpers.js";
import { MES_NAMES, esFormulaV2, getIndicadores } from "../../lib/constantes.js";
import { claveMes, calcNotaMensual, fmtN } from "../../lib/calculos.js";

const DOCS_CIERRE = ["registros", "metas", "vendedoras", "snapshots"];

// ---------------------------------------------------------------------------
// TODO lo que sigue es PURO y recibe el paquete de datos como argumento: nada
// lee del estado del componente. Así la misma función sirve para la vista previa
// (datos leídos con getDoc) y para el cálculo definitivo (datos leídos dentro de
// la transacción, donde además puede reejecutarse varias veces).
// ---------------------------------------------------------------------------
const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// "2026-07-01" → "1 de julio de 2026". Si viene raro, se devuelve tal cual:
// más vale enseñar el texto crudo que esconder el dato que hay que corregir.
function fechaLegible(iso) {
  if (typeof iso !== "string") return "sin fecha de ingreso";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  const mes = MESES_LARGOS[Number(m[2]) - 1];
  if (!mes) return iso;
  return `${Number(m[3])} de ${mes} de ${m[1]}`;
}

// [1,2,3,4,7,9,10] → "1 al 4, 7, 9 y 10". Para el titular; el detalle día por
// día se enseña completo aparte (truncar la lista fue justo lo que impidió
// entender el problema).
function comprimirDias(dias) {
  const tramos = [];
  let ini = null, prev = null;
  for (const d of dias) {
    if (ini === null) { ini = d; prev = d; continue; }
    if (d === prev + 1) { prev = d; continue; }
    tramos.push(ini === prev ? `${ini}` : `${ini} al ${prev}`);
    ini = d; prev = d;
  }
  if (ini !== null) tramos.push(ini === prev ? `${ini}` : `${ini} al ${prev}`);
  if (tramos.length === 1) return tramos[0];
  return `${tramos.slice(0, -1).join(", ")} y ${tramos[tramos.length - 1]}`;
}

// ---------------------------------------------------------------------------
// FALTANTES CON NOMBRE Y CON CAUSA
// ---------------------------------------------------------------------------
// Antes esto devolvía frases sueltas del tipo "Día 3: 1 vendedora(s) sin
// registrar", una por día. Con trece días faltantes el dueño veía trece
// renglones anónimos (y encima truncados en 8) y no podía saber a QUIÉN le
// faltaba ni por qué — lo único que quedaba era forzar el cierre, que congela
// notas hundidas para siempre.
//
// Ahora se agrupa POR PERSONA y se le pone causa probable:
//   · "ingreso"      → le faltan días consecutivos desde el primer día en que
//                      era elegible. Casi siempre significa que la fechaIngreso
//                      registrada es anterior a cuando de verdad empezó; se
//                      corrige en systemlap, no digitando días que no trabajó.
//   · "sin-registros"→ no tiene NI UN registro en todo el mes (roster sucio o
//                      alguien que ya no está, marcada activa por error).
//   · "digitacion"   → huecos en la mitad del mes: eso sí son días sin digitar.
function detectarFaltantes({ registros, metas, vendedoras }, añoC, mesC) {
  const activas = (vendedoras || []).filter(v => v.activa !== false);
  const avisos = [];
  const ultimoDia = new Date(añoC, mesC, 0).getDate();
  const dd = n => String(n).padStart(2, "0");
  const ultimoDiaMes = `${añoC}-${dd(mesC)}-${dd(ultimoDia)}`;

  if (activas.length === 0) {
    avisos.push("⚠️ El roster llegó vacío: no hay ninguna vendedora que evaluar");
  }

  const porId = new Map();        // id → { nombre, fechaIngreso, dias: [] }
  const primerElegible = new Map(); // id → primer día del mes en que ya contaba
  const porDia = [];              // [{ dia, nombres: [...] }]

  for (let d = 1; d <= ultimoDia; d++) {
    const f = `${añoC}-${dd(mesC)}-${dd(d)}`;
    const elegiblesDia = activas.filter(v => !v.fechaIngreso || v.fechaIngreso <= f);
    elegiblesDia.forEach(v => { if (!primerElegible.has(v.id)) primerElegible.set(v.id, d); });

    const sinReg = elegiblesDia.filter(v => !registros?.[v.id + "_" + f]);
    if (sinReg.length === 0) continue;

    porDia.push({ dia: d, nombres: sinReg.map(v => v.nombre || `Vendedora #${v.id}`) });
    sinReg.forEach(v => {
      if (!porId.has(v.id)) {
        porId.set(v.id, {
          id: v.id,
          nombre: v.nombre || `Vendedora #${v.id}`,
          ciudad: v.ciudad || null,
          fechaIngreso: v.fechaIngreso || null,
          dias: [],
        });
      }
      porId.get(v.id).dias.push(d);
    });
  }

  const personas = [...porId.values()].map(p => {
    const arranque = primerElegible.get(p.id) ?? 1;
    const diasElegibles = ultimoDia - arranque + 1;
    const consecutivos = p.dias.every((d, i) => i === 0 || d === p.dias[i - 1] + 1);
    const desdeElComienzo = consecutivos && p.dias[0] === arranque;
    const causa = p.dias.length >= diasElegibles
      ? "sin-registros"
      : desdeElComienzo ? "ingreso" : "digitacion";
    return { ...p, rangos: comprimirDias(p.dias), primerDiaElegible: arranque, causa };
  }).sort((a, b) => (b.dias.length - a.dias.length) || a.nombre.localeCompare(b.nombre, "es"));

  const meta = metas?.[claveMes(añoC, mesC)];
  if (!meta || !meta.meta) avisos.push("⚠️ Meta del mes no cargada");
  else if (typeof meta.meta === "object") {
    if (!meta.meta.MED) avisos.push("⚠️ Meta MEDELLÍN no cargada");
    if (!meta.meta.BOG) avisos.push("⚠️ Meta BOGOTÁ no cargada");
  }

  let sinVentas = [];
  if (meta) {
    sinVentas = activas
      .filter(v => !v.fechaIngreso || v.fechaIngreso <= ultimoDiaMes)
      .filter(v => meta.vendidas?.[v.id] === undefined)
      .map(v => ({ id: v.id, nombre: v.nombre || `Vendedora #${v.id}` }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }

  const totalDias = personas.reduce((s, p) => s + p.dias.length, 0);

  return {
    avisos,
    personas,
    porDia,
    sinVentas,
    totalDias,
    hay: avisos.length > 0 || personas.length > 0 || sinVentas.length > 0,
  };
}

// El snapshot exacto que se va a escribir. La vista previa usa ESTA misma
// función, así que lo que se muestra es literalmente lo que se congela.
// ════════════════════════════════════════════════════════════════════════════
// LA COMISIÓN TAMBIÉN SE CONGELA (22-ago-2026)
// ════════════════════════════════════════════════════════════════════════════
// Hasta hoy el cierre congelaba la NOTA pero no la PLATA: la nómina recalculaba
// la comisión de cada mes cada vez que se abría, leyendo `metas[mes].vendidas`,
// que es el documento VIVO que el worker reescribe cada 5 minutos. O sea que un
// resync que tocara las ventas de junio movía la comisión de junio — un mes que
// Luis ya pagó el 15 de julio.
//
// Ahora el cierre guarda la cifra con la que se liquidó y todo lo que hizo
// falta para llegar a ella: las ventas exactas, la ciudad, el rol de ESE mes
// (con la pro-rata si el ascenso cayó dentro), el tramo y el piso vigentes.
// Es la misma regla que ya rige para la nota: si la clave está en el snapshot,
// manda el snapshot (ver calculos.js:434).
//
// Es ADITIVO: los snapshots ya escritos no traen `comision`, así que caen al
// cálculo vivo como siempre. Nada de lo ya cerrado cambia de cifra.
function construirSnapshot({ registros, metas, vendedoras }, añoC, mesC) {
  const ventasDelMes = metas?.[claveMes(añoC, mesC)]?.vendidas || {};

  const snap = {
    año: añoC, mes: mesC,
    version: esFormulaV2(añoC, mesC) ? "v2" : "v1",
    indicadores: getIndicadores(añoC, mesC),
    // Las reglas de plata que regían ESE mes, congeladas al lado de las notas.
    // Los tramos cambian cada 1 de enero y el piso de MED arrancó en ago-2026:
    // guardarlas deja el recibo completo de por qué se pagó lo que se pagó.
    tramos: tramosDe(añoC),
    pisoMed: pisoAplica("MED", añoC, mesC) ? PISO_MED : 0,
    fechaCierre: new Date().toISOString(),
    vendedoras: {},
  };
  (vendedoras || []).forEach(v => {
    const r = calcNotaMensual(registros, metas, v.id, añoC, mesC, null, vendedoras);

    // Mismas dos líneas que usa la nómina (NominaComisiones.jsx:105-119), a
    // propósito: la cifra que se congela tiene que ser exactamente la que el
    // dueño tenía en pantalla al momento de cerrar, no una parecida.
    const ventas = Number(ventasDelMes[v.id]) || 0;
    const { rol, datosCambioRol } = rolDeMes(v, añoC, mesC);
    const calc = calcComisionMensual({
      ciudad: v.ciudad, rol, ventasMes: ventas, datosCambioRol, año: añoC, mes: mesC,
    });

    snap.vendedoras[v.id] = {
      notaBase: r.notaBase, notaVentas: r.notaVentas, notaFinal: r.notaFinal,
      bono: r.bono || 0, dias: r.dias, porInd: r.porInd, detalle: r.detalle,
      real: r.real, meta: r.meta, pct: r.pct,
      // Campo por campo y no `...calc`: el spread dejaría un `comision.comision`
      // dentro del objeto `comision`, que es justo el nombre con el que alguien
      // se equivoca al leerlo. Los pesos se llaman `monto`.
      comision: {
        ventas,
        ciudad: v.ciudad || null,
        rol,
        ascensoEnEsteMes: !!datosCambioRol,
        monto: calc.comision,
        pct: calc.pct ?? null,
        tramo: calc.tramo || null,
        aplicaPiso: !!calc.aplicaPiso,
        pasoPiso: !!calc.pasoPiso,
        detalle: calc.detalle || null,
        proRata: calc.proRata || null,
      },
    };
  });
  return snap;
}

// Resumen legible de ese mismo snapshot: nota y días contados por vendedora.
// Los días son la señal que delata un mes incompleto antes de congelarlo.
function resumirSnapshot(snap, vendedoras) {
  const nombrePorId = {};
  (vendedoras || []).forEach(v => { nombrePorId[v.id] = v.nombre || String(v.id); });

  const filas = Object.entries(snap.vendedoras || {}).map(([id, r]) => ({
    id,
    nombre: nombrePorId[id] || id,
    nota: r.notaFinal,
    dias: r.dias,
  })).sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1));

  const conNota = filas.filter(f => typeof f.nota === "number" && Number.isFinite(f.nota));
  const promedio = conNota.length
    ? Math.round((conNota.reduce((s, f) => s + f.nota, 0) / conNota.length) * 100) / 100
    : null;
  const maxDias = filas.reduce((m, f) => Math.max(m, f.dias || 0), 0);

  return { filas, promedio, conNota: conNota.length, maxDias };
}

// Huella para comparar dos vistas previas: si cambia, alguien escribió algo
// mientras la ventana de confirmación estaba abierta.
function huella(faltantes, resumen) {
  return JSON.stringify([
    faltantes?.avisos || [],
    (faltantes?.personas || []).map(p => [p.id, p.causa, p.dias]),
    (faltantes?.sinVentas || []).map(p => p.id),
    (resumen?.filas || []).map(f => [f.id, f.nota, f.dias]),
  ]);
}

export default function CerrarMes({ onVolver }) {
  const datos = useDatos();
  const hoy = hoyColombia();
  const mesAntAño = hoy.mes === 1 ? hoy.año - 1 : hoy.año;
  const mesAntMes = hoy.mes === 1 ? 12 : hoy.mes - 1;
  const [msg, setMsg] = useState(null);
  const [confirmarCierre, setConfirmarCierre] = useState(null);
  const [confirmarAbrir, setConfirmarAbrir] = useState(null);
  const [mostrarAvanzado, setMostrarAvanzado] = useState(false);
  const [forzarCierre, setForzarCierre] = useState(false);
  const [verificando, setVerificando] = useState(false); // leyendo del servidor
  const [cerrando, setCerrando] = useState(false);       // transacción en vuelo
  const [añoSel, setAñoSel] = useState(mesAntAño);
  const [mesSel, setMesSel] = useState(mesAntMes);

  function flash(txt, tipo = "ok") {
    setMsg({ txt, tipo });
    setTimeout(() => setMsg(null), 6000);
  }

  // Estos SOLO se usan para pintar la lista de meses cerrados y habilitar
  // botones. Ningún número que se congele sale de aquí.
  const snapshots = datos.snapshots || {};

  const mesAntCerrado = !!snapshots[claveMes(mesAntAño, mesAntMes)];

  const cerrados = useMemo(() => {
    return Object.keys(snapshots)
      .map(k => {
        const [y, m] = k.split("_").map(Number);
        return { año: y, mes: m };
      })
      .sort((a, b) => (b.año - a.año) || (b.mes - a.mes));
  }, [snapshots]);

  const mesSelValido = (añoSel < hoy.año) || (añoSel === hoy.año && mesSel < hoy.mes);
  const mesSelYaCerrado = !!snapshots[claveMes(añoSel, mesSel)];

  // Lee del servidor y arma lo que se va a enseñar: faltantes + el snapshot
  // exacto que se congelaría con ese dato.
  async function previsualizar(añoC, mesC) {
    const frescos = await datos.leerFrescos(DOCS_CIERRE);
    const clave = claveMes(añoC, mesC);
    if (frescos.snapshots?.[clave]) {
      const err = new Error(`En el servidor ${MES_NAMES[mesC - 1]} ${añoC} YA está cerrado.`);
      err.yaCerrado = true;
      throw err;
    }
    const faltantes = detectarFaltantes(frescos, añoC, mesC);
    const resumen = resumirSnapshot(construirSnapshot(frescos, añoC, mesC), frescos.vendedoras);
    return { año: añoC, mes: mesC, faltantes, resumen, leidoEn: new Date(), cambioDetectado: false };
  }

  async function intentarCerrar(añoC, mesC) {
    if (verificando || cerrando) return;
    if (snapshots[claveMes(añoC, mesC)]) {
      flash("Este mes ya está cerrado", "err");
      return;
    }
    setVerificando(true);
    try {
      const previa = await previsualizar(añoC, mesC);
      setForzarCierre(false);
      setConfirmarCierre(previa);
    } catch (e) {
      console.error(e);
      // No se abre la ventana de confirmación con datos del navegador: cerrar sin
      // saber qué se congela es justamente lo que hay que evitar.
      flash(
        e?.yaCerrado
          ? e.message
          : `❌ No se pudo leer el dato del servidor (${e?.message || "error de lectura"}). No se cierra a ciegas: revisa la conexión y vuelve a intentar.`,
        "err"
      );
    } finally {
      setVerificando(false);
    }
  }

  async function ejecutarCierre(añoC, mesC) {
    if (cerrando || verificando) return;
    const clave = claveMes(añoC, mesC);
    setCerrando(true);
    try {
      // 1) Recalcular contra el servidor JUSTO ANTES de congelar. Entre que se
      //    abrió esta ventana y ahora, Carolina pudo haber ingresado el día que
      //    faltaba — o haber cambiado algo que baja una nota.
      const previa = await previsualizar(añoC, mesC);
      const cambio = huella(confirmarCierre?.faltantes, confirmarCierre?.resumen) !==
                     huella(previa.faltantes, previa.resumen);
      if (cambio) {
        setConfirmarCierre({ ...previa, cambioDetectado: true });
        setForzarCierre(false); // que vuelva a leerlo y a marcarlo a conciencia
        flash("⚠️ El dato del servidor cambió mientras tenías esta ventana abierta. NO se cerró nada: mira los números nuevos y confirma otra vez.", "err");
        return;
      }

      // 2) Congelar. El snapshot NO se calcula con lo de arriba: se recalcula
      //    dentro de la transacción, con los documentos leídos en ese mismo
      //    commit. Si alguien escribe en el intermedio, Firestore reintenta y el
      //    cálculo se rehace sobre el dato nuevo.
      await datos.cerrarMesFresco(clave, (frescos) => construirSnapshot(frescos, añoC, mesC));
    } catch (e) {
      console.error(e);
      flash(`❌ NO se cerró el mes: ${e?.message || "error guardando"}`, "err");
      return;
    } finally {
      setCerrando(false);
    }
    setConfirmarCierre(null);
    flash(`🔒 ${MES_NAMES[mesC - 1]} ${añoC} cerrado`);
  }

  async function ejecutarApertura(añoC, mesC) {
    // Borrado real de una sola clave: `borrarSnapshot` la declara gobernada y no
    // la manda en el parche, así que desaparece sin tocar los demás meses.
    try {
      await datos.borrarSnapshot(claveMes(añoC, mesC));
    } catch (e) {
      console.error(e);
      flash(`❌ NO se pudo abrir el mes: ${e?.message || "error guardando"}`, "err");
      return;
    }
    setConfirmarAbrir(null);
    flash(`🔓 ${MES_NAMES[mesC - 1]} ${añoC} abierto`);
  }

  return (
    <div className="v-app v-ancho">
      <div className="v-header-detalle">
        <button className="v-back-btn" onClick={onVolver}>‹ Volver</button>
        <div className="v-header-title">🔒 Cerrar mes</div>
        <div style={{ width: 60 }} />
      </div>

      {msg && (
        <div style={{
          padding: "10px 14px", borderRadius: 10, marginBottom: 10,
          fontSize: 12, fontWeight: 800,
          background: msg.tipo === "err" ? "var(--adm-alerta-fondo)" : "var(--vk-bien-fondo)",
          color: msg.tipo === "err" ? "var(--adm-alerta)" : "var(--vk-bien)",
        }}>{msg.txt}</div>
      )}

      <div style={{ padding: "10px 12px", background: "rgba(220, 38, 38, 0.08)", borderLeft: "3px solid var(--adm-alerta)", borderRadius: 10, fontSize: 11, color: "var(--adm-alerta)", fontWeight: 700, marginBottom: 10, lineHeight: 1.55 }}>
        ⚠️ Cerrar un mes deja sus notas <strong>fijas para siempre</strong>. Después de cerrar, ni Carolina ni las vendedoras pueden modificar nada de ese mes. Solo cierra cuando todos los días estén llenos y la meta esté cargada.
      </div>

      {/* Botón principal: cerrar mes anterior */}
      <div className="v-card">
        <div className="v-card-title">📅 Mes anterior</div>
        {!mesAntCerrado ? (
          <button
            disabled={verificando || cerrando}
            onClick={() => intentarCerrar(mesAntAño, mesAntMes)}
            style={{
              width: "100%",
              padding: "14px",
              background: (verificando || cerrando) ? "var(--vk-tenue)" : "var(--adm-alerta)",
              color: "var(--vk-tarjeta)", border: "none", borderRadius: 12,
              fontSize: 15, fontWeight: 900,
              cursor: (verificando || cerrando) ? "default" : "pointer",
              boxShadow: (verificando || cerrando) ? "none" : "0 4px 12px rgba(220, 38, 38, 0.3)",
            }}
          >
            {verificando
              ? "⏳ Leyendo los datos del servidor..."
              : `🔒 Cerrar ${MES_NAMES[mesAntMes - 1]} ${mesAntAño}`}
          </button>
        ) : (
          <div style={{ padding: "14px", background: "var(--vk-noche)", borderRadius: 12, fontSize: 14, fontWeight: 900, color: "var(--vk-noche-apoyo)", textAlign: "center" }}>
            ✅ {MES_NAMES[mesAntMes - 1]} {mesAntAño} ya está cerrado
          </div>
        )}
      </div>

      {/* Lista de meses cerrados — SIEMPRE visible */}
      <div className="v-card">
        <div className="v-card-title">🔒 Meses cerrados</div>
        {cerrados.length === 0 ? (
          <div style={{ padding: "12px", fontSize: 12, color: "var(--vk-secundario)", fontWeight: 700, textAlign: "center", fontStyle: "italic" }}>
            Aún no hay meses cerrados este año.
          </div>
        ) : (
          <>
            {cerrados.map(c => (
              <div key={`${c.año}-${c.mes}`} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "8px 10px", background: "var(--est-atencion-fondo)", borderRadius: 8,
                marginBottom: 3, fontSize: 12, fontWeight: 800, color: "var(--vk-noche-apoyo)",
              }}>
                <span>🔒 {MES_NAMES[c.mes - 1]} {c.año}</span>
                <button
                  onClick={() => setConfirmarAbrir({ año: c.año, mes: c.mes })}
                  style={{ background: "transparent", border: "1px solid var(--adm-alerta)", color: "var(--adm-alerta)", padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 800, cursor: "pointer" }}
                >🔓 Abrir</button>
              </div>
            ))}
            <div style={{ fontSize: 10, color: "var(--vk-tenue)", fontWeight: 700, marginTop: 6, fontStyle: "italic" }}>
              ⚠️ Abrir un mes descongela sus notas — usa solo en emergencias.
            </div>
          </>
        )}
      </div>

      {/* Toggle avanzado */}
      <button
        onClick={() => setMostrarAvanzado(!mostrarAvanzado)}
        style={{ background: "none", border: "none", color: "var(--vk-secundario)", textDecoration: "underline", cursor: "pointer", fontSize: 11, fontWeight: 700, padding: "8px 0", display: "block", margin: "0 auto" }}
      >
        {mostrarAvanzado ? "Ocultar opciones avanzadas" : "Cerrar otro mes / opciones avanzadas"}
      </button>

      {mostrarAvanzado && (
        <div className="v-card" style={{ background: "rgba(168, 85, 247, 0.04)", border: "1px dashed rgba(168, 85, 247, 0.3)" }}>
          <div className="v-card-title" style={{ color: "var(--vk-secundario)" }}>🛠️ Cerrar mes específico</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <select value={añoSel} onChange={e => setAñoSel(Number(e.target.value))} style={inputStyle}>
              {[hoy.año - 1, hoy.año].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={mesSel} onChange={e => setMesSel(Number(e.target.value))} style={inputStyle}>
              {MES_NAMES.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
            </select>
          </div>
          {!mesSelValido && (
            <div style={{ fontSize: 11, color: "var(--adm-alerta)", marginBottom: 6, fontWeight: 700 }}>⚠️ No puedes cerrar el mes en curso ni un mes futuro.</div>
          )}
          {mesSelYaCerrado && (
            <div style={{ fontSize: 11, color: "var(--vk-noche-apoyo)", marginBottom: 6, fontWeight: 700 }}>✅ Ese mes ya está cerrado.</div>
          )}
          <button
            disabled={!mesSelValido || mesSelYaCerrado || verificando || cerrando}
            onClick={() => intentarCerrar(añoSel, mesSel)}
            style={{
              width: "100%", padding: "10px",
              background: (mesSelValido && !mesSelYaCerrado && !verificando && !cerrando) ? "var(--adm-alerta)" : "var(--vk-borde)",
              color: (mesSelValido && !mesSelYaCerrado && !verificando && !cerrando) ? "var(--vk-tarjeta)" : "var(--vk-tenue)",
              border: "none", borderRadius: 10, fontSize: 13, fontWeight: 800,
              cursor: (mesSelValido && !mesSelYaCerrado && !verificando && !cerrando) ? "pointer" : "not-allowed",
            }}
          >
            {verificando ? "⏳ Leyendo del servidor..." : `🔒 Cerrar ${MES_NAMES[mesSel - 1]} ${añoSel}`}
          </button>
        </div>
      )}

      {/* Modal confirmar cierre */}
      {confirmarCierre && (
        <div style={modalBackdrop} onClick={() => { if (!cerrando) setConfirmarCierre(null); }}>
          <div style={{ ...modalCard, maxHeight: "88vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 900, color: "var(--adm-alerta)", marginBottom: 8 }}>
              🔒 Cerrar {MES_NAMES[confirmarCierre.mes - 1]} {confirmarCierre.año}
            </div>
            <div style={{ fontSize: 13, color: "var(--vk-secundario)", marginBottom: 12, lineHeight: 1.5 }}>
              Esta acción es <strong>IRREVERSIBLE</strong>. Las notas quedarán fijas para siempre.
            </div>

            {confirmarCierre.cambioDetectado && (
              <div style={{ background: "var(--est-atencion-fondo)", border: "2px solid var(--est-atencion-borde)", padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 11.5, color: "var(--vk-noche-apoyo)", fontWeight: 800, lineHeight: 1.5 }}>
                🔄 Los datos del servidor cambiaron mientras esta ventana estaba abierta.
                No se cerró nada. Abajo están los números nuevos — revísalos y confirma otra vez.
              </div>
            )}

            {/* Lo que se va a congelar, recalculado con el dato del servidor */}
            <div style={{ background: "var(--vk-fondo)", border: "1px solid var(--vk-borde)", borderRadius: 10, padding: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: "var(--vk-secundario)", marginBottom: 2 }}>
                📸 Esto es lo que se congela
              </div>
              <div style={{ fontSize: 10, color: "var(--vk-secundario)", fontWeight: 700, marginBottom: 8 }}>
                Leído del servidor a las {confirmarCierre.leidoEn.toLocaleTimeString("es-CO")} — no de esta pantalla.
                Se vuelve a leer y a recalcular al confirmar.
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--vk-titulo)", marginBottom: 6 }}>
                {confirmarCierre.resumen.conNota} nota(s) · promedio {fmtN(confirmarCierre.resumen.promedio)} ·
                máximo {confirmarCierre.resumen.maxDias} día(s) contados
              </div>
              <div style={{ maxHeight: 150, overflowY: "auto" }}>
                {confirmarCierre.resumen.filas.length === 0 && (
                  <div style={{ fontSize: 11, color: "var(--adm-alerta)", fontWeight: 800 }}>
                    ⚠️ No hay ninguna vendedora: el snapshot quedaría vacío.
                  </div>
                )}
                {confirmarCierre.resumen.filas.map(f => {
                  const pocosDias = confirmarCierre.resumen.maxDias > 0 && (f.dias || 0) < confirmarCierre.resumen.maxDias;
                  return (
                    <div key={f.id} style={{
                      display: "flex", justifyContent: "space-between", gap: 8,
                      padding: "3px 0", fontSize: 11, fontWeight: 700,
                      color: pocosDias ? "var(--vk-metal-borde)" : "var(--vk-secundario)",
                      borderBottom: "1px solid var(--vk-fondo-hueco)",
                    }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.nombre}</span>
                      <span style={{ flexShrink: 0, fontWeight: 900 }}>
                        {fmtN(f.nota)} <span style={{ fontWeight: 700, color: pocosDias ? "var(--vk-metal-borde)" : "var(--vk-tenue)" }}>· {f.dias || 0} d</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {confirmarCierre.faltantes.hay && (
              <div style={{ background: "var(--est-atencion-fondo)", border: "1px solid var(--vk-metal)", padding: 10, borderRadius: 8, marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: "var(--vk-noche-apoyo)", marginBottom: 6 }}>
                  ⚠️ Faltan datos — esto es exactamente a quién:
                </div>

                {confirmarCierre.faltantes.avisos.length > 0 && (
                  <ul style={{ margin: "0 0 8px", padding: "0 0 0 16px", fontSize: 11, color: "var(--vk-noche-apoyo)", fontWeight: 800 }}>
                    {confirmarCierre.faltantes.avisos.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                )}

                {/* AGRUPADO POR PERSONA — la vista que resuelve el problema de un
                    vistazo. Nunca se trunca: si son trece días, se ven los trece.
                    Si la lista crece, este bloque tiene su propio scroll. */}
                {confirmarCierre.faltantes.personas.length > 0 && (
                  <div style={{ maxHeight: 260, overflowY: "auto", paddingRight: 2 }}>
                    {confirmarCierre.faltantes.personas.map(p => (
                      <div key={p.id} style={{
                        background: "var(--vk-tarjeta)", border: "1px solid var(--vk-metal)", borderRadius: 8,
                        padding: "7px 9px", marginBottom: 6, lineHeight: 1.5,
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: "var(--est-medio)" }}>
                          {p.nombre}{p.ciudad ? ` · ${p.ciudad}` : ""} — le faltan {p.dias.length} día{p.dias.length === 1 ? "" : "s"}: {p.rangos}
                        </div>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--vk-noche-apoyo)", marginTop: 2 }}>
                          Días exactos: {p.dias.join(", ")}
                        </div>

                        {p.causa === "ingreso" && (
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--est-medio)", marginTop: 4, background: "var(--vk-noche)", borderLeft: "3px solid var(--est-atencion-borde)", padding: "5px 7px", borderRadius: 5 }}>
                            📌 {p.fechaIngreso
                              ? <>Figura ingresando el <strong>{fechaLegible(p.fechaIngreso)}</strong></>
                              : <>No tiene <strong>fecha de ingreso registrada</strong>, así que se la espera desde el día 1</>}
                            {" "}y le faltan
                            todos los días seguidos desde ahí. Casi siempre significa que la fecha de ingreso
                            registrada es <strong>anterior</strong> a cuando de verdad empezó a trabajar.
                            No son días sin digitar: <strong>se corrige la fecha de ingreso en systemlap</strong> y
                            estos días dejan de faltar solos.
                          </div>
                        )}
                        {p.causa === "sin-registros" && (
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--est-medio)", marginTop: 4, background: "var(--vk-noche)", borderLeft: "3px solid var(--est-atencion-borde)", padding: "5px 7px", borderRadius: 5 }}>
                            📌 No tiene <strong>ningún</strong> registro en todo el mes
                            {p.fechaIngreso ? <> (figura ingresando el {fechaLegible(p.fechaIngreso)})</> : null}.
                            O ya no trabaja y sigue marcada como activa, o su fecha de ingreso está mal.
                            Revísalo en systemlap antes de cerrar.
                          </div>
                        )}
                        {p.causa === "digitacion" && (
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--est-medio)", marginTop: 4, background: "var(--vk-noche)", borderLeft: "3px solid var(--est-atencion-borde)", padding: "5px 7px", borderRadius: 5 }}>
                            📌 Son huecos <strong>en la mitad del mes</strong>, no un problema de fecha de
                            ingreso: esos días sí están sin digitar. Hay que ingresarlos en Ingreso diario
                            antes de cerrar.
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {confirmarCierre.faltantes.sinVentas.length > 0 && (
                  <div style={{ fontSize: 11, fontWeight: 800, color: "var(--vk-noche-apoyo)", marginTop: 4 }}>
                    💰 Sin ventas cargadas: {confirmarCierre.faltantes.sinVentas.map(v => v.nombre).join(", ")}
                  </div>
                )}

                {/* Desglose por día, completo y sin cortar, por si hace falta */}
                {confirmarCierre.faltantes.porDia.length > 0 && (
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ fontSize: 10.5, fontWeight: 800, color: "var(--vk-noche-apoyo)", cursor: "pointer" }}>
                      Ver el desglose día por día ({confirmarCierre.faltantes.porDia.length} día(s))
                    </summary>
                    <div style={{ maxHeight: 160, overflowY: "auto", marginTop: 4 }}>
                      {confirmarCierre.faltantes.porDia.map(d => (
                        <div key={d.dia} style={{ fontSize: 10.5, color: "var(--vk-noche-apoyo)", fontWeight: 700, padding: "1px 0" }}>
                          Día {d.dia}: {d.nombres.join(", ")}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
            {(() => {
              const bloqueado = confirmarCierre.faltantes.hay && !forzarCierre;
              const inhabilitado = bloqueado || cerrando;
              return (
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    disabled={cerrando}
                    onClick={() => setConfirmarCierre(null)}
                    style={{ flex: 1, padding: "10px", background: "var(--vk-fondo-hueco)", color: "var(--vk-secundario)", border: "none", borderRadius: 8, fontWeight: 800, cursor: cerrando ? "default" : "pointer" }}
                  >Cancelar</button>
                  <button
                    disabled={inhabilitado}
                    onClick={() => ejecutarCierre(confirmarCierre.año, confirmarCierre.mes)}
                    style={{
                      flex: 1, padding: "10px",
                      background: inhabilitado ? "var(--vk-borde)" : "var(--adm-alerta)",
                      color: inhabilitado ? "var(--vk-tenue)" : "var(--vk-tarjeta)",
                      border: "none", borderRadius: 8, fontWeight: 800,
                      cursor: inhabilitado ? "not-allowed" : "pointer",
                    }}
                    title={bloqueado ? "Completa los faltantes o activa Forzar cierre" : "Cerrar mes"}
                  >{cerrando ? "⏳ Cerrando..." : "🔒 Cerrar"}</button>
                </div>
              );
            })()}
            {confirmarCierre.faltantes.hay && (
              <>
                <div style={{ marginTop: 8, fontSize: 10, color: "var(--adm-alerta)", fontWeight: 700, textAlign: "center" }}>
                  ⚠️ No se puede cerrar mientras haya datos faltantes.
                </div>
                {/* La advertencia tiene que decir exactamente qué pasa, sin rodeos:
                    forzar no "completa" nada, congela el mes incompleto — y ahora
                    dice CON NOMBRE PROPIO a quién le queda la nota hundida. */}
                <div style={{ marginTop: 10, padding: "10px 12px", background: "var(--adm-alerta-fondo)", border: "2px solid var(--adm-alerta)", borderRadius: 8, fontSize: 11, color: "var(--adm-alerta)", fontWeight: 800, lineHeight: 1.55 }}>
                  🛑 Si fuerzas el cierre, los días que faltan <strong>NO se cuentan</strong>:
                  {confirmarCierre.faltantes.personas.length > 0 && (
                    <div style={{ margin: "6px 0" }}>
                      {confirmarCierre.faltantes.personas.map(p => (
                        <div key={p.id} style={{ padding: "3px 0", borderBottom: "1px solid var(--adm-alerta-borde)" }}>
                          A <strong>{p.nombre}</strong> se le contarán <strong>{p.dias.length} día
                          {p.dias.length === 1 ? "" : "s"} no trabajado{p.dias.length === 1 ? "" : "s"}</strong> y
                          su nota de {MES_NAMES[confirmarCierre.mes - 1]} {confirmarCierre.año} quedará fija
                          con ese castigo.
                        </div>
                      ))}
                    </div>
                  )}
                  Con esas notas se pagan las comisiones y se reparten los premios del trimestre.
                  <br />
                  Corregirlo después obliga a <strong>abrir el mes y volver a cerrarlo</strong>, y los
                  indicadores del día no se pueden recuperar: son la foto de ese día.
                </div>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 8, padding: "8px 10px", background: "rgba(124, 58, 237, 0.06)", border: "1px dashed rgba(124, 58, 237, 0.3)", borderRadius: 8, fontSize: 11, color: "var(--vk-secundario)", fontWeight: 800, cursor: "pointer", lineHeight: 1.5 }}>
                  <input
                    type="checkbox"
                    checked={forzarCierre}
                    onChange={e => setForzarCierre(e.target.checked)}
                    style={{ marginTop: 2, flexShrink: 0 }}
                  />
                  <span>
                    🛠️ Forzar el cierre igual. Entiendo que congelo {MES_NAMES[confirmarCierre.mes - 1]}{" "}
                    {confirmarCierre.año} dejando {confirmarCierre.faltantes.totalDias} día(s) sin contar
                    {confirmarCierre.faltantes.personas.length > 0 && (
                      <> a {confirmarCierre.faltantes.personas.map(p => p.nombre).join(", ")}</>
                    )}, y que las notas de arriba son las definitivas.
                  </span>
                </label>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal confirmar abrir */}
      {confirmarAbrir && (
        <div style={modalBackdrop} onClick={() => setConfirmarAbrir(null)}>
          <div style={modalCard} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 900, color: "var(--adm-alerta)", marginBottom: 8 }}>
              🔓 ¿Abrir {MES_NAMES[confirmarAbrir.mes - 1]} {confirmarAbrir.año}?
            </div>
            <div style={{ fontSize: 13, color: "var(--vk-secundario)", marginBottom: 12, lineHeight: 1.5 }}>
              Descongelará el mes — Carolina podrá volver a modificar registros. Solo úsalo en emergencias reales.
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => setConfirmarAbrir(null)}
                style={{ flex: 1, padding: "10px", background: "var(--vk-fondo-hueco)", color: "var(--vk-secundario)", border: "none", borderRadius: 8, fontWeight: 800, cursor: "pointer" }}
              >Cancelar</button>
              <button
                onClick={() => ejecutarApertura(confirmarAbrir.año, confirmarAbrir.mes)}
                style={{ flex: 1, padding: "10px", background: "var(--adm-alerta)", color: "var(--vk-tarjeta)", border: "none", borderRadius: 8, fontWeight: 800, cursor: "pointer" }}
              >🔓 Abrir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: "1.5px solid var(--est-sin-dato)", fontSize: 14, fontFamily: "inherit",
  fontWeight: 700, color: "var(--vk-titulo)", background: "var(--vk-tarjeta)",
};
const modalBackdrop = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: 20, zIndex: 300,
};
const modalCard = {
  background: "var(--vk-tarjeta)", borderRadius: 16, padding: 20,
  maxWidth: 380, width: "100%",
  boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
};
