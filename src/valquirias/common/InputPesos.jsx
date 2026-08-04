// InputPesos — input de dinero COP con formato en tiempo real
// Portado de App.jsx:17-61 (misma lógica exacta)
//
// - type="text" + inputMode="numeric" → teclado numérico en móvil
// - Formatea con puntos de miles: 29815200 → 29.815.200
// - Preserva la posición del cursor mientras se escribe
// - defaultValue + ref (input descontrolado) → no pierde foco al re-renderizar

export default function InputPesos({ inputRef, defaultValue = "", placeholder, style, disabled }) {
  const fmt = (s) => {
    const limpio = String(s || "").replace(/\D/g, "");
    if (!limpio) return "";
    return Number(limpio).toLocaleString("es-CO");
  };
  const inicial = fmt(defaultValue);

  return (
    <div style={{ position: "relative" }}>
      <span style={{
        position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
        color: "#94a3b8", fontWeight: 700, fontSize: 13, pointerEvents: "none",
      }}>$</span>
      <input
        type="text"
        inputMode="numeric"
        ref={inputRef}
        defaultValue={inicial}
        placeholder={placeholder}
        disabled={disabled}
        onInput={(e) => {
          const el = e.target;
          const antes = el.value;
          const cursor = el.selectionStart || 0;
          const digitosAntesDelCursor = antes.slice(0, cursor).replace(/\D/g, "").length;
          const formateado = fmt(antes);
          el.value = formateado;
          let cur = 0, digitosVistos = 0;
          while (cur < formateado.length && digitosVistos < digitosAntesDelCursor) {
            if (/\d/.test(formateado[cur])) digitosVistos++;
            cur++;
          }
          try { el.setSelectionRange(cur, cur); } catch { /* ignore */ }
        }}
        style={{ ...style, paddingLeft: 24, boxSizing: "border-box", width: "100%" }}
      />
    </div>
  );
}

// Lee el valor de un input formateado como pesos y retorna número puro
export function leerPesos(inputRef) {
  const s = inputRef?.current?.value || "";
  return Number(String(s).replace(/\D/g, "")) || 0;
}
