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

import LoginMagicLink from "./auth/LoginMagicLink.jsx";
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

export default function ValquiriasApp() {
  return (
    <DatosProvider>
      <ValquiriasAppInner />
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
function BarraMarca({ conSalir = true }) {
  return (
    <div className="v-header">
      <div className="v-brand">⚡ Valkyrias</div>
      {conSalir ? (
        <button
          onClick={() => signOut(auth)}
          style={{
            fontSize: 12, fontWeight: 700, color: "#94a3b8", background: "transparent",
            border: "1px solid #e2e8f0", padding: "6px 10px", borderRadius: 8, cursor: "pointer",
            fontFamily: "inherit",
          }}
        >Salir</button>
      ) : <div style={{ width: 1 }} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Banner morado del modo "ver como" (prototipo: bannerSimular()).
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
        background: "linear-gradient(135deg, #7c3aed, #a855f7)",
        color: "#fff", fontFamily: "inherit", fontSize: 12.5, fontWeight: 800,
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
function VistaVendedora({ vendedora, verComo = false, onSalirVerComo }) {
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
    <div className="v-app">
      {/* En modo "ver como" el que está logueado es Luis: el botón de salir se
          esconde para que no cierre SU sesión creyendo que sale de la simulación. */}
      <BarraMarca conSalir={!verComo} />
      {verComo && <BannerVerComo vendedora={vendedora} onSalir={onSalirVerComo} />}
      {contenido}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pantalla honesta para un email logueado que no es ninguna vendedora activa.
// Nunca se le muestran los datos de otra persona.
// ---------------------------------------------------------------------------
function SinPerfil() {
  return (
    <div className="v-app">
      <div className="v-loading" style={{ padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🤔</div>
        <div style={{ fontSize: 15, fontWeight: 900, color: "#1e1b4b", marginBottom: 8 }}>
          No encontramos tu perfil
        </div>
        <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700, marginBottom: 20 }}>
          Este email no está registrado como vendedora activa. Escríbele al administrador.
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

function ValquiriasAppInner() {
  const datosFS = useDatos();
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Modo "ver como": id de la vendedora que el admin está mirando. null = panel.
  const [verComoId, setVerComoId] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoadingAuth(false);
    });
    return unsub;
  }, []);

  if (loadingAuth) {
    return <div className="v-app"><div className="v-loading">⏳ Cargando...</div></div>;
  }

  if (!user) {
    return <LoginMagicLink onLoggedIn={setUser} />;
  }

  // Sin datos todavía no se pinta nada: mejor esperar que mostrar cifras a medias
  if (!datosFS.cargado) {
    return <div className="v-app"><div className="v-loading">⏳ Cargando datos...</div></div>;
  }

  const rol = rolDe(user);

  // ── CAROLINA (oficina) ────────────────────────────────────────────────────
  // Una sola pantalla. Sin nav, sin tiles, sin ranking, sin ventas, sin trimestre.
  if (rol === "oficina") {
    return (
      <IngresoDiario
        vendedoras={datosFS.vendedoras}
        // Quién está logueado: IngresoDiario lo necesita para saber si puede
        // corregir un día ya guardado (solo el admin) o solo llenar días vacíos.
        user={user}
        onGuardar={(payload) => guardarIngresoDiario(datosFS, payload)}
      />
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
                Esa vendedora ya no está en el roster.
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
    return <AdminHome user={user} onVerComo={(v) => setVerComoId(v?.id ?? null)} />;
  }

  // ── VENDEDORA ─────────────────────────────────────────────────────────────
  const emailBajo = (user.email || "").toLowerCase();
  const vendedora = emailBajo
    ? (datosFS.vendedoras || []).find(v =>
        (v.email || "").toLowerCase() === emailBajo && v.activa !== false && !v.eventual
      ) || null
    : null;

  if (!vendedora) return <SinPerfil />;

  return <VistaVendedora vendedora={vendedora} />;
}
