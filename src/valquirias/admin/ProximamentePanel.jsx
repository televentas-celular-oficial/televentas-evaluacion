// Panel placeholder — se muestra al tap de tiles admin aún no construidos
// Cuando construimos cada sección, el AdminHome dejará de rutear aquí

export default function ProximamentePanel({ titulo, onVolver }) {
  return (
    <div className="v-app v-ancho">
      <div className="v-header-detalle">
        <button className="v-back-btn" onClick={onVolver}>‹ Volver</button>
        <div className="v-header-title">{titulo}</div>
        <div style={{ width: 60 }} />
      </div>

      <div style={{
        background: "linear-gradient(135deg, #f3e8ff, #fdf4ff)",
        border: "1.5px dashed #a855f7",
        borderRadius: 16,
        padding: "40px 20px",
        textAlign: "center",
        marginTop: 20,
      }}>
        <div style={{ fontSize: 48, marginBottom: 10 }}>🚧</div>
        <div style={{ fontSize: 16, fontWeight: 900, color: "#5b21b6", marginBottom: 6 }}>
          En construcción
        </div>
        <div style={{ fontSize: 13, color: "#64748b", fontWeight: 700, lineHeight: 1.5, maxWidth: 300, margin: "0 auto" }}>
          Esta sección la construimos en la próxima iteración. Por ahora, esta funcionalidad sigue disponible en el <strong>Admin anterior</strong> — para acceder:
        </div>
        <a href="?v=classic" style={{
          display: "inline-block",
          marginTop: 14,
          padding: "10px 18px",
          background: "linear-gradient(135deg, #7c3aed, #ec4899)",
          color: "#fff",
          textDecoration: "none",
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 900,
        }}>
          Ir al Admin clásico
        </a>
      </div>
    </div>
  );
}
