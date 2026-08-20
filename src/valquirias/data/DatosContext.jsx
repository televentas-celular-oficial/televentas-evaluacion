// Data provider — carga los 6 documentos de Firestore en tiempo real y los expone via Context
// Modelo: colección "televentas" con docs: registros, metas, vendedoras, snapshots, config, efectivo
// Cada doc guarda un solo campo `data` con JSON stringified.
//
// Mejora sobre app vieja: usa onSnapshot para cambios en tiempo real
// (así cuando systemlap sincroniza, la vista de vendedoras se actualiza sin refresh).
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUÉ TODA ESCRITURA ES UNA TRANSACCIÓN (bug de julio 2026)
// ═══════════════════════════════════════════════════════════════════════════
// Antes, guardar era `setDoc(ref, { data: JSON.stringify(objetoEnteroEnMemoria) })`.
// Como el objeto salía del estado del navegador, cualquier copia vieja pisaba el
// documento COMPLETO. Escenario real que costó 8 días de julio:
//
//   1. A y B tienen la app abierta. Ambos cargaron `registros` sin los días 23-25.
//   2. A ingresa el 23, el 24 y el 25. Firestore ya los tiene.
//   3. B — que llenó su formulario minutos antes — guarda CUALQUIER otro día.
//      Su copia en memoria no tiene el 23, 24 ni 25, y el setDoc los borra.
//   4. Nadie ve un error. Los días simplemente dejaron de existir.
//
// El onSnapshot no salvaba nada: entre que B carga la pantalla, llena el
// formulario y presiona guardar pasan minutos, y basta con que su copia esté
// vieja en el instante EXACTO del setDoc.
//
// La solución es `runTransaction`: el documento se lee FRESCO dentro de la
// transacción y la fusión se hace sobre ese valor, no sobre el de memoria. Si
// alguien escribió en el intermedio, Firestore reintenta y la fusión se rehace
// encima del dato nuevo. El estado del navegador ya no es la fuente de verdad
// de lo que se escribe: sólo aporta el PARCHE (las claves que este guardado
// realmente cambió).
//
// ═══════════════════════════════════════════════════════════════════════════
// ESTRATEGIA POR DOCUMENTO
// ═══════════════════════════════════════════════════════════════════════════
// registros  → MAPA, clave `${vid}_${fecha}`. Fusión por clave. La unidad es un
//              día de una vendedora. Un guardado del 23 de julio SÓLO gobierna
//              las claves terminadas en `_2026-07-23` (hay un guard que aborta
//              si alguna clave del parche no es de esa fecha). Es imposible que
//              toque las claves de otro día.
// snapshots  → MAPA, clave `${año}_${mes}`. Fusión por clave. Cerrar mes agrega
//              una clave; reabrir la borra vía `borrarSnapshot`.
// metas      → MAPA, clave `${año}_${mes}`. Fusión por clave; sólo alta/edición,
//              nunca borra.
// config     → OBJETO de ajustes. Fusión por clave de PRIMER NIVEL: quien cambia
//              `whitelistActiva` ya no puede pisar `premiosTrim` ni al revés.
//              LÍMITE CONOCIDO Y ACEPTADO: dentro de `premiosTrim` la fusión no
//              baja otro nivel, así que dos admins editando trimestres distintos
//              al mismo tiempo podrían pisarse. Hoy hay un solo admin (Luis) y el
//              dato es de baja frecuencia; se documenta en vez de sobre-diseñar.
// vendedoras → ARREGLO, y es propiedad del worker de sincronización de systemlap.
//              La app NO debe escribirlo: `guardarClaves` lo rechaza. La única
//              excepción legítima es `restaurarTodo` (restaurar un respaldo).
// efectivo   → MAPA `YYYY-MM-DD` → { "<idFicha>": pesos }, más una clave `_meta`.
//              SOLO LECTURA. Lo escribe el worker (televentas-reportes/src/sync.js,
//              `syncEfectivo`) desde Supabase; la app no tiene forma de calcularlo
//              (las ventas no viven en Firestore). Está fuera de DOCS_MAPA, fuera
//              de restaurarTodo, y `guardarClaves`/`saveEfectivo` lo rechazan con
//              el motivo. En firestore.rules la escritura está negada para TODO
//              cliente — el service account del worker se salta las reglas.
//              Ver la forma exacta y las 3 trampas en LEER `efectivo`, más abajo.
//
// ═══════════════════════════════════════════════════════════════════════════
// BORRAR SIGUE SIENDO POSIBLE
// ═══════════════════════════════════════════════════════════════════════════
// Una fusión ingenua nunca borra nada. Por eso cada guardado declara qué claves
// GOBIERNA (`opciones.gobierna`), aparte de las que trae en el parche:
//   · clave gobernada + está en el parche  → se escribe
//   · clave gobernada + NO está en el parche → se BORRA (esto es un borrado real)
//   · clave NO gobernada                    → intacta, pase lo que pase
// Si no se declara nada, `gobierna` = las claves del parche, o sea: alta/edición
// pura, cero borrados. Ese es el default seguro.
//
// ═══════════════════════════════════════════════════════════════════════════
// SIN BUCLES DE RE-ESCRITURA
// ═══════════════════════════════════════════════════════════════════════════
// Escribir no dispara escrituras: los callbacks de onSnapshot sólo hacen
// setDatos, nunca llaman a guardar. El eco del propio guardado llega como un
// snapshot más y termina ahí. Además la actualización optimista aplica
// exactamente la MISMA fusión que la transacción, así que cuando llega el eco el
// valor local ya coincide y no hay parpadeo ni render en cascada.

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { doc, getDoc, onSnapshot, runTransaction, writeBatch } from "firebase/firestore";
import { db } from "../../firebase.js";

