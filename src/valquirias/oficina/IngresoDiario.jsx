// Panel del operador (rol oficina) — Ingreso diario de indicadores
// Portado de PantallaIngreso vieja (App.jsx:1067-1250)
//
// Flujo:
// 1. Elige fecha (por defecto hoy)
// 2. Marca quién descansó — esas no llenan indicadores
// 3. Por cada vendedora que trabajó:
//    - Min tarde (0-150, con -/+)
//    - Reseñas (0-50, con -/+)
//    - Tienda: orden / uniforme / depósito (bien/mal cada uno)
//    - Planilla: bien/mal
//    - Actitud: bien/regular/mal → si regular/mal, obligatorio "qué pasó"
// 4. Guardar día

import { useState, useMemo, useEffect, useRef } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase.js";
import { primerNombre, hoyColombia } from "../lib/helpers.js";
import { VENDEDORAS_DEFAULT, rolDe } from "../../lib/constantes.js";
import { useDatos } from "../data/DatosContext.jsx";
import { notaDia, claveMes, fmtN, colorN, bgN } from "../../lib/calculos.js";

// Sin conexión, la promesa de un guardado de Firestore puede no resolver NUNCA
// (el SDK lo deja en cola esperando red). Sin este límite el botón se quedaba en
// "⏳ Guardando..." para siempre y no había forma de saber si guardó o no.
const LIMITE_GUARDADO_MS = 20000;

function conLimiteDeTiempo(promesa, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      const e = new Error(`Pasaron ${Math.round(ms / 1000)} segundos sin respuesta del servidor.`);
      e.esTimeout = true;
      reject(e);
    }, ms);
    Promise.resolve(promesa).then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

function diaVacio() {
  return {
    minutos: 0,
    resenas: 0,
    tienda_orden: "bien",
    tienda_uniforme: "bien",
    tienda_deposito: "bien",
    planilla: "bien",
    actitud: "bien",
    actitud_nota: "",
    descanso: false,
  };
}

const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

