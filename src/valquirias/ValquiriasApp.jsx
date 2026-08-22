// Valkyrias — entry point de la app
// ============================================================================
// Especificación: docs/prototipo-3-perfiles.html (aprobado pantalla por pantalla).
//
// EL CAMBIO DE FONDO: nadie tiene barra de navegación arriba. Cada rol entra
// directo a lo suyo y navega hacia adentro con botones de volver.
//
//   · Carolina (rol oficina) → IngresoDiario y NADA MÁS. Una sola pantalla.
//   · Vendedora              → Home (los 3 botones grandes). Los 3 botones SON
//                              la navegación: cash / mes / trimestre, y desde
//                              mes y trimestre se entra al detalle de un
//                              indicador con su modo ("mes" o "trim").
//   · Admin (Luis)           → AdminHome. Sin barra de iconos.
//
// MODO "VER COMO": el admin elige una vendedora y entra a SU vista DENTRO de
// esta misma app (ya no se abre pestaña nueva ni se usa ?simular= en la URL).
// Se le pasa el objeto `vendedora` completo, así que ciudad y rol son los de
// ELLA — que es justo lo que cambia los tramos de comisión y el piso de MED.
//
// Datos: 100% reales desde Firestore (DatosProvider). Ningún mock, ningún cero
// disfrazado de dato real: cuando algo no existe, cada pantalla lo dice.
// ============================================================================

import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../firebase.js";
import { rolDe } from "../lib/constantes.js";
import { primerNombre } from "./lib/helpers.js";

import Login from "./auth/Login.jsx";
import MiClave from "./auth/MiClave.jsx";
import IngresoDiario from "./oficina/IngresoDiario.jsx";
import AdminHome from "./admin/AdminHome.jsx";

// Pantallas de la vendedora (una por botón grande del Home)
import Home from "./vendedora/Home.jsx";
import MiCash from "./vendedora/MiCash.jsx";
import MiMes from "./vendedora/MiMes.jsx";
import MiTrimestre from "./vendedora/MiTrimestre.jsx";
import DetalleIndicador from "./vendedora/DetalleIndicador.jsx";

import { DatosProvider, useDatos } from "./data/DatosContext.jsx";
import "./valquirias.css";

// ---------------------------------------------------------------------------
// LA SESIÓN VIVE AQUÍ ARRIBA, POR ENCIMA DEL PROVEEDOR DE DATOS.
// ---------------------------------------------------------------------------
// Antes `onAuthStateChanged` vivía DENTRO del proveedor (en ValquiriasAppInner),
// así que el proveedor se montaba y se suscribía a los 6 docs de Firestore antes
// de que existiera sesión. Las reglas niegan esas lecturas (`allow read: if
// autenticado()`), el SDK borraba los 6 targets y no los volvía a pedir nunca:
// la app quedaba con `vendedoras: []` para siempre y la vendedora caía en
// "No encontramos tu perfil" en bucle. Todo el detalle está en DatosContext.jsx.
//
// Ahora la sesión se resuelve ARRIBA y baja como prop `usuario`. El proveedor
// depende de ella: sin sesión no escucha nada, y cuando aparece —o cambia de
// persona— abre suscripciones NUEVAS. Hay una sola fuente de verdad de quién
// está adentro, así que es imposible que la pantalla crea que hay usuario
// mientras el proveedor cree que no.
// ---------------------------------------------------------------------------
export default function ValquiriasApp() {
  const [user, setUser] = useState(null);
  const [authListo, setAuthListo] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u);
    setAuthListo(true);
  }), []);

  return (
    <DatosProvider usuario={user}>
      {/* `key` por uid: cuando cambia quién está adentro (el admin cierra sesión
          y entra otro correo), el árbol se remonta y todo el estado local se va
          con él — el modo "ver como" incluido. Sin esto, la sesión nueva podría
          arrancar mirando a la vendedora que estaba viendo la anterior. Es el
          mismo recurso que ya se usa en `key={simulada.id}` más abajo. */}
      <ValquiriasAppInner
        key={user?.uid || "sin-sesion"}
        user={user}
        authListo={authListo}
        onUser={setUser}
      />
    </DatosProvider>
  );
}

// ---------------------------------------------------------------------------
// Guardado del ingreso diario — lo comparten Carolina y el admin.
// Escribe una fila por vendedora con clave `${vid}_${fecha}` en `registros`.
//
// ANTES construía `{ ...datos.registros }` desde el estado EN MEMORIA del
// navegador y mandaba el mapa entero. Si esa copia era vieja, el guardado
// borraba en silencio los días que otra persona ya había ingresado (así se
// perdieron 8 días de julio). Ahora sólo se manda el PARCHE de esta fecha y
// DatosContext lo fusiona dentro de una transacción, sobre el dato fresco.
//
// Devuelve la promesa a propósito: IngresoDiario la espera para poder avisarle
// al operador si el guardado falló.
// ---------------------------------------------------------------------------
function guardarIngresoDiario(datos, { fecha, filas, vids }) {
  return datos.guardarDiaRegistros(fecha, filas, vids);
}

