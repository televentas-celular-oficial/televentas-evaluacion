import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ValquiriasApp from './valquirias/ValquiriasApp.jsx'

// Feature flag: ?v=tlv activa la nueva app "Valquirias TLV"
// Sin el flag, se ve la app actual (Televentas Evaluación).
// Cuando esté validada, cambiamos el default.
const urlParams = new URLSearchParams(window.location.search);
const useValquirias = urlParams.get('v') === 'tlv';

// Persistir preferencia en localStorage
if (useValquirias) {
  localStorage.setItem('use_valquirias_tlv', '1');
}
const usarNueva = useValquirias || localStorage.getItem('use_valquirias_tlv') === '1';

// Para volver a la vieja: ?v=classic
if (urlParams.get('v') === 'classic') {
  localStorage.removeItem('use_valquirias_tlv');
  window.location.href = window.location.pathname;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {usarNueva ? <ValquiriasApp /> : <App />}
  </StrictMode>,
)
