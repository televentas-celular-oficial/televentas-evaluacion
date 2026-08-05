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

if (flagUrl === 'classic') {
  localStorage.setItem('use_valquirias_tlv', 'classic');
  // Limpiar el ?v=classic del URL para evitar reappear
  const nuevoURL = window.location.pathname + window.location.hash;
  window.history.replaceState({}, document.title, nuevoURL);
} else if (flagUrl === 'tlv') {
  localStorage.setItem('use_valquirias_tlv', 'tlv');
  const nuevoURL = window.location.pathname + window.location.hash;
  window.history.replaceState({}, document.title, nuevoURL);
}

const preferencia = localStorage.getItem('use_valquirias_tlv');
// Default = tlv (app nueva). Solo se muestra la vieja si Luis explícitamente pidió ?v=classic
const usarNueva = preferencia !== 'classic';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {usarNueva ? <ValquiriasApp /> : <App />}
  </StrictMode>,
)