export default function IngresoDiario({ vendedoras = VENDEDORAS_DEFAULT, onGuardar, user = null }) {
  // Los datos crudos se leen directamente del contexto (no de props): esta pantalla
  // necesita `registros` para precargar el día y `snapshots` para saber si el mes
  // ya está cerrado. Ver App.jsx:426-438 y App.jsx:1075.
  const datos = useDatos();
  // Memoizados: `registros` es dependencia del efecto de precarga; si su identidad
  // cambiara en cada render el efecto se dispararía en bucle.
  const registros = useMemo(() => datos.registros || {}, [datos.registros]);
  const snapshots = useMemo(() => datos.snapshots || {}, [datos.snapshots]);

  const hoy = hoyColombia();
  const [fecha, setFecha] = useState(hoy.iso);
  // Sólo se salta al día pendiente UNA vez, al abrir. Después manda quien llena:
  // si escoge una fecha a mano, nadie se la mueve.
  const saltoInicial = useRef(false);
  const [filas, setFilas] = useState({});
  const [guardado, setGuardado] = useState(false);        // el día YA tiene registros en Firestore
  const [recienGuardado, setRecienGuardado] = useState(false); // se acaba de guardar en esta sesión
  const [tocadas, setTocadas] = useState(() => new Set()); // vids revisadas en esta sesión
  const [erroresFalt, setErroresFalt] = useState([]);
  const [guardando, setGuardando] = useState(false);      // transacción en vuelo
  const [errorGuardado, setErrorGuardado] = useState(null); // falló el guardado: hay que VERLO
  // "error" = seguro que NO se guardó · "timeout" = no se puede afirmar ninguna
  // de las dos cosas, y decir "no se guardó" sería tan mentira como decir que sí.
  const [tipoFallo, setTipoFallo] = useState("error");

  // Año/mes del día que se está llenando (para nota del día y guard de mes cerrado)
  const [añoIng, mesIng] = useMemo(() => {
    const [y, m] = fecha.split("-");
    return [parseInt(y, 10), parseInt(m, 10)];
  }, [fecha]);

  // ─── Guard de mes cerrado (App.jsx:1075, 1082-1086) ───
  const mesCerrado = !!snapshots[claveMes(añoIng, mesIng)];

  const activas = useMemo(
    // `activa !== false` y NO `activa` truthy: una vendedora sin el campo `activa`
    // en Firestore debe seguir apareciendo (App.jsx usa el mismo criterio).
    () => (vendedoras || []).filter(v => v.activa !== false),
    [vendedoras]
  );

  // ─── Quién puede corregir un día ya guardado (App.jsx:1090-1097) ──────────
  // La app clásica solo dejaba al admin tocar un día ya registrado; al operador
  // le decía "Para corregir el día, contacta al admin" (App.jsx:1249). Ese
  // bloqueo se perdió al reescribir la pantalla y se restaura aquí.
  //
  // Sin `user` (o con un usuario que no es el admin) NO se asume permiso: lo
  // seguro es tratarlo como operador.
  const esAdminSesion = rolDe(user) === "admin";

  // Fuente de verdad EN VIVO de si el día ya tiene datos: se lee de `registros`
  // (el onSnapshot de Firestore), no del estado `guardado`. Así el bloqueo no
  // depende de que un efecto haya corrido ni de nada que viva solo en pantalla.
  const diaYaTieneDatos = useMemo(
    () => activas.some(v => !!registros[`${v.id}_${fecha}`]),
    [activas, registros, fecha]
  );

  // Un día VACÍO lo puede llenar cualquiera de los dos —es lo que el operador
  // está haciendo con los días de julio que faltan—. Un día YA GUARDADO solo lo
  // modifica el admin.
  const bloqueadoPorGuardado = diaYaTieneDatos && !esAdminSesion;

  // Los dos motivos por los que la pantalla queda en solo lectura. Se mantienen
  // separados porque el aviso y el texto del botón son distintos en cada caso.
  const soloLectura = mesCerrado || bloqueadoPorGuardado;

  // ─── Precarga del día (App.jsx:426-438) ───
  // Al cambiar de fecha (o al llegar los datos) las filas se inicializan con lo
  // que YA está registrado. Antes se hacía setFilas({}) y un día guardado se veía
  // en blanco, obligando a rellenarlo desde cero y pisando lo anterior.
  const fechaCargadaRef = useRef(null);
  const tocadasRef = useRef(new Set());

  useEffect(() => {
    if (!datos.cargado || activas.length === 0) return;
    const cambioDeDia = fechaCargadaRef.current !== fecha;

    // `registros` es un onSnapshot en vivo: si ya hay ediciones locales del mismo
    // día, no las pisamos con lo que llega de Firestore (incluido nuestro propio
    // guardado). Solo re-inicializamos al cambiar de día o mientras no se ha tocado nada.
    if (!cambioDeDia && tocadasRef.current.size > 0) return;

    fechaCargadaRef.current = fecha;
    const init = {};
    activas.forEach(v => {
      const reg = registros[`${v.id}_${fecha}`];
      init[v.id] = reg ? { ...diaVacio(), ...reg } : diaVacio();
    });
    setFilas(init);
    setGuardado(activas.some(v => registros[`${v.id}_${fecha}`]));

    if (cambioDeDia) {
      tocadasRef.current = new Set();
      setTocadas(tocadasRef.current);
      setRecienGuardado(false);
      setErroresFalt([]);
    }
  }, [fecha, activas, registros, datos.cargado]);

  function setFila(vid, campo, valor) {
    // Un día ya guardado no se toca desde aquí. Antes el control simplemente no
    // respondía y ella no sabía por qué; ahora lo dice al intentarlo, que es
    // cuando la explicación sirve.
    if (bloqueadoPorGuardado && !mesCerrado) {
      setTipoFallo("bloqueo");
      setErrorGuardado("Para modificar contacta al admin.");
      return;
    }
    if (soloLectura) return;
    setFilas(f => ({ ...f, [vid]: { ...(f[vid] || diaVacio()), [campo]: valor } }));
    if (!tocadasRef.current.has(vid)) {
      tocadasRef.current = new Set(tocadasRef.current).add(vid);
      setTocadas(tocadasRef.current);
    }
    if (recienGuardado) setRecienGuardado(false);
  }

  const trabajan = activas.filter(v => !filas[v.id]?.descanso);

  // --------------------------------------------------------------------------
  // LOS DÍAS QUE FALTAN POR LLENAR
  // --------------------------------------------------------------------------
  // Esta pantalla se llena CON RETRASO, por diseño de la casa: hoy se llena el
  // de ayer, y el lunes se llenan viernes, sábado y domingo. Abrirla en la fecha
  // de HOY —que es justo la que nadie va a llenar— obligaba a cambiar la fecha a
  // mano cada vez, y de ahí salían los días saltados que después trababan el
  // cierre del mes.
  //
  // Pendiente = un día del mes en curso, anterior a hoy, sin UN SOLO registro.
  // Un día a medias no se cuenta como pendiente: alguien ya lo estaba llenando y
  // mandarla allá sería peor. Y no se mira más atrás del mes en curso porque un
  // mes cerrado ya no se puede tocar.
  const pendientes = useMemo(() => {
    const out = [];
    const mm = String(hoy.mes).padStart(2, "0");
    for (let d = 1; d < hoy.dia; d++) {
      const f = `${hoy.año}-${mm}-${String(d).padStart(2, "0")}`;
      if (!activas.some(v => !!registros[`${v.id}_${f}`])) out.push(f);
    }
    return out;
  }, [activas, registros, hoy.año, hoy.mes, hoy.dia]);

  // Al abrir, saltar al MÁS VIEJO pendiente. Una sola vez y sólo cuando los
  // datos ya llegaron: antes de eso `registros` está vacío y TODO parecería
  // pendiente.
  useEffect(() => {
    if (saltoInicial.current || !datos.cargado || !activas.length) return;
    saltoInicial.current = true;
    if (pendientes.length) setFecha(pendientes[0]);
  }, [datos.cargado, activas.length, pendientes]);

  const activasMed = activas.filter(v => v.ciudad === "MED");
  const activasBog = activas.filter(v => v.ciudad === "BOG");

  async function guardarDia() {
    if (mesCerrado) return; // no se guarda nada sobre un mes ya cerrado
    if (guardando) return;  // evita doble commit por doble clic

    // ── Bloqueo REAL del día ya guardado, no cosmético ───────────────────────
    // Deshabilitar el botón no basta. Aquí se vuelve a comprobar contra
    // `registros` —el snapshot vivo de Firestore, no el estado de la pantalla—
    // justo antes de escribir. Si un no-admin llega hasta esta función con un
    // día que ya tiene datos (botón rehabilitado desde el inspector, un render
    // viejo, lo que sea), la escritura se corta ANTES de llamar a onGuardar:
    // no sale nada hacia Firestore.
    if (!esAdminSesion && activas.some(v => !!registros[`${v.id}_${fecha}`])) {
      setTipoFallo("bloqueo");
      setErrorGuardado(
        "Para modificar contacta al admin."
      );
      return;
    }

    // Validar actitud regular/mal con motivo
    const faltantes = trabajan.filter(v => {
      const f = filas[v.id];
      if (!f) return false;
      const necesita = f.actitud === "regular" || f.actitud === "mal";
      const tiene = (f.actitud_nota || "").trim().length > 0;
      return necesita && !tiene;
    }).map(v => v.id);

    if (faltantes.length > 0) {
      setErroresFalt(faltantes);
      // Scroll a la primera con error
      setTimeout(() => {
        const el = document.querySelector(`[data-actitud-vid="${faltantes[0]}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
      return;
    }

    setErroresFalt([]);

    // ── Nada que guardar NO es un guardado exitoso ───────────────────────────
    // Si el roster llega vacío (la lectura de `vendedoras` falló, o todavía no
    // sincronizó), `activas` queda en [] y el parche sale vacío: la escritura
    // resolvía sin escribir un solo registro y la pantalla pintaba "✅ Día
    // guardado". Carolina se iba tranquila y ese día no existía. Se corta aquí,
    // y DatosContext.guardarDiaRegistros lo vuelve a cortar por si acaso.
    if (activas.length === 0) {
      setTipoFallo("error");
      setErrorGuardado(
        "No hay ninguna vendedora en pantalla, así que no se escribió nada. " +
        "El equipo llega sincronizado desde systemlap: recarga la página, espera a ver los nombres " +
        "y vuelve a guardar. Si sigue vacío, avísale a Luis antes de seguir llenando días."
      );
      return;
    }

    // Se escriben TODAS las activas, no solo las que se tocaron (App.jsx:470-476).
    // Antes, una vendedora sin novedades no generaba registro y su día "bien"
    // simplemente no existía para el cálculo mensual.
    const payload = {};
    activas.forEach(v => {
      payload[v.id] = { ...diaVacio(), ...(filas[v.id] || {}), vid: v.id, fecha };
    });

    // `vids` = las vendedoras que ESTA pantalla mostró para ESTE día: son las
    // únicas claves que el guardado gobierna. Si una de ellas dejara de venir en
    // el payload, su registro del día se borra de verdad. Cualquier otra clave
    // —otro día, u otra vendedora que esta pantalla no mostró— queda intacta.
    const vids = activas.map(v => v.id);

    setGuardando(true);
    setErrorGuardado(null);
    try {
      const promesa = onGuardar?.({ fecha, filas: payload, vids });
      if (!promesa || typeof promesa.then !== "function") {
        // Sin promesa no hay forma de saber si escribió: no se puede pintar ✅.
        throw new Error(
          "Esta pantalla no está conectada al guardado (no devolvió una promesa). No se escribió nada."
        );
      }
      await conLimiteDeTiempo(promesa, LIMITE_GUARDADO_MS);
      setGuardado(true);
      setRecienGuardado(true);
    } catch (e) {
      // Nada de fallar en silencio: el operador NO puede irse creyendo que guardó.
      console.error("Falló el guardado del día", fecha, e);
      setRecienGuardado(false);
      setTipoFallo(e?.esTimeout ? "timeout" : "error");
      setErrorGuardado(e?.message || "No se pudo guardar. Revisa tu conexión e inténtalo otra vez.");
    } finally {
      setGuardando(false);
    }
  }

  const progresoLlenado = trabajan.filter(
    v => tocadas.has(v.id) || registros[`${v.id}_${fecha}`]
  ).length;

  return (
    <div className="v-app v-ancho">
      <div className="v-header">
        <div className="v-brand">Indicadores TLV</div>
        <button
          onClick={() => signOut(auth)}
          style={{ fontSize: 11, fontWeight: 700, color: "var(--vk-tenue)", background: "transparent", border: "1px solid var(--vk-borde)", padding: "6px 10px", borderRadius: 8, cursor: "pointer" }}
        >Salir</button>
      </div>

      <div className="v-greeting">
        Hola <strong>operador</strong> <span className="v-role-mini oficina">Oficina</span>
        <div style={{ marginTop: 4, fontSize: 12, color: "var(--vk-secundario)", fontWeight: 900 }}>📝 Ingreso diario de indicadores</div>
      </div>

      {/* Aviso de mes cerrado — solo lectura (App.jsx:1082-1086) */}
      {mesCerrado && (
        <div style={{ background: "var(--adm-alerta-fondo)", border: "2px solid var(--adm-alerta-borde)", borderRadius: 12, padding: "10px 14px", marginBottom: 10, fontSize: 12.5, fontWeight: 800, color: "var(--adm-alerta)" }}>
          🔒 Este mes ya está CERRADO. Estás viendo el día en modo solo lectura: no se puede cambiar ni guardar nada. Para corregirlo hay que reabrir el mes desde Admin.
        </div>
      )}

      {/* Día ya guardado y quien mira no es el admin (App.jsx:1090-1097, 1249).
          Tono: no es un error suyo ni un regaño. El día está bien, simplemente
          ya quedó registrado y cambiarlo le toca al admin. Se dice además que
          los días vacíos los sigue pudiendo llenar, que es lo que está haciendo
          ahora mismo con julio. No se pinta junto al de mes cerrado: ese ya
          explica que no se puede guardar nada. */}

      {/* Roster vacío — el aviso va ANTES de que llene nada, no después de
          guardar. `cargado` se marca incluso si la lectura de Firestore falló
          (DatosContext.jsx:211-217), así que esta pantalla puede llegar aquí sin
          una sola vendedora y con todo lo demás aparentemente normal. */}
      {datos.cargado && activas.length === 0 && (
        <div style={{ background: "var(--vk-noche)", border: "2px solid var(--est-atencion-borde)", borderRadius: 12, padding: "10px 14px", marginBottom: 10, fontSize: 12.5, fontWeight: 800, color: "var(--vk-noche-apoyo)", lineHeight: 1.55 }}>
          ⚠️ No llegó ninguna vendedora. No se puede guardar el día así: no habría a quién registrarle nada.
          El equipo se sincroniza desde systemlap — recarga la página y espera a ver los nombres.
          Si sigue vacío, avísale a Luis.
        </div>
      )}

      {/* Selector de fecha */}
      <div className="v-card" style={{ background: "var(--vk-fondo)", borderLeft: "4px solid var(--vk-secundario)", border: "1px solid rgba(6, 182, 212, 0.2)" }}>
        <label style={{ fontSize: 11, fontWeight: 900, color: "var(--vk-secundario)", textTransform: "uppercase", letterSpacing: 1.2, display: "block", marginBottom: 6 }}>📆 Fecha del día a llenar</label>
        <input
          type="date"
          value={fecha}
          max={hoy.iso}
          onChange={e => setFecha(e.target.value)}
          style={{ width: "100%", padding: "10px 12px", border: "1.5px solid var(--vk-secundario)", borderRadius: 10, fontSize: 15, fontFamily: "inherit", fontWeight: 700, color: "var(--vk-secundario)", background: "var(--vk-tarjeta)" }}
        />
        {/* `!errorGuardado`: nunca un ✅ verde al lado del aviso de que NO se guardó */}
        {guardado && !errorGuardado && (
          <div style={{ marginTop: 10, padding: "8px 12px", background: "var(--vk-bien-fondo)", color: "var(--vk-bien)", borderRadius: 8, fontSize: 13, fontWeight: 800, textAlign: "center" }}>
            {recienGuardado
              ? `✅ Día ${fecha} guardado`
              : esAdminSesion
                ? "✅ Día guardado"
                : "✅ Día guardado"}
          </div>
        )}
      </div>

      {/* LOS DÍAS QUE FALTAN — sólo aparece si de verdad falta alguno.
          Cada uno es un botón: se toca y se va directo a llenarlo, sin pelear
          con el calendario. El que se está llenando queda marcado. */}
      {pendientes.length > 0 && (
        <div style={{
          background: "var(--est-atencion-fondo)", border: "1px solid var(--est-atencion-borde)",
          borderRadius: 12, padding: "10px 12px", marginBottom: 10,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1.1,
            color: "var(--vk-noche-apoyo)", marginBottom: 7,
          }}>
            {pendientes.length === 1 ? "1 día sin llenar" : `${pendientes.length} días sin llenar`}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {pendientes.map(f => {
              const [, , dd] = f.split("-");
              const activo = f === fecha;
              return (
                <button
                  key={f}
                  onClick={() => setFecha(f)}
                  style={{
                    fontSize: 12, fontWeight: 800, padding: "6px 11px", borderRadius: 9,
                    cursor: "pointer", font: "inherit", fontFamily: "inherit",
                    background: activo ? "var(--vk-titulo)" : "var(--vk-tarjeta)",
                    color: activo ? "var(--vk-sobre-tinta)" : "var(--vk-noche-apoyo)",
                    border: `1px solid ${activo ? "var(--vk-titulo)" : "var(--est-atencion-borde)"}`,
                  }}
                >
                  {DIAS_CORTOS[new Date(`${f}T12:00:00`).getDay()]} {Number(dd)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Progreso */}
      <div style={{ background: "var(--vk-noche)", borderLeft: "4px solid var(--vk-tenue)", padding: "10px 12px", borderRadius: 12, marginBottom: 10, border: "1px solid rgba(168, 85, 247, 0.2)" }}>
        <div style={{ fontSize: 11, color: "var(--vk-secundario)", fontWeight: 900, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4 }}>Progreso del día</div>
        <div style={{ fontSize: 18, fontWeight: 900, color: "var(--vk-secundario)" }}>
          {progresoLlenado} <span style={{ fontSize: 13, color: "var(--vk-secundario)", fontWeight: 700 }}>de {trabajan.length} llenadas</span>
        </div>
        <div style={{ background: "rgba(168, 85, 247, 0.15)", height: 6, borderRadius: 3, marginTop: 6, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(progresoLlenado / Math.max(1, trabajan.length)) * 100}%`, background: "var(--vk-bien)", borderRadius: 3, transition: "width 0.3s" }} />
        </div>
        <div style={{ fontSize: 11, color: "var(--vk-secundario)", fontWeight: 700, marginTop: 6 }}>
          ✅ {trabajan.length} trabajan · 😴 {activas.length - trabajan.length} descansan
        </div>
      </div>

      {/* Bloque 1: ¿Quién descansó? */}
      <div className="v-card">
        <div className="v-card-title" style={{ color: "var(--est-medio)" }}>1️⃣ ¿Quién descansó hoy?</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {activas.map(v => {
            const desc = filas[v.id]?.descanso;
            const esBog = v.ciudad === "BOG";
            return (
              <button
                key={v.id}
                disabled={soloLectura}
                onClick={() => setFila(v.id, "descanso", !desc)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 20,
                  border: "2px solid " + (desc ? "var(--adm-alerta-borde)" : esBog ? "rgba(245, 158, 11, 0.4)" : "rgba(16, 185, 129, 0.4)"),
                  cursor: soloLectura ? "default" : "pointer",
                  opacity: soloLectura ? 0.6 : 1,
                  fontSize: 12,
                  fontWeight: 800,
                  background: desc ? "var(--adm-alerta-fondo)" : "var(--vk-tarjeta)",
                  color: desc ? "var(--adm-alerta)" : esBog ? "var(--vk-metal-borde)" : "var(--vk-bien)",
                  textDecoration: desc ? "line-through" : "none",
                }}
              >
                {desc && "😴 "}{primerNombre(v.nombre)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bloque 2: Novedades por vendedora */}
      <div style={{ fontSize: 12, fontWeight: 900, color: "var(--est-medio)", textTransform: "uppercase", letterSpacing: 1.5, margin: "16px 4px 8px" }}>
        2️⃣ Novedades del día
        <div style={{ fontSize: 10, color: "var(--vk-secundario)", fontWeight: 700, marginTop: 2, textTransform: "none", letterSpacing: 0 }}>
          Todo empieza en "bien" · marca solo lo que NO fue perfecto
        </div>
      </div>

      {/* Sección MED */}
      {activasMed.filter(v => !filas[v.id]?.descanso).length > 0 && (
        <div style={{ fontSize: 11, fontWeight: 900, color: "var(--vk-bien)", padding: "6px 10px", background: "var(--vk-fondo)", borderRadius: 6, marginBottom: 6 }}>
          🟢 Team Valkyrias Medellín
        </div>
      )}
      {activasMed.filter(v => !filas[v.id]?.descanso).map(v => (
        <FilaVendedora
          key={v.id}
          v={v}
          f={filas[v.id] || diaVacio()}
          onCambio={(campo, valor) => setFila(v.id, campo, valor)}
          enError={erroresFalt.includes(v.id)}
          bloqueado={soloLectura}
          fecha={fecha}
          año={añoIng}
          mes={mesIng}
        />
      ))}

      {/* Sección BOG */}
      {activasBog.filter(v => !filas[v.id]?.descanso).length > 0 && (
        <div style={{ fontSize: 11, fontWeight: 900, color: "var(--vk-metal-borde)", padding: "6px 10px", background: "var(--vk-fondo)", borderRadius: 6, marginBottom: 6, marginTop: 10 }}>
          🟡 Team Valkyrias Bogotá
        </div>
      )}
      {activasBog.filter(v => !filas[v.id]?.descanso).map(v => (
        <FilaVendedora
          key={v.id}
          v={v}
          f={filas[v.id] || diaVacio()}
          onCambio={(campo, valor) => setFila(v.id, campo, valor)}
          enError={erroresFalt.includes(v.id)}
          bloqueado={soloLectura}
          fecha={fecha}
          año={añoIng}
          mes={mesIng}
        />
      ))}

      {/* Error de faltantes */}
      {erroresFalt.length > 0 && (
        <div style={{ background: "var(--adm-alerta-fondo)", border: "2px solid var(--adm-alerta-borde)", borderRadius: 10, padding: "10px 14px", marginTop: 8, fontSize: 12, fontWeight: 800, color: "var(--adm-alerta)" }}>
          ⚠️ Faltan {erroresFalt.length} vendedora{erroresFalt.length !== 1 ? "s" : ""} con actitud Regular/Mal sin describir qué pasó.
        </div>
      )}

      {/* Falló el guardado — tiene que ser imposible no verlo.
          Se distinguen los casos porque exigen cosas distintas del operador:
          con un error se reintenta; con un timeout NO se sabe si escribió, así
          que primero hay que ir a mirar el día; y "bloqueo" no es un fallo —el
          día está sano— así que no se pinta de rojo ni suena a regaño. */}
      {errorGuardado && (() => {
        const esTimeout = tipoFallo === "timeout";
        const esBloqueo = tipoFallo === "bloqueo";
        return (
          <div style={{
            background: esBloqueo ? "var(--vk-fondo)" : esTimeout ? "var(--vk-noche)" : "var(--adm-alerta-fondo)",
            border: `2px solid ${esBloqueo ? "var(--vk-borde)" : esTimeout ? "var(--est-atencion-borde)" : "var(--adm-alerta)"}`,
            borderRadius: 12, padding: "12px 14px", marginTop: 10,
            color: esBloqueo ? "var(--vk-secundario)" : esTimeout ? "var(--vk-noche-apoyo)" : "var(--adm-alerta)",
          }}>
            <div style={{ fontSize: 13.5, fontWeight: 900, marginBottom: 4 }}>
              {esBloqueo ? "🔒 Día cerrado"
                : esTimeout ? `⚠️ No se pudo confirmar el día ${fecha}`
                : `❌ NO se guardó el día ${fecha}`}
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.5 }}>
              {errorGuardado}
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 800, marginTop: 6, lineHeight: 1.5 }}>
              {esBloqueo
                ? null
                : esTimeout
                  ? "Puede que haya guardado y puede que no: no lo des por hecho. Revisa tu conexión, recarga la página y mira si el día aparece registrado. Si no aparece, vuelve a guardarlo."
                  : "Lo que llenaste sigue en pantalla. Vuelve a darle “Guardar día”."}
            </div>
          </div>
        );
      })()}

      {/* Botón guardar */}
      {(() => {
        const sinRoster = activas.length === 0;
        // `bloqueadoPorGuardado` es solo la mitad del bloqueo: la otra mitad vive
        // dentro de guardarDia() y es la que de verdad impide la escritura.
        const inhabilitado = mesCerrado || guardando || sinRoster || bloqueadoPorGuardado;
        const apagado = mesCerrado || sinRoster || bloqueadoPorGuardado;
        return (
          <button
            onClick={guardarDia}
            disabled={inhabilitado}
            style={{
              width: "100%",
              background: apagado ? "var(--vk-borde)"
                : guardando ? "var(--vk-tenue)"
                : "var(--vk-bien)",
              color: apagado ? "var(--vk-tenue)" : "var(--vk-tarjeta)",
              border: "none",
              padding: "14px",
              borderRadius: 14,
              fontSize: 15,
              fontWeight: 900,
              marginTop: 12,
              boxShadow: inhabilitado ? "none" : "0 4px 12px rgba(16, 185, 129, 0.35)",
              cursor: inhabilitado ? "default" : "pointer",
            }}
          >
            {mesCerrado ? "🔒 Mes cerrado — no se puede guardar"
              : sinRoster ? "⚠️ Sin vendedoras — no hay nada que guardar"
              : bloqueadoPorGuardado ? "🔒 Día cerrado — lo modifica el admin"
              : guardando ? "⏳ Guardando..."
              : "💾 Guardar día"}
          </button>
        );
      })()}
    </div>
  );
}

// Componente definido FUERA de IngresoDiario para evitar remount que pierde foco
// (Bug histórico #8 del actitud_nota — App.jsx:1192-1220)
function FilaVendedora({ v, f, onCambio, enError, bloqueado = false, fecha, año, mes }) {
  const hayNov =
    f.minutos > 0 ||
    f.resenas > 0 ||
    f.tienda_orden === "mal" ||
    f.tienda_uniforme === "mal" ||
    f.tienda_deposito === "mal" ||
    f.planilla === "mal" ||
    f.actitud === "regular" ||
    f.actitud === "mal";

  const esBog = v.ciudad === "BOG";

  // Nota del día en vivo (App.jsx:1134) — se recalcula con cada cambio
  const nd = notaDia(f, año, mes);

  return (
    <div className="v-card" style={{ borderLeft: `4px solid ${hayNov ? "var(--est-medio)" : (esBog ? "var(--est-atencion-borde)" : "var(--vk-bien-texto)")}`, marginBottom: 8, opacity: bloqueado ? 0.75 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <div style={{ fontWeight: 900, fontSize: 14, color: "var(--vk-titulo)" }}>
          {v.nombre}
        </div>
        {nd !== null && nd !== undefined && <NotaBadge nota={nd} />}
      </div>

      {/* Minutos + Reseñas con contadores */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        <ContadorNumerico
          label="⏰ Min tarde"
          valor={f.minutos}
          onCambio={v => onCambio("minutos", v)}
          max={150}
          bloqueado={bloqueado}
        />
        <ContadorNumerico
          label="⭐ Reseñas"
          valor={f.resenas}
          onCambio={v => onCambio("resenas", v)}
          max={50}
          bloqueado={bloqueado}
        />
      </div>

      {/* TIENDA - 3 checkboxes */}
      <div style={{ fontSize: 11, fontWeight: 800, color: "var(--vk-secundario)", marginBottom: 5 }}>🏪 Tienda</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
        {[["tienda_orden", "Orden"], ["tienda_uniforme", "Uniforme"], ["tienda_deposito", "Depósito"]].map(([campo, etiq]) => {
          const ok = f[campo] === "bien" || f[campo] === undefined;
          return (
            <button
              key={campo}
              disabled={bloqueado}
              onClick={() => onCambio(campo, ok ? "mal" : "bien")}
              style={{
                padding: "8px 4px",
                borderRadius: 8,
                border: "2px solid " + (ok ? "var(--vk-bien-texto)" : "var(--adm-alerta-borde)"),
                background: ok ? "var(--vk-bien-fondo)" : "var(--adm-alerta-fondo)",
                color: ok ? "var(--vk-bien-texto)" : "var(--adm-alerta)",
                fontSize: 11,
                fontWeight: 800,
                cursor: bloqueado ? "default" : "pointer",
              }}
            >
              {ok ? "✅" : "❌"} {etiq}
            </button>
          );
        })}
      </div>

      {/* PLANILLA */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--vk-secundario)", marginBottom: 5 }}>📋 Planilla</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            {[["bien", "✅ Bien"], ["mal", "❌ Mal"]].map(([val, lab]) => {
              const sel = (f.planilla || "bien") === val;
              const ok = val === "bien";
              return (
                <button
                  key={val}
                  disabled={bloqueado}
                  onClick={() => onCambio("planilla", val)}
                  style={{
                    padding: "8px 4px",
                    borderRadius: 8,
                    border: "2px solid " + (sel ? (ok ? "var(--vk-bien-texto)" : "var(--adm-alerta-borde)") : "var(--vk-borde)"),
                    background: sel ? (ok ? "var(--vk-bien-fondo)" : "var(--adm-alerta-fondo)") : "var(--vk-tarjeta)",
                    color: sel ? (ok ? "var(--vk-bien-texto)" : "var(--adm-alerta)") : "var(--vk-tenue)",
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: bloqueado ? "default" : "pointer",
                  }}
                >{lab}</button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ACTITUD */}
      <div style={{ fontSize: 11, fontWeight: 800, color: "var(--vk-secundario)", marginBottom: 5 }}>💪 Actitud</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
        {[
          ["bien", "✅ Bien", "var(--vk-bien-texto)", "var(--vk-bien-fondo)", "var(--vk-bien-texto)"],
          ["regular", "⚠️ Regular", "var(--vk-metal)", "var(--vk-noche)", "var(--est-atencion)"],
          ["mal", "❌ Mal", "var(--adm-alerta-borde)", "var(--adm-alerta-fondo)", "var(--adm-alerta)"],
        ].map(([val, lab, b, bg, c]) => {
          const sel = (f.actitud || "bien") === val;
          return (
            <button
              key={val}
              disabled={bloqueado}
              onClick={() => onCambio("actitud", val)}
              style={{
                padding: "8px 4px",
                borderRadius: 8,
                border: `2px solid ${sel ? b : "var(--vk-borde)"}`,
                background: sel ? bg : "var(--vk-tarjeta)",
                color: sel ? c : "var(--vk-tenue)",
                fontSize: 11,
                fontWeight: 800,
                cursor: bloqueado ? "default" : "pointer",
              }}
            >{lab}</button>
          );
        })}
      </div>

      {/* Motivo actitud (defaultValue + onBlur para no perder foco) */}
      {(f.actitud === "regular" || f.actitud === "mal") && (
        <div data-actitud-vid={v.id} style={{ marginTop: 8 }}>
          <input
            type="text"
            // La fecha va en la key: el input es NO controlado (defaultValue, para no
            // perder el foco — bug histórico #8). Sin la fecha en la key, al cambiar
            // de día se quedaba mostrando la nota del día anterior.
            key={`actitud-nota-${v.id}-${fecha}`}
            placeholder={enError ? "⚠️ Obligatorio: ¿qué pasó?" : "¿Qué pasó? (obligatorio)"}
            defaultValue={f.actitud_nota || ""}
            readOnly={bloqueado}
            onBlur={e => onCambio("actitud_nota", e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 12,
              fontFamily: "inherit",
              border: enError ? "2px solid var(--adm-alerta)" : "1.5px solid var(--vk-metal)",
              background: enError ? "var(--adm-alerta-fondo)" : "var(--vk-noche)",
              borderRadius: 10,
            }}
          />
          {enError && (
            <div style={{ fontSize: 11, color: "var(--adm-alerta)", marginTop: 4, fontWeight: 700 }}>
              ⚠️ Escribe qué pasó para poder guardar
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ContadorNumerico({ label, valor, onCambio, max = 100, bloqueado = false }) {
  const v = Number(valor) || 0;
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: "var(--vk-secundario)", marginBottom: 5 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button
          disabled={bloqueado || v <= 0}
          onClick={() => onCambio(Math.max(0, v - 1))}
          style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid var(--vk-borde)", background: "var(--vk-fondo-hueco)", fontSize: 18, fontWeight: 900, cursor: bloqueado ? "default" : "pointer", flexShrink: 0, color: "var(--vk-secundario)", opacity: (bloqueado || v <= 0) ? 0.4 : 1 }}
        >−</button>
        <div style={{ flex: 1, textAlign: "center", fontWeight: 800, fontSize: 16, padding: "6px 0", background: "var(--vk-fondo)", borderRadius: 8, border: "1px solid var(--vk-borde)" }}>
          {v}
        </div>
        <button
          disabled={bloqueado || v >= max}
          onClick={() => onCambio(Math.min(max, v + 1))}
          style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid var(--vk-borde)", background: "var(--vk-fondo-hueco)", fontSize: 18, fontWeight: 900, cursor: bloqueado ? "default" : "pointer", flexShrink: 0, color: "var(--vk-secundario)", opacity: (bloqueado || v >= max) ? 0.4 : 1 }}
        >+</button>
      </div>
    </div>
  );
}

// Badge con la nota del día (App.jsx:520-527 NotaBadge / App.jsx:1134)
function NotaBadge({ nota, size = 14 }) {
  return (
    <div
      title="Nota del día con lo que llevas marcado"
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        minWidth: size * 2.8, padding: "2px 10px", borderRadius: 8,
        background: bgN(nota), color: colorN(nota),
        fontWeight: 900, fontSize: size, flexShrink: 0,
      }}
    >
      {fmtN(nota)}
    </div>
  );
}
