// Puerta de entrada. Decide cuál de los dos caminos se pinta.
// ============================================================================
//   · Correo y contraseña (IngresoClave)  → la puerta principal, la de siempre.
//   · Link mágico (LoginMagicLink)        → salida de emergencia, se conserva.
//
// El link mágico se muestra solo cuando:
//   a) el URL trae un link de ingreso que hay que terminar de canjear
//      (alguien pidió uno antes del cambio, o lo pidió como emergencia), o
//   b) alguien abre la app con  ?acceso=link  a propósito.
//
// Ya NO hay botón para llegar aquí desde la pantalla de contraseña. Motivo: en
// iPhone el link del correo abre en Safari, no en la app instalada, así que
// ofrecerlo en pantalla producía personas atascadas. Queda como puerta de
// servicio, para el dueño y para rescatar a alguien puntual:
//
//     https://valkyrias.pages.dev/?acceso=link
//
// NO se borra el código del link mágico: es el único camino que no depende de
// recordar nada, y sostiene los casos que la contraseña no resuelve. Eso sí,
// en el plan gratuito de Firebase son 5 correos de link por día — por eso deja
// de ser la puerta principal y pasa a ser la salida de emergencia.
// ============================================================================

import { useState } from "react";
import { isSignInWithEmailLink } from "firebase/auth";
import { auth } from "../../firebase.js";
import IngresoClave from "./IngresoClave.jsx";
import LoginMagicLink from "./LoginMagicLink.jsx";

function hayLinkEnURL() {
  try { return isSignInWithEmailLink(auth, window.location.href); } catch { return false; }
}

// Puerta de servicio: ?acceso=link. Una vendedora no llega aquí por accidente
// (habría que escribirlo a mano en la barra de direcciones), pero el dueño la
// tiene a un mensaje de distancia cuando la necesite.
function pidieronLinkEnURL() {
  try {
    return new URLSearchParams(window.location.search).get("acceso") === "link";
  } catch { return false; }
}

export default function Login({ onLoggedIn }) {
  // Se calcula UNA vez al montar: si el URL trae link, hay que canjearlo sí o sí.
  const [modo, setModo] = useState(() => (hayLinkEnURL() || pidieronLinkEnURL() ? "link" : "clave"));

  if (modo === "link") {
    return (
      <LoginMagicLink
        onLoggedIn={onLoggedIn}
        onVolverAClave={() => setModo("clave")}
      />
    );
  }

  return <IngresoClave onLoggedIn={onLoggedIn} />;
}