const DatosContext = createContext(null);

export function useDatos() {
  const ctx = useContext(DatosContext);
  if (!ctx) throw new Error("useDatos debe usarse dentro de <DatosProvider>");
  return ctx;
}

const DOCS = ["registros", "metas", "vendedoras", "snapshots", "config", "efectivo"];

// Docs que se fusionan por clave. `vendedoras` queda fuera a propósito: es un
// arreglo y lo escribe el worker. `efectivo` también: es de SOLO LECTURA
// (lo escribe el worker desde Supabase) y la app no debe tener ni un camino.
const DOCS_MAPA = ["registros", "metas", "snapshots", "config"];

// Docs que un respaldo puede reescribir. `efectivo` NO: no es un dato de la app,
// es una proyección del worker que se reconstruye entera cada 5 minutos. Si un
// respaldo lo trajera, restaurarlo pondría cifras viejas de dinero en pantalla
// hasta la siguiente corrida — y además el batch entero fallaría por reglas
// (nadie puede escribir `efectivo` desde el cliente), tumbando la restauración
// de los otros 5 docs.
// `vendedoras` se suma a la exclusión: desde que las reglas se lo prohíben al
// cliente, incluirlo en el lote hacía fallar la restauración COMPLETA — justo
// lo que se está intentando salvar en una emergencia. Además restaurarlo no
// sirve de nada: el worker lo reescribe desde systemlap en los 5 min siguientes.
const DOCS_RESTAURABLES = DOCS.filter(n => n !== "efectivo" && n !== "vendedoras");

// ---------------------------------------------------------------------------
// LEER `efectivo` — la forma del doc y las 3 trampas
// ---------------------------------------------------------------------------
// El worker (televentas-reportes/src/sync.js, `syncEfectivo`) escribe:
//
//   { "2026-08-17": { "101": 450000, "102": 200000 },
//     "2026-08-18": { "101": 500000 },
//     "_meta": { "actualizado": "...Z", "desde": "2026-08-10", "hasta": "2026-08-23" } }
//
//  1. `_meta` está MEZCLADA con los días. Hay que filtrar las claves con
//     `RE_FECHA` antes de iterar o se cuela en los totales (`_meta` es un objeto,
//     sumarlo daría NaN). Por eso este archivo exporta `esDiaEfectivo`.
//  2. Las llaves internas son el id de la ficha COMO STRING (mismo criterio que
//     `metas[mkey].vendidas`). Comparar contra `vendedora.id` numérico falla:
//     usar `String(id)`.
//  3. Que EXISTA la llave del día = ese día ya se procesó; una vendedora que no
//     aparece ahí vendió $0 en efectivo ese día. Que NO exista la llave = el día
//     todavía no llegó (los días futuros no se escriben). Son cosas distintas y
//     la pantalla debe distinguirlas: "aún no hay dato" nunca es "$0".
//
// Ventana: 14 días (semana en curso + la anterior). El doc se reconstruye entero
// en cada corrida, así que lo que se cae de la ventana desaparece: no sirve para
// historia, solo para la semana viva y la pasada.

// OJO: `vendedoras` arranca vacío a propósito. Antes usaba VENDEDORAS_DEFAULT
// (roster hardcodeado en lib/constantes.js) y eso hacía que la UI pudiera pintar
// un equipo falso si el doc de Firestore no existía o todavía no había llegado.
// El roster real SIEMPRE viene de Firestore.
//
// `efectivo` arranca en {} por lo mismo, y ese {} es exactamente lo que hay que
// mostrar como "todavía no hay dato": mientras el worker no se despliegue el doc
// NO EXISTE, y un mapa sin ningún día es indistinguible de eso. Cero días ≠ $0.
const DEFAULTS = {
  registros: {},
  metas: {},
  vendedoras: [],
  snapshots: {},
  config: { rankingVisible: true },
  efectivo: {},
};

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Trampa 1 del doc `efectivo`: `_meta` viaja mezclada con los días. Todo lo que
// itere el doc debe pasar por aquí primero. Se exporta desde este archivo — y no
// desde un módulo aparte — porque vive pegado a la definición del doc: quien
// venga a leer qué forma tiene `efectivo` cae justo encima del filtro.
// eslint-disable-next-line react-refresh/only-export-components
export const esDiaEfectivo = (k) => RE_FECHA.test(k);

