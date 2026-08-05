import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ValquiriasApp from './valquirias/ValquiriasApp.jsx'

// DEFAULT: app nueva Valquirias TLV
// Escape a la app vieja: ?v=classic (persiste en localStorage)
// Reactivar la nueva: ?v=tlv o borrar localStorage
const urlParams = new URLSearchParams(window.location.search);
const flagUrl = urlParams.get('v');

function limpiarParam(param) {
  const p = new URLSearchParams(window.location.search);
  p.delete(param);
  const qs = p.toString();
  const nuevoURL = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
  window.history.replaceState({}, document.title, nuevoURL);
}

if (flagUrl === 'classic') {
  localStorage.setItem('use_valquirias_tlv', 'classic');
  limpiarParam('v');
} else if (flagUrl === 'tlv') {
  localStorage.setItem('use_valquirias_tlv', 'tlv');
  limpiarParam('v');
}

const preferencia = localStorage.getItem('use_valquirias_tlv');
// Default = tlv (app nueva). Solo se muestra la vieja si Luis explícitamente pidió ?v=classic
const usarNueva = preferencia !== 'classic';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {usarNueva ? <ValquiriasApp /> : <App />}
  </StrictMode>,
)
