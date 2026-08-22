// ============================================================================
// MURO — la red de seguridad de la app
// ============================================================================
// Puesto el 22-ago-2026, el día que la app se prendió para las vendedoras.
//
// POR QUÉ EXISTE. En React, un error al PINTAR cualquier pantalla no rompe esa
// pantalla: desmonta el árbol entero y deja la página EN BLANCO. Hasta hoy no
// había un solo ErrorBoundary en el proyecto, y eso no era teórico — la tarjeta
// del lunes usaba dos variables que no existen en ningún archivo (`idLider`,
// `soyLiderDelClub`) y habría tumbado el Home completo de todas las de una
// ciudad, cualquier lunes en que alguna llegara a los $2.500.000. Se arregló ese
// mismo día, pero el agujero que lo dejó llegar a producción sigue abierto para
// el próximo descuido. Esto lo tapa.
//
// LO QUE ESTE MURO NO PUEDE HACER: avisarle a Luis solo. Las reglas de Firestore
// no le dejan escribir NADA a una vendedora (firestore.rules: `allow create,
// update` exige esAdmin() o esOficina()), y abrirlas para poder guardar un log
// de errores sería aflojar la seguridad de los seis documentos para arreglar un
// problema de diagnóstico. Por eso el muro muestra un detalle corto y copiable:
// ella manda el pantallazo y con eso alcanza para encontrarlo.
//
// SIN ROJO — regla del dueño para la vista de la vendedora. Va en ámbar: dice
// "algo pasa" sin parecer una alarma. Un error de la app no es culpa suya y el
// texto lo dice explícitamente.
//
// CÓMO SE RESETEA: no se resetea solo. Cuando ella navega, el llamador le pone
// un `key` distinto y React lo remonta limpio. Ver ValquiriasApp.jsx.

import { Component } from "react";

// El muro se usa en DOS sitios: por dentro de `.v-app` (que ya limita el ancho)
// y en la raíz, donde no hay contenedor ninguno. Por eso trae su propio ancho y
// su propio margen: sin esto, el de la raíz pintaría una tarjeta pegada a los
// dos bordes de la pantalla, y en el panel de 1180px una franja gigante.
const FUERA = { padding: "0 14px" };

const CAJA = {
  background: "var(--vk-ambar-fondo)",
  border: "1.5px solid var(--vk-ambar-borde)",
  borderRadius: 16,
  padding: "20px 18px",
  margin: "14px auto",
  maxWidth: 460,
  color: "var(--vk-ambar-texto)",
  textAlign: "center",
  // La tipografía se declara aquí porque el muro de la raíz vive FUERA de
  // `.v-app`, que es quien la pone. Sin esto el aviso sale en serif del
  // navegador — justo en la pantalla que tiene que verse cuidada.
  fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const BOTON = {
  font: "inherit",
  fontSize: 13.5,
  fontWeight: 800,
  padding: "10px 18px",
  borderRadius: 999,
  cursor: "pointer",
  border: "none",
};

export default class Muro extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Queda en la consola del navegador con un prefijo buscable. No es un aviso
    // para nadie —nadie mira la consola de un celular— pero si Luis conecta el
    // teléfono o si esto pasa en el escritorio, es lo primero que se busca.
    console.error(`[Valkyrias] se cayó "${this.props.donde || "?"}":`, error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { onVolver, donde } = this.props;
    // Corto a propósito: tiene que caber en un pantallazo de celular y servir
    // para encontrar el archivo. El stack completo no aporta nada ahí.
    const detalle = `${donde || "?"} · ${String(error?.message || error).slice(0, 140)}`;

    return (
      <div style={FUERA}>
      <div style={CAJA}>
        <div style={{ fontSize: 26, marginBottom: 8 }}>🔧</div>

        <div style={{ fontSize: 15.5, fontWeight: 800, lineHeight: 1.35, marginBottom: 8 }}>
          Esta pantalla se dañó
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.6, marginBottom: 16 }}>
          No es nada que hayas hecho, y no se perdió ningún dato tuyo: es un error
          de la app. Vuelve a intentarlo y, si sigue igual, mándale este pantallazo
          a Luis.
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {onVolver && (
            <button
              style={{ ...BOTON, background: "var(--vk-ambar-texto)", color: "var(--vk-sobre-tinta)" }}
              onClick={() => { this.setState({ error: null }); onVolver(); }}
            >
              Volver al inicio
            </button>
          )}
          <button
            style={{
              ...BOTON,
              background: "var(--vk-tarjeta)",
              color: "var(--vk-ambar-texto)",
              boxShadow: "inset 0 0 0 1.5px var(--vk-ambar-borde)",
            }}
            onClick={() => window.location.reload()}
          >
            Recargar la app
          </button>
        </div>

        {/* La línea que sirve para encontrarlo. Pequeña, pero legible en el
            pantallazo: si va más chica no se lee, y entonces no sirve de nada. */}
        <div
          style={{
            marginTop: 16,
            paddingTop: 12,
            borderTop: "1px solid var(--vk-ambar-borde)",
            fontSize: 11,
            fontWeight: 700,
            opacity: 0.85,
            wordBreak: "break-word",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        >
          {detalle}
        </div>
      </div>
      </div>
    );
  }
}