// ---------------------------------------------------------------------------
// Fusión por clave. `base` es el valor FRESCO del servidor (nunca el de memoria).
// ---------------------------------------------------------------------------
function fusionarPorClave(base, parche, clavesGobernadas) {
  const salida = { ...(base || {}) };
  // Primero se van las claves gobernadas: lo que este guardado manda desaparecer.
  for (const k of clavesGobernadas) delete salida[k];
  // Después vuelven las que sí trae el parche. Todo lo demás quedó intacto.
  for (const [k, v] of Object.entries(parche || {})) salida[k] = v;
  return salida;
}

// ---------------------------------------------------------------------------
// Lectura del doc DENTRO de la transacción.
// Si el JSON está corrupto se ABORTA en vez de devolver {}: devolver un objeto
// vacío haría que la fusión escribiera un documento vacío y borrara todo — es
// exactamente el desastre que este archivo existe para evitar.
// ---------------------------------------------------------------------------
function leerMapaFresco(snap, nombre) {
  if (!snap.exists()) return {};
  const raw = snap.data()?.data;
  if (raw == null) return {};
  let parsed;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw new Error(
      `El documento "${nombre}" tiene JSON inválido en Firestore. Se abortó el guardado para no sobrescribirlo.`
    );
  }
  if (parsed == null) return {};
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `El documento "${nombre}" no es un mapa de claves. Se abortó el guardado para no sobrescribirlo.`
    );
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Lectura de CUALQUIERA de los 6 docs (no solo los de tipo mapa), para cuando
// hay que CALCULAR con el dato del servidor y no con el del navegador.
// `vendedoras` es un arreglo, así que `leerMapaFresco` no sirve aquí.
//
// Igual que allá: si el JSON está corrupto o el tipo no es el esperado se ABORTA.
// Calcular con `{}` sería peor que no calcular — produciría notas en cero que
// después se congelan en un snapshot.
// ---------------------------------------------------------------------------
function leerValorFresco(snap, nombre) {
  const porDefecto = DEFAULTS[nombre];
  if (!snap.exists()) return porDefecto;
  const raw = snap.data()?.data;
  if (raw == null) return porDefecto;
  let parsed;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw new Error(
      `El documento "${nombre}" tiene JSON inválido en Firestore. Se abortó la operación para no calcular con datos incompletos.`
    );
  }
  if (parsed == null) return porDefecto;
  const esperaArreglo = Array.isArray(porDefecto);
  if (typeof parsed !== "object" || Array.isArray(parsed) !== esperaArreglo) {
    throw new Error(
      `El documento "${nombre}" no tiene la forma esperada (${esperaArreglo ? "arreglo" : "mapa"}). Se abortó la operación.`
    );
  }
  return parsed;
}

// ═══════════════════════════════════════════════════════════════════════════
// LA SUSCRIPCIÓN CUELGA DE LA SESIÓN (bug del 19-ago-2026)
// ═══════════════════════════════════════════════════════════════════════════
// Antes el efecto dependía sólo de `[modoDemo]`, así que los 6 onSnapshot se
// abrían al MONTAR el proveedor — es decir, antes de que existiera sesión.
// `firestore.rules` exige `autenticado()` para leer, así que los 6 targets
// morían con `permission-denied` en el arranque.
//
// Y no vuelven solos. En el SDK instalado, el error de un target hace
// `e.Ea.delete(r)` y `da.removeTarget(r)` (common-*.esm.js:15577): el target
// sale del mapa de escuchas vivas del RemoteStore. Cuando después llega la
// credencial, `remoteStoreHandleCredentialChange` (:15756-15767) sólo tira y
// rearma los streams y vuelve a mandar lo que QUEDÓ en `Ea`. Lo que se borró
// no está ahí, así que nadie lo vuelve a pedir jamás.
//
// Resultado: `cargado` se marcaba igual (el callback de error contaba el doc
// como "llegado" para que la UI no se colgara) y toda la app se pintaba con
// los DEFAULTS: `vendedoras: []`. La vendedora entraba bien y caía en
// "No encontramos tu perfil"; el dueño aterrizaba en un panel sin nadie.
//
// EL ARREGLO Y POR QUÉ FUNCIONA: el efecto depende del `uid` de la sesión. Sin
// uid no se suscribe nada (no hay nada que pedir todavía). Cuando aparece el
// uid —o cambia de persona— React limpia el efecto anterior (unsubscribe de
// verdad) y ejecuta el cuerpo otra vez, o sea que se llama `onSnapshot` DE
// NUEVO. Cada `onSnapshot` entra por el camino completo del SDK
// (listen → allocateTarget → nuevo QueryView → remoteStoreListen), que vuelve
// a INSERTAR el target en `Ea` y manda un watch request nuevo. No es un
// reintento sobre el target muerto: es un target nuevo, pedido después de que
// ya hay credencial. Por eso sí llega.
//
// Nada de esto usa el reloj: la única señal es `onAuthStateChanged`, que llega
// desde ValquiriasApp por la prop `usuario`.
//
// ═══════════════════════════════════════════════════════════════════════════
// TRES SITUACIONES, NO DOS (`estado`)
// ═══════════════════════════════════════════════════════════════════════════
//   "sin-sesion" → todavía no hay a quién cargarle nada. NO es un error.
//   "cargando"   → hay sesión y los 6 docs vienen en camino.
//   "listo"      → los 6 docs llegaron y parsearon. `cargado` es exactamente esto.
//   "error"      → hay sesión y la LECTURA FALLÓ. Eso hay que decirlo en
//                  pantalla; fingir que "no hay datos" es lo que produjo el bucle.
//
// `cargado` sigue existiendo y ahora significa lo que su nombre dice: los datos
// están. Ya no se pone en true cuando la lectura falla — ese era el motor del
// desastre (pantallas vacías indistinguibles de "no eres vendedora").