// ---------------------------------------------------------------------------
// Barra de marca. No es navegación: es solo la identidad de la app y la salida.
// (El prototipo la deja siempre visible; lo que se quitó fue la fila de iconos.)
// ---------------------------------------------------------------------------
const btnBarra = {
  fontSize: 12, fontWeight: 700, color: "#94a3b8", background: "transparent",
  border: "1px solid #e2e8f0", padding: "6px 10px", borderRadius: 8, cursor: "pointer",
  fontFamily: "inherit",
};

function BarraMarca({ conSalir = true, onMiClave }) {
  return (
    <div className="v-header">
      <div className="v-brand">⚡ Valkyrias</div>
      <div style={{ display: "flex", gap: 8 }}>
        {onMiClave && (
          <button onClick={onMiClave} style={btnBarra}>🔑 Mi contraseña</button>
        )}
        {conSalir ? (
          <button onClick={() => signOut(auth)} style={btnBarra}>Salir</button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barra mínima para las pantallas que NO llevan BarraMarca (panel de Luis y la
// pantalla única de Carolina). Existe por una sola razón: quien ya tiene sesión
// abierta pero NO tiene contraseña (porque entró alguna vez con link mágico)
// necesita poder ponérsela sin que le llegue ningún correo. Ese es justamente
// el caso del dueño y del operador el día del cambio.
// ---------------------------------------------------------------------------
function BarraClave({ onMiClave }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 14px 0" }}>
      <button onClick={onMiClave} style={btnBarra}>🔑 Mi contraseña</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Banner del modo "ver como" (prototipo: bannerSimular()).
// Va DENTRO de la vista de la vendedora y es el único camino de vuelta al panel.
// ---------------------------------------------------------------------------
function BannerVerComo({ vendedora, onSalir }) {
  return (
    <button
      onClick={onSalir}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        width: "100%", gap: 10, padding: "11px 14px", marginBottom: 12,
        border: "none", borderRadius: 12, cursor: "pointer",
        background: "var(--vk-banner)",
        // El banner es verde OSCURO. Llevaba `--vk-noche-texto`, que en la
        // paleta pastel es tinta casi negra: texto oscuro sobre fondo oscuro.
        // Es el mismo emparejamiento roto que ya apareció en las pestañas y en
        // el botón de Entrar. Todo fondo oscuro va con `--vk-sobre-tinta`.
        color: "var(--vk-sobre-tinta)", fontFamily: "inherit", fontSize: 12.5, fontWeight: 800,
        textAlign: "left",
      }}
    >
      <span>🛡️ Viendo como {primerNombre(vendedora?.nombre)} · {vendedora?.ciudad || "—"}</span>
      <span>← Volver al panel</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// VISTA VENDEDORA — Home + 3 destinos + detalle de indicador.
// Sin BottomNav: los 3 botones grandes del Home son la navegación, y de cada
// pantalla se sale con su propio "‹ Volver".
//
// `vendedora` puede ser la de la sesión o, en modo "ver como", la que el admin
// eligió. Todo lo que se pinta sale de ese objeto → ciudad y rol son los de ella.
// ---------------------------------------------------------------------------
function VistaVendedora({ vendedora, verComo = false, onSalirVerComo, onMiClave }) {
  const [ruta, setRuta] = useState("home");             // home | cash | mes | trim | indicador
  const [indicador, setIndicador] = useState(null);     // { id, modo: "mes" | "trim" }

  // Scroll al top en cada salto (bug histórico: botones escondidos arriba)
  useEffect(() => { window.scrollTo(0, 0); }, [ruta, indicador]);

  // Nota: si el admin cambia de vendedora simulada, el padre remonta este
  // componente con `key={id}` — así la navegación arranca limpia en su Home
  // sin necesidad de resetear estado dentro de un efecto.

  const volverAlHome = () => { setIndicador(null); setRuta("home"); };
  const abrirIndicador = (modo) => (id) => { setIndicador({ id, modo }); setRuta("indicador"); };

  let contenido;
  if (ruta === "indicador" && indicador) {
    contenido = (
      <DetalleIndicador
        vendedora={vendedora}
        indicadorId={indicador.id}
        modo={indicador.modo}
        onVolver={() => {
          const destino = indicador.modo === "trim" ? "trim" : "mes";
          setIndicador(null);
          setRuta(destino);
        }}
      />
    );
  } else if (ruta === "cash") {
    contenido = <MiCash vendedora={vendedora} onVolver={volverAlHome} />;
  } else if (ruta === "mes") {
    contenido = (
      <MiMes vendedora={vendedora} onVolver={volverAlHome} onIndicador={abrirIndicador("mes")} />
    );
  } else if (ruta === "trim") {
    contenido = (
      <MiTrimestre vendedora={vendedora} onVolver={volverAlHome} onIndicador={abrirIndicador("trim")} />
    );
  } else {
    contenido = <Home vendedora={vendedora} onIr={(destino) => setRuta(destino)} />;
  }

  return (
    <div className="v-app vk-tema">
      {/* En modo "ver como" el que está logueado es Luis: el botón de salir se
          esconde para que no cierre SU sesión creyendo que sale de la simulación. */}
      {/* En modo "ver como" tampoco se ofrece cambiar contraseña: la sesión es
          la de Luis, no la de ella. Cambiarla ahí sería cambiar la de él. */}
      <BarraMarca conSalir={!verComo} onMiClave={verComo ? null : onMiClave} />
      {verComo && <BannerVerComo vendedora={vendedora} onSalir={onSalirVerComo} />}
      {contenido}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LA LECTURA DE DATOS FALLÓ TENIENDO SESIÓN. Es un error y se dice.
// ---------------------------------------------------------------------------
// Esta pantalla existe para que un fallo de lectura NUNCA se disfrace de "no
// hay datos". Antes, si Firestore negaba o fallaba la lectura, la app se
// marcaba como cargada con el roster vacío y la vendedora terminaba leyendo
// "Este email no está registrado como vendedora activa" — una acusación falsa.
//
// "Reintentar" vuelve a abrir las 6 suscripciones desde cero (no es un
// temporizador ni un reintento automático: lo dispara ella).
// ---------------------------------------------------------------------------
function ErrorDatos({ error, onReintentar }) {
  const codigo = error?.code || error?.message || "";
  return (
    <div className="v-app">
      <div className="v-loading" style={{ padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>📡</div>
        <div style={{ fontSize: 15, fontWeight: 900, color: "#1e1b4b", marginBottom: 8 }}>
          No pudimos cargar tus datos
        </div>
        <div style={{ fontSize: 12.5, color: "#64748b", fontWeight: 700, marginBottom: 6, lineHeight: 1.6 }}>
          Tu ingreso estuvo bien — lo que falló fue traer la información. Casi siempre
          es la conexión. Toca «Reintentar»; si vuelve a pasar, avísale a Luis.
        </div>
        {codigo && (
          <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, marginBottom: 18, wordBreak: "break-word" }}>
            {String(codigo)}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={onReintentar}
            style={{
              fontSize: 12.5, fontWeight: 800, color: "#fff", background: "var(--vk-titulo)",
              border: "none", padding: "10px 20px", borderRadius: 10, cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Reintentar
          </button>
          <button
            onClick={() => signOut(auth)}
            style={{
              fontSize: 12, fontWeight: 700, color: "#94a3b8", background: "transparent",
              border: "1px solid #e2e8f0", padding: "10px 16px", borderRadius: 10, cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pantalla honesta para un email logueado que no es ninguna vendedora activa.
// Nunca se le muestran los datos de otra persona.
//
// OJO — sólo se puede llegar aquí con el roster YA CARGADO (`estado === "listo"`).
// "No eres vendedora" y "todavía no sé quién eres" son cosas distintas, y decir
// la primera cuando pasa la segunda fue el bug que dejó a 13 personas en bucle.
// ---------------------------------------------------------------------------
function SinPerfil({ email }) {
  return (
    <div className="v-app">
      <div className="v-loading" style={{ padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🤔</div>
        <div style={{ fontSize: 15, fontWeight: 900, color: "#1e1b4b", marginBottom: 8 }}>
          No encontramos tu perfil
        </div>
        <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700, marginBottom: 20, lineHeight: 1.6 }}>
          {email ? <>El correo <strong>{email}</strong> no está</> : "Tu correo no está"} en la
          lista del equipo. Escríbele al administrador y dile con cuál correo estás entrando —
          él lo registra y entras enseguida.
        </div>
        <button
          onClick={() => signOut(auth)}
          style={{
            fontSize: 12, fontWeight: 700, color: "#94a3b8", background: "transparent",
            border: "1px solid #e2e8f0", padding: "8px 16px", borderRadius: 8, cursor: "pointer",
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

function ValquiriasAppInner({ user, authListo, onUser }) {
  const datosFS = useDatos();

  // Modo "ver como": id de la vendedora que el admin está mirando. null = panel.
  const [verComoId, setVerComoId] = useState(null);

  // Pantalla "🔑 Mi contraseña" (ponerse/cambiarse la clave desde adentro).
  const [verClave, setVerClave] = useState(false);
  const abrirClave = () => setVerClave(true);

  // Nota: no hace falta resetear `verComoId`/`verClave` cuando cambia el
  // usuario — el padre remonta este componente con `key={user.uid}`, así que
  // el estado local nace limpio con cada sesión.

  if (!authListo) {
    return <div className="v-app"><div className="v-loading">⏳ Cargando...</div></div>;
  }

  if (!user) {
    return <Login onLoggedIn={onUser} />;
  }

  // "Mi contraseña" va ANTES de esperar los datos de Firestore: quien viene a
  // ponerse la clave no necesita que el ranking haya cargado, y si Firestore
  // estuviera lento o caído igual tiene que poder hacerlo.
  if (verClave) {
    return <MiClave user={user} onCerrar={() => setVerClave(false)} />;
  }

  // ── LOS TRES ESTADOS DE LA CARGA ──────────────────────────────────────────
  // Hay sesión, así que a partir de aquí "sin datos" nunca es normal: o vienen
  // en camino, o la lectura falló. Antes ambos casos se pintaban igual (roster
  // vacío) y por eso la vendedora terminaba en "No encontramos tu perfil".
  //
  // `estado === "sin-sesion"` con `user` puesto sólo puede durar la render en
  // que la sesión acaba de aparecer y el proveedor aún no se suscribió: eso es
  // "cargando", no "no hay nada".
  if (datosFS.estado === "error") {
    return <ErrorDatos error={datosFS.errorCarga} onReintentar={datosFS.reintentar} />;
  }
  if (datosFS.estado !== "listo") {
    return <div className="v-app"><div className="v-loading">⏳ Cargando datos...</div></div>;
  }

  const rol = rolDe(user);

  // ── CAROLINA (oficina) ────────────────────────────────────────────────────
  // Una sola pantalla. Sin nav, sin tiles, sin ranking, sin ventas, sin trimestre.
  if (rol === "oficina") {
    return (
      <>
      <BarraClave onMiClave={abrirClave} />
      <IngresoDiario
        vendedoras={datosFS.vendedoras}
        // Quién está logueado: IngresoDiario lo necesita para saber si puede
        // corregir un día ya guardado (solo el admin) o solo llenar días vacíos.
        user={user}
        onGuardar={(payload) => guardarIngresoDiario(datosFS, payload)}
      />
      </>
    );
  }

  // ── ADMIN (Luis) ──────────────────────────────────────────────────────────
  if (rol === "admin") {
    if (verComoId != null) {
      const simulada = (datosFS.vendedoras || []).find(v => String(v.id) === String(verComoId)) || null;
      // La vendedora dejó de existir en el roster mientras se la miraba
      if (!simulada) {
        return (
          <div className="v-app">
            <BarraMarca conSalir={false} />
            <div className="v-loading" style={{ padding: 30, textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#1e1b4b", marginBottom: 14 }}>
                Esa vendedora ya no está en la lista del equipo.
              </div>
              <button
                onClick={() => setVerComoId(null)}
                style={{
                  fontSize: 12, fontWeight: 800, color: "#5b21b6", background: "#f3e8ff",
                  border: "1px solid #ddd3f5", padding: "8px 16px", borderRadius: 10, cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >← Volver al panel</button>
            </div>
          </div>
        );
      }
      return (
        <VistaVendedora
          key={simulada.id}
          vendedora={simulada}
          verComo
          onSalirVerComo={() => setVerComoId(null)}
        />
      );
    }
    // `user` viaja hasta el IngresoDiario que AdminHome monta adentro: es el
    // único que puede corregir un día ya guardado.
    return (
      <>
        <BarraClave onMiClave={abrirClave} />
        <AdminHome user={user} onVerComo={(v) => setVerComoId(v?.id ?? null)} />
      </>
    );
  }

  // ── VENDEDORA ─────────────────────────────────────────────────────────────
  // Aquí ya es seguro buscarla: `estado === "listo"` garantiza que los 6 docs
  // llegaron y parsearon, así que el roster que se consulta es el de verdad.
  const roster = Array.isArray(datosFS.vendedoras) ? datosFS.vendedoras : [];
  const emailBajo = (user.email || "").toLowerCase();
  const vendedora = emailBajo
    ? roster.find(v =>
        (v.email || "").toLowerCase() === emailBajo && v.activa !== false && !v.eventual
      ) || null
    : null;

  // Roster cargado pero VACÍO: no es que ella no esté, es que no está NADIE.
  // Eso es una falla de la sincronización desde systemlap, y decirle
  // "tu email no está registrado" sería acusarla de algo que no pasó.
  if (!vendedora && roster.length === 0) {
    return <ErrorDatos error={{ message: "El equipo llegó vacío desde el servidor." }} onReintentar={datosFS.reintentar} />;
  }

  if (!vendedora) return <SinPerfil email={user.email || ""} />;

  return <VistaVendedora vendedora={vendedora} onMiClave={abrirClave} />;
}
