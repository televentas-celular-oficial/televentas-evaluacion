// Campo de contraseña con ojito.
// La mitad del equipo entra desde el celular, de noche: escribir a ciegas una
// clave que no se ve es la forma más rápida de quedarse afuera creyendo que la
// contraseña está mala. El ojito no es adorno.
//
// `autoComplete` correcto es lo que hace que el llavero del teléfono ofrezca
// guardarla (y rellenarla después):
//   "current-password" → al entrar     "new-password" → al crearla o cambiarla

export default function CampoClave({
  valor,
  onCambia,
  visible,
  onVisible,
  autoComplete = "current-password",
  placeholder = "Tu contraseña",
  name = "password",
  onEnter,
  autoFocus = false,
}) {
  return (
    <div style={{ position: "relative", marginBottom: 12 }}>
      <input
        type={visible ? "text" : "password"}
        className="v-login-input"
        style={{ marginBottom: 0, paddingRight: 52 }}
        placeholder={placeholder}
        value={valor}
        name={name}
        onChange={(e) => onCambia(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && onEnter) onEnter(); }}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck="false"
        autoFocus={autoFocus}
      />
      <button
        type="button"
        onClick={() => onVisible(!visible)}
        aria-label={visible ? "Ocultar contraseña" : "Ver contraseña"}
        style={{
          position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
          background: "none", border: "none", cursor: "pointer",
          fontSize: 17, padding: "6px 10px", lineHeight: 1,
        }}
      >
        {visible ? "🙈" : "👁️"}
      </button>
    </div>
  );
}
