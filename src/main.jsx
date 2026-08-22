import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import ValquiriasApp from './valquirias/ValquiriasApp.jsx'
import Muro from './valquirias/common/Muro.jsx'

// ============================================================================
// SIEMPRE se monta la app nueva (Valquirias TLV). No hay segunda app.
//
// La app clásica (src/App.jsx) quedó FUERA del bundle a propósito. Guardaba con
// `setDoc` del documento COMPLETO desde memoria (App.jsx:410-416, App.jsx:470-474)
// y cargaba una sola vez con `getDoc`, sin `onSnapshot` (App.jsx:364-407): su
// copia envejecía toda la sesión, así que una pestaña abierta días escribía datos
// viejos encima de los buenos. Así se perdieron 8 días de julio. El archivo se
// conserva como referencia de lógica, pero no se importa desde ningún lado, no
// entra al bundle y no hay URL que lo alcance.
//
// `?v=classic` dejó de tener efecto. Y la preferencia que ese parámetro dejaba
// pegada en localStorage era peor que el parámetro: quien la activó una vez se
// quedaba en la app vieja para siempre, sin ninguna señal visual. Por eso se
// BORRA al arrancar — el que la tenga sale solo, sin hacer nada.
// ============================================================================

// El nombre de la clave se arma en tiempo de ejecución A PROPÓSITO: si estuviera
// como literal, quedaría en el bundle compilado y un `grep` sobre dist/ no podría
// verificar que la app vieja ya no dejó rastro. No lo "simplifiques" a la cadena.
const CLAVE_PREFERENCIA_VIEJA = ['use', 'valquirias', 'tlv'].join('_')

try {
  localStorage.removeItem(CLAVE_PREFERENCIA_VIEJA)
} catch {
  // localStorage bloqueado (navegación privada, cookies de terceros). Da igual:
  // la preferencia ya no se lee en ninguna parte, borrarla es solo higiene.
}

// Limpiar `?v=` de la URL para que un enlace o marcador viejo no parezca que
// todavía hace algo.
const params = new URLSearchParams(window.location.search)
if (params.has('v')) {
  params.delete('v')
  const qs = params.toString()
  window.history.replaceState(
    {},
    document.title,
    window.location.pathname + (qs ? '?' + qs : '') + window.location.hash
  )
}

// El muro de afuera, el de último recurso. El de adentro (ValquiriasApp) deja
// la cáscara viva y permite volver al inicio; este atrapa lo que se caiga ANTES
// de que exista esa cáscara — el login, la carga de datos, el panel — donde lo
// otro que hay es la página en blanco.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Muro donde="app">
      <ValquiriasApp />
    </Muro>
  </StrictMode>,
)