export function DatosProvider({ usuario, modoDemo, datosMock, children }) {
  // La identidad de la sesión. `uid` y no el objeto `usuario`: el objeto puede
  // cambiar de referencia al refrescarse el token sin que cambie la persona, y
  // eso rearmaría las suscripciones sin motivo.
  const uid = usuario?.uid ?? null;

  const [datos, setDatos] = useState(DEFAULTS);
  const [error, setError] = useState(null);
  const [ultimoSync, setUltimoSync] = useState(null);

  // La fase va JUNTO al uid al que pertenece. Es lo que impide el parpadeo en el
  // que `user` ya cambió pero el efecto todavía no corrió: si `carga.uid` no es
  // el uid actual, lo que hay en `datos` es de otra sesión y la fase es mentira.
  const [carga, setCarga] = useState({ uid: null, fase: "sin-sesion", error: null });

  // Reintento EXPLÍCITO del usuario (botón), no un temporizador. Cambiar este
  // número rearma el efecto entero → suscripciones nuevas, targets nuevos.
  const [intento, setIntento] = useState(0);

  // Último valor confirmado por el servidor, por doc. Sirve para deshacer la
  // actualización optimista cuando la transacción falla: si dejáramos el valor
  // optimista puesto, la pantalla mostraría datos que no están guardados y
  // ningún snapshot vendría a corregirla (el doc no cambió).
  const servidorRef = useRef({ ...DEFAULTS });

  useEffect(() => {
    // Modo demo: no cargar Firestore, usar mock provisto por prop
    if (modoDemo) {
      const mock = { ...DEFAULTS, ...(datosMock || {}) };
      servidorRef.current = mock;
      setDatos(mock);
      setCarga({ uid: "demo", fase: "listo", error: null });
      return;
    }

    // CAMBIO DE PERSONA (o salida): lo primero es soltar lo de la sesión
    // anterior. El admin usa "ver como vendedora" y también cierra sesión para
    // entrar con otro correo; si el roster o los registros del anterior se
    // quedaran pegados, la pantalla nueva mostraría datos que no son de quien
    // está mirando. Se vacía SIEMPRE, antes de suscribir nada.
    servidorRef.current = { ...DEFAULTS };
    setDatos(DEFAULTS);
    setUltimoSync(null);
    setError(null);

    if (!uid) {
      // Sin sesión no se abre ni una escucha: las reglas la negarían y el SDK
      // borraría el target (ver arriba). Esto no es un error, es el estado normal
      // de alguien que todavía no ha entrado.
      setCarga({ uid: null, fase: "sin-sesion", error: null });
      return;
    }

    setCarga({ uid, fase: "cargando", error: null });

    // `cargado` sólo puede ser true cuando los 6 docs hayan emitido su PRIMER
    // snapshot. Si se marcara por doc, la UI se pintaba con el primero que
    // llegaba y los otros 5 todavía en DEFAULTS (síntoma: Backup en 0 mientras
    // otra pantalla ya mostraba el ranking real).
    //
    // `efectivo` entra en esta misma espera a propósito. Un doc que TODAVÍA NO
    // EXISTE emite snapshot igual (con `exists() === false`), así que la espera
    // no se cuelga si el worker aún no se ha desplegado: llega, se queda en {}
    // y `marcarLlegado` lo tacha como cualquier otro.
    //
    // El contador y la fase viven en el closure del efecto, NO en state: con
    // state se perderían actualizaciones porque los callbacks de onSnapshot
    // capturan el valor viejo de la render en que se suscribieron.
    let cancelado = false;
    let fase = "cargando";
    const pendientes = new Set(DOCS);

    const marcarLlegado = (nombre) => {
      if (cancelado || fase !== "cargando") return;
      pendientes.delete(nombre);
      if (pendientes.size === 0) {
        fase = "listo";
        setCarga({ uid, fase: "listo", error: null });
      }
    };

    // Un doc que falla mientras cargamos deja la carga en ERROR. NO se cuenta
    // como llegado: contarlo era exactamente lo que marcaba `cargado` con los
    // defaults vacíos y mandaba a la vendedora a "No encontramos tu perfil".
    //
    // Si el error llega DESPUÉS de haber cargado (se cayó la red con la app
    // abierta) no se borra la pantalla: se guarda en `error` y lo que ya está
    // en pantalla sigue siendo cierto, sólo deja de actualizarse.
    const fallo = (nombre, err) => {
      console.error("Error onSnapshot", nombre, err);
      if (cancelado) return;
      setError(err);
      if (fase !== "cargando") return;
      fase = "error";
      setCarga({ uid, fase: "error", error: err });
    };

    // Suscripciones en tiempo real a los 6 docs. Estas llamadas son NUEVAS en
    // cada corrida del efecto: crean targets nuevos, no reviven los que el SDK
    // borró al negarse la lectura sin sesión.
    const unsubs = DOCS.map(nombre =>
      onSnapshot(
        doc(db, "televentas", nombre),
        (snap) => {
          if (cancelado) return;
          try {
            if (snap.exists()) {
              const raw = snap.data().data;
              const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
              const valor = parsed ?? DEFAULTS[nombre];
              servidorRef.current = { ...servidorRef.current, [nombre]: valor };
              setDatos(d => ({ ...d, [nombre]: valor }));
            } else {
              servidorRef.current = { ...servidorRef.current, [nombre]: DEFAULTS[nombre] };
              setDatos(d => ({ ...d, [nombre]: DEFAULTS[nombre] }));
            }
            setUltimoSync(new Date());
          } catch (e) {
            // JSON corrupto en el servidor: el doc llegó, pero no se puede leer.
            // Es una falla de lectura como cualquier otra, no un doc vacío.
            fallo(nombre, e);
            return;
          }
          marcarLlegado(nombre);
        },
        (err) => fallo(nombre, err)
      )
    );

    // Se limpia al desmontar Y en cada cambio de usuario: React corre esto antes
    // de volver a ejecutar el cuerpo, así que nunca quedan escuchas huérfanas de
    // la sesión anterior mandando datos a la nueva.
    return () => {
      cancelado = true;
      unsubs.forEach(u => u());
    };
  }, [modoDemo, uid, intento]);

  // Rearma las 6 suscripciones desde cero. Lo dispara una persona tocando un
  // botón, nunca un temporizador.
  const reintentar = () => setIntento(n => n + 1);

  // ── Lo que ve la UI ────────────────────────────────────────────────────────
  // Se deriva en el render, no en el efecto, para que no exista NI UNA render en
  // la que la sesión ya cambió y la fase/los datos sigan siendo los de antes.
  // Si `carga.uid` no coincide con el uid actual, la respuesta honesta es
  // "cargando" con los datos vacíos: todavía no sabemos nada de esta persona.
  const faseEfectiva = modoDemo
    ? (carga.fase === "listo" ? "listo" : "cargando")
    : !uid
      ? "sin-sesion"
      : (carga.uid === uid ? carga.fase : "cargando");

  const datosVisibles = (modoDemo || carga.uid === uid) ? datos : DEFAULTS;

  // ═════════════════════════════════════════════════════════════════════════
  // ESCRITURA TRANSACCIONAL — el único camino normal de guardado
  // ═════════════════════════════════════════════════════════════════════════
  // `parche`  : { clave: valor } — SÓLO lo que este guardado cambia.
  // `gobierna`: claves que este guardado manda; las que no vengan en el parche
  //             se borran. Si se omite, no se borra nada.
  //
  // Lanza si falla (después de los reintentos de Firestore). QUIEN LLAMA DEBE
  // AWAIT Y MOSTRAR EL ERROR: un guardado que falla en silencio es lo que hace
  // que el operador se vaya creyendo que guardó.
  async function guardarClaves(nombre, parche, opciones = {}) {
    if (!DOCS_MAPA.includes(nombre)) {
      if (nombre === "vendedoras") {
        throw new Error(
          "`vendedoras` lo escribe el worker de sincronización de systemlap, no la app. " +
          "La única excepción es restaurar un respaldo (restaurarTodo)."
        );
      }
      if (nombre === "efectivo") {
        throw new Error(
          "`efectivo` es de SOLO LECTURA en la app: lo calcula y lo escribe el worker " +
          "(televentas-reportes, syncEfectivo) leyendo las ventas de Supabase. La app no " +
          "tiene las ventas, así que cualquier cifra que escribiera aquí sería inventada — " +
          "y con este dato se pagan los $50.000 semanales. Ni siquiera restaurarTodo lo toca."
        );
      }
      throw new Error(`Documento desconocido: ${nombre}`);
    }

    const patch = parche || {};
    const gobernadas = opciones.gobierna ? Array.from(opciones.gobierna) : Object.keys(patch);

    // Optimista: misma fusión en local para que la UI responda ya.
    setDatos(d => ({ ...d, [nombre]: fusionarPorClave(d[nombre], patch, gobernadas) }));

    if (modoDemo) return; // en demo, solo local

    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, "televentas", nombre);
        // Lectura FRESCA dentro de la transacción. Si otro escribió entre esta
        // lectura y el commit, Firestore aborta y reejecuta este cuerpo entero:
        // la fusión se rehace sobre el dato nuevo, no sobre el de memoria.
        const snap = await tx.get(ref);
        const actual = leerMapaFresco(snap, nombre);
        const fusionado = fusionarPorClave(actual, patch, gobernadas);
        tx.set(ref, { data: JSON.stringify(fusionado) });
      });
    } catch (e) {
      console.error("Error guardando", nombre, e);
      // Deshacer el optimista: volver a lo último que confirmó el servidor.
      setDatos(d => ({ ...d, [nombre]: servidorRef.current[nombre] ?? DEFAULTS[nombre] }));
      setError(e);
      throw e; // ← que la UI se entere
    }
  }

  // ── Ingreso diario ───────────────────────────────────────────────────────
  // Guarda las filas de UNA fecha. `vidsGobernados` son las vendedoras que la
  // pantalla realmente mostró para ese día: si una de ellas no viene en
  // `filasPorVid`, su registro de ese día se borra de verdad. Una vendedora que
  // la pantalla no mostró (p.ej. la desactivaron después) no está gobernada, así
  // que su historial NO se toca.
  async function guardarDiaRegistros(fecha, filasPorVid, vidsGobernados) {
    if (!RE_FECHA.test(String(fecha || ""))) {
      throw new Error(`Fecha inválida para el ingreso diario: ${fecha}`);
    }
    const sufijo = `_${fecha}`;

    const parche = {};
    Object.entries(filasPorVid || {}).forEach(([vid, fila]) => {
      parche[`${vid}${sufijo}`] = fila;
    });

    const gobierna = (vidsGobernados && vidsGobernados.length)
      ? vidsGobernados.map(vid => `${vid}${sufijo}`)
      : Object.keys(parche);

    // Blindaje duro: el radio de acción de un guardado diario es UNA fecha.
    // Si un bug futuro colara una clave de otro día, esto aborta antes de escribir.
    const intrusa = [...gobierna, ...Object.keys(parche)].find(k => !k.endsWith(sufijo));
    if (intrusa) {
      throw new Error(
        `El guardado del día ${fecha} intentó tocar la clave "${intrusa}", que no es de esa fecha. Abortado.`
      );
    }

    // Un guardado que no trae NADA ni gobierna NADA no es un guardado: escribe el
    // documento igual que estaba, la promesa resuelve y la pantalla pinta un ✅
    // sin que exista un solo registro. Pasa de verdad cuando el roster llegó
    // vacío (`vendedoras` = [] → activas = [] → parche vacío): el doc se leyó
    // bien pero el worker de systemlap todavía no sincronizó a nadie.
    // (Ya NO pasa por una lectura fallida: desde el arreglo del 19-ago-2026 una
    // lectura que falla deja `estado: "error"` y `cargado` en false, y la app
    // no llega ni a pintar el formulario.) Éxito falso: prohibido.
    if (Object.keys(parche).length === 0 && gobierna.length === 0) {
      throw new Error(
        `El día ${fecha} no traía ninguna vendedora, así que NO se guardó nada. ` +
        `Casi siempre significa que el roster todavía no cargó (viene sincronizado de systemlap): ` +
        `recarga la página, espera a ver los nombres y vuelve a guardar.`
      );
    }

    return guardarClaves("registros", parche, { gobierna });
  }

  // Reabrir un mes: borrado real de una clave de `snapshots`, sin tocar las demás.
  async function borrarSnapshot(clave) {
    if (!clave) throw new Error("borrarSnapshot necesita una clave de mes");
    return guardarClaves("snapshots", {}, { gobierna: [clave] });
  }

  // ═════════════════════════════════════════════════════════════════════════
  // LEER DEL SERVIDOR, SIN ESCRIBIR
  // ═════════════════════════════════════════════════════════════════════════
  // Para decisiones irreversibles no basta con el estado del navegador: ese
  // estado puede tener minutos (u horas) y le puede faltar un día entero que
  // alguien acaba de ingresar. Esto trae el dato de verdad para poder ENSEÑAR
  // lo que se va a congelar antes de congelarlo.
  //
  // No sustituye a la lectura dentro de la transacción — sirve para la vista
  // previa; el cálculo que se guarda se rehace en `cerrarMesFresco`.
  async function leerFrescos(nombres = DOCS) {
    const lista = nombres.filter(n => DOCS.includes(n));
    if (lista.length === 0) throw new Error("leerFrescos: no se pidió ningún documento conocido");

    if (modoDemo) {
      const salida = {};
      lista.forEach(n => { salida[n] = datos[n] ?? DEFAULTS[n]; });
      return salida;
    }

    const snaps = await Promise.all(lista.map(n => getDoc(doc(db, "televentas", n))));
    const salida = {};
    lista.forEach((n, i) => { salida[n] = leerValorFresco(snaps[i], n); });
    return salida;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // CERRAR MES — se calcula con el dato FRESCO, dentro de la transacción
  // ═════════════════════════════════════════════════════════════════════════
  // El snapshot de un mes es lo que paga comisiones y premios, y queda fijo para
  // siempre. Calcularlo con la copia del navegador es la misma falla que borró
  // julio, con otra cara: si a esa copia le falta un día, el snapshot CONGELA
  // notas más bajas y ningún onSnapshot posterior lo corrige — hay que reabrir
  // el mes y volver a cerrarlo. Ya pasó una vez.
  //
  // `construirSnapshot({ registros, metas, vendedoras, snapshots })` recibe los
  // documentos leídos DENTRO de la transacción y devuelve el objeto a congelar.
  // DEBE SER PURA: Firestore reejecuta el cuerpo de la transacción si alguien
  // escribió en el intermedio, así que se llamará más de una vez.
  //
  // Devuelve el snapshot que quedó escrito.
  async function cerrarMesFresco(clave, construirSnapshot) {
    if (!clave) throw new Error("cerrarMesFresco necesita la clave del mes (año_mes)");
    if (typeof construirSnapshot !== "function") {
      throw new Error("cerrarMesFresco necesita una función que construya el snapshot");
    }

    if (modoDemo) {
      const snap = construirSnapshot({
        registros: datos.registros || {},
        metas: datos.metas || {},
        vendedoras: datos.vendedoras || [],
        snapshots: datos.snapshots || {},
      });
      setDatos(d => ({ ...d, snapshots: { ...(d.snapshots || {}), [clave]: snap } }));
      return snap;
    }

    let escrito = null;
    await runTransaction(db, async (tx) => {
      // TODAS las lecturas van antes de cualquier escritura (regla de Firestore).
      const refs = {
        registros: doc(db, "televentas", "registros"),
        metas: doc(db, "televentas", "metas"),
        vendedoras: doc(db, "televentas", "vendedoras"),
        snapshots: doc(db, "televentas", "snapshots"),
      };
      const [sReg, sMet, sVen, sSnap] = await Promise.all([
        tx.get(refs.registros),
        tx.get(refs.metas),
        tx.get(refs.vendedoras),
        tx.get(refs.snapshots),
      ]);

      const frescos = {
        registros: leerValorFresco(sReg, "registros"),
        metas: leerValorFresco(sMet, "metas"),
        vendedoras: leerValorFresco(sVen, "vendedoras"),
        snapshots: leerValorFresco(sSnap, "snapshots"),
      };

      // Cerrar dos veces el mismo mes pisaría el snapshot anterior sin avisar.
      // Para volver a cerrar hay que abrirlo primero (borrarSnapshot).
      if (frescos.snapshots[clave]) {
        throw new Error(
          `El mes ${clave} ya está cerrado en el servidor. Si necesitas rehacerlo, ábrelo primero y vuelve a cerrarlo.`
        );
      }

      const snap = construirSnapshot(frescos);
      if (!snap || typeof snap !== "object") {
        throw new Error("El cálculo del cierre no produjo un snapshot válido. No se escribió nada.");
      }

      // Fusión por clave sobre el mapa FRESCO: sólo se agrega este mes, los
      // demás quedan exactamente como estaban.
      tx.set(refs.snapshots, { data: JSON.stringify({ ...frescos.snapshots, [clave]: snap }) });
      escrito = snap;
    });

    // El onSnapshot traerá el eco, pero se aplica ya para que la UI no muestre
    // el mes como abierto durante el viaje de ida y vuelta.
    setDatos(d => ({ ...d, snapshots: { ...(d.snapshots || {}), [clave]: escrito } }));
    return escrito;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // RESTAURAR RESPALDO — la única operación que SÍ pisa
  // ═════════════════════════════════════════════════════════════════════════
  // Restaurar es literalmente "reemplaza todo por esto", así que aquí el
  // reemplazo total es lo correcto, no el bug. Va por un camino aparte y
  // explícito para que nunca se confunda con el guardado normal, e incluye
  // `vendedoras` (el respaldo es el único caso legítimo en que la app lo escribe).
  // Se hace en batch para que los 5 docs restaurables queden en el mismo commit.
  //
  // `efectivo` queda FUERA aunque venga en el JSON (ver DOCS_RESTAURABLES): se
  // ignora en silencio en vez de fallar, para que un respaldo que lo traiga por
  // accidente no impida restaurar registros/metas/snapshots — que es justo lo que
  // se está tratando de salvar en una emergencia.
  async function restaurarTodo(paquete) {
    const nombres = DOCS_RESTAURABLES.filter(n => paquete && paquete[n] !== undefined);
    if (nombres.length === 0) {
      if (paquete && paquete.efectivo !== undefined) {
        throw new Error(
          "El respaldo sólo trae `efectivo`, que la app no puede escribir (lo reconstruye " +
          "el worker cada 5 minutos). No hay nada que restaurar."
        );
      }
      throw new Error("El respaldo no trae ninguno de los 5 documentos restaurables.");
    }

    setDatos(d => {
      const n = { ...d };
      nombres.forEach(k => { n[k] = paquete[k]; });
      return n;
    });

    if (modoDemo) return nombres;

    try {
      const batch = writeBatch(db);
      nombres.forEach(n => {
        batch.set(doc(db, "televentas", n), { data: JSON.stringify(paquete[n]) });
      });
      await batch.commit();
      return nombres;
    } catch (e) {
      console.error("Error restaurando respaldo", e);
      setDatos(d => {
        const n = { ...d };
        nombres.forEach(k => { n[k] = servidorRef.current[k] ?? DEFAULTS[k]; });
        return n;
      });
      setError(e);
      throw e;
    }
  }

  const valor = {
    ...datosVisibles,

    // "sin-sesion" | "cargando" | "listo" | "error" — ver el bloque de arriba.
    // Quien tenga que distinguir "todavía no sé" de "falló" mira esto.
    estado: faseEfectiva,

    // Los 6 docs están. Si es false NO se puede concluir nada sobre el
    // contenido: puede que vengan en camino, puede que la lectura fallara.
    cargado: faseEfectiva === "listo",

    // El error que impidió CARGAR (distinto de `error`, que también recoge los
    // fallos de guardado). Sólo tiene valor cuando `estado === "error"`.
    errorCarga: faseEfectiva === "error" ? carga.error : null,

    // Vuelve a suscribir los 6 docs desde cero (targets nuevos). Para el botón
    // "Reintentar" de la pantalla de error.
    reintentar,

    error,
    ultimoSync,
    modoDemo: !!modoDemo,

    // API de escritura
    guardarClaves,
    guardarDiaRegistros,
    borrarSnapshot,
    restaurarTodo,

    // Lectura fresca del servidor (vista previa) y cierre de mes calculado
    // dentro de la transacción, nunca con la copia del navegador.
    leerFrescos,
    cerrarMesFresco,

    // Atajos: fusión por clave de primer nivel, alta/edición, nunca borran.
    // Pasar el objeto ENTERO por aquí funciona pero es innecesariamente ancho:
    // preferir `guardarClaves(doc, { soloLoQueCambió })`.
    saveMetas:     (v) => guardarClaves("metas",     v),
    saveSnapshots: (v) => guardarClaves("snapshots", v),
    saveConfig:    (v) => guardarClaves("config",    v),

    // Eliminados a propósito: eran la puerta del borrado silencioso.
    saveRegistros: () => {
      throw new Error(
        "saveRegistros fue eliminado: mandaba el mapa entero desde memoria y borraba " +
        "los días que otro usuario había guardado. Usa guardarDiaRegistros(fecha, filas, vids)."
      );
    },
    saveVendedoras: () => {
      throw new Error(
        "saveVendedoras fue eliminado: `vendedoras` lo escribe el worker de systemlap. " +
        "Para restaurar un respaldo usa restaurarTodo(paquete)."
      );
    },
    // `efectivo` NO tiene camino de escritura, ni siquiera uno restringido. Este
    // stub existe para que quien lo busque encuentre el motivo en vez de agregarlo.
    saveEfectivo: () => {
      throw new Error(
        "`efectivo` es de SOLO LECTURA: lo escribe el worker (televentas-reportes, " +
        "syncEfectivo) desde las ventas de Supabase, que la app no tiene. Escribirlo " +
        "desde aquí sería inventar el dato con el que se pagan los $50.000 semanales. " +
        "Las reglas de Firestore también lo niegan para todo cliente."
      );
    },
  };

  return <DatosContext.Provider value={valor}>{children}</DatosContext.Provider>;
}
