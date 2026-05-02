import { useState, useEffect } from "react";
import {
  VENDEDORAS_DEFAULT, COLOR_CIUDAD, LABEL_CIUDAD, COLOR_VENTAS,
  getIndicadores, esFormulaV2,
  esAdmin, puedeIngresoVentas, puedeAdmin,
  PESOS_TRIMESTRE, MES_NAMES,
} from "./lib/constantes.js";
import {
  fmtN, colorN, bgN, hoyStr, trimestreActual, mesesTrimestre,
  claveMes, diaVacio,
  notaDia,
  calcNotaMensual, calcRanking, calcTrimestre, calcPremios,
} from "./lib/calculos.js";

// =============================================================
// COMPONENTE PRINCIPAL
// =============================================================
export default function App() {
  const [pantalla, setPantalla] = useState("ranking");
  const [vendedoras, setVendedoras] = useState([]);
  const [registros, setRegistros] = useState({});
  const [metas, setMetas] = useState({});
  const [snapshots, setSnapshots] = useState({});  // mes cerrado
  const [config, setConfig] = useState({ rankingVisible: false });  // switch maestro
  const [cargado, setCargado] = useState(false);
  const [verVid, setVerVid] = useState(null);
  const [tabRank, setTabRank] = useState("general");
  const [mesViendo, setMesViendo] = useState(() => new Date().getMonth() + 1);
  const [añoViendo] = useState(() => new Date().getFullYear());
  const [fecha, setFecha] = useState(hoyStr());
  const [filas, setFilas] = useState({});
  const [guardado, setGuardado] = useState(false);
  const [editando, setEditando] = useState(false);
  const [verModoTrim, setVerModoTrim] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [erroresFalt, setErroresFalt] = useState([]);  // vids con campos obligatorios faltantes
  // Auth: usuario logueado
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [pideLogin, setPideLogin] = useState(false);  // muestra modal de login
  const [pantallaTrasLogin, setPantallaTrasLogin] = useState(null);  // a dónde ir tras loguearse

  const ahora = new Date();
  const añoActual = ahora.getFullYear();
  const mesActual = ahora.getMonth() + 1;
  const año = añoViendo;
  const mes = mesViendo;
  const claveMesActual = claveMes(año, mes);
  const activas = vendedoras.filter(v => v.activa !== false);

  // ============================================================
  // FIREBASE AUTH — listener de login
  // ============================================================
  useEffect(() => {
    let unsub;
    (async () => {
      const { onAuthStateChanged } = await import("firebase/auth");
      const { auth } = await import("./firebase.js");
      unsub = onAuthStateChanged(auth, (u) => {
        setUser(u);
        setAuthReady(true);
      });
    })();
    return () => unsub && unsub();
  }, []);

  async function hacerLogin(email, password) {
    const { signInWithEmailAndPassword } = await import("firebase/auth");
    const { auth } = await import("./firebase.js");
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function hacerLogout() {
    const { signOut } = await import("firebase/auth");
    const { auth } = await import("./firebase.js");
    await signOut(auth);
  }

  // ============================================================
  // CARGA INICIAL DESDE FIREBASE
  // ============================================================
  useEffect(() => {
    async function cargar() {
      let regs = {}, mets = {}, vends = VENDEDORAS_DEFAULT, snaps = {}, cfg = { rankingVisible: false };
      try {
        const { getDoc, doc } = await import("firebase/firestore");
        const { db } = await import("./firebase.js");

        const [r, m, v, s, c] = await Promise.all([
          getDoc(doc(db, "televentas", "registros")),
          getDoc(doc(db, "televentas", "metas")),
          getDoc(doc(db, "televentas", "vendedoras")),
          getDoc(doc(db, "televentas", "snapshots")),
          getDoc(doc(db, "televentas", "config")),
        ]);

        if (r.exists()) regs = JSON.parse(r.data().data);
        if (m.exists()) mets = JSON.parse(m.data().data);
        if (v.exists()) {
          vends = JSON.parse(v.data().data);
          vends = vends.map(x => ({ ...x, fechaIngreso: x.fechaIngreso || "2026-04-01" }));
        }
        if (s.exists()) snaps = JSON.parse(s.data().data);
        if (c.exists()) cfg = JSON.parse(c.data().data);
      } catch (e) { console.error("Error cargando datos:", e); }

      setRegistros(regs);
      setMetas(mets);
      setVendedoras(vends);
      setSnapshots(snaps);
      setConfig(cfg);

      // Buscar primer día sin llenar
      const añoMes = añoActual + "-" + String(mesActual).padStart(2, "0");
      let primer = hoyStr();
      const act = vends.filter(v => v.activa !== false);
      for (let d = 1; d <= new Date().getDate(); d++) {
        const f2 = añoMes + "-" + String(d).padStart(2, "0");
        if (!act.some(v => regs[v.id + "_" + f2])) { primer = f2; break; }
      }
      setFecha(primer);
      setCargado(true);
    }
    cargar();
  }, []);

  // Save helpers (re-importa Firebase dinámicamente)
  async function fbSet(docName, data) {
    try {
      const { setDoc, doc } = await import("firebase/firestore");
      const { db } = await import("./firebase.js");
      await setDoc(doc(db, "televentas", docName), { data: JSON.stringify(data) });
    } catch (e) { console.error("Error guardando " + docName + ":", e); }
  }
  async function saveRegs(data) { setRegistros(data); await fbSet("registros", data); }
  async function saveMetas(data) { setMetas(data); await fbSet("metas", data); }
  async function saveVends(data) { setVendedoras(data); await fbSet("vendedoras", data); }
  async function saveSnapshots(data) { setSnapshots(data); await fbSet("snapshots", data); }
  async function saveConfig(data) { setConfig(data); await fbSet("config", data); }

  // ============================================================
  // INGRESO DEL DÍA — inicializar filas cuando cambia fecha
  // ============================================================
  useEffect(() => {
    if (!cargado || !activas.length) return;
    const [yStr, mStr] = fecha.split("-");
    const yIng = parseInt(yStr), mIng = parseInt(mStr);
    const init = {};
    activas.forEach(v => {
      const k = v.id + "_" + fecha;
      init[v.id] = registros[k] ? { ...registros[k] } : diaVacio(v.id, yIng, mIng);
    });
    setFilas(init);
    setGuardado(activas.some(v => registros[v.id + "_" + fecha]));
    setEditando(false);
  }, [fecha, cargado, vendedoras]);

  function setFila(vid, campo, valor) {
    setFilas(f => ({ ...f, [vid]: { ...f[vid], [campo]: valor } }));
  }

  function guardarDia() {
    // Validar: si actitud es regular/mal, requiere nota obligatoria
    const [yStr, mStr] = fecha.split("-");
    const yIng = parseInt(yStr), mIng = parseInt(mStr);
    const isV2 = esFormulaV2(yIng, mIng);
    if (isV2) {
      const faltantes = activas
        .filter(v => !filas[v.id]?.descanso)
        .filter(v => {
          const f = filas[v.id] || {};
          const necesita = f.actitud === "regular" || f.actitud === "mal";
          const tiene = (f.actitud_nota || "").trim().length > 0;
          return necesita && !tiene;
        })
        .map(v => v.id);
      if (faltantes.length > 0) {
        setErroresFalt(faltantes);
        // Scroll al primero que falta
        setTimeout(() => {
          const el = document.querySelector(`[data-actitud-vid="${faltantes[0]}"]`);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
        return;
      }
    }
    setErroresFalt([]);
    const n = { ...registros };
    activas.forEach(v => {
      n[v.id + "_" + fecha] = { ...filas[v.id], vid: v.id, fecha };
    });
    saveRegs(n);
    setGuardado(true);
    setEditando(false);
  }

  const ranking = calcRanking(registros, metas, año, mes, vendedoras, snapshots);
  const bloqueado = guardado && !editando;
  const mesEstaCerrado = !!snapshots[claveMesActual];

  // Confetti: se muestra UNA SOLA VEZ por cada publicación nueva del ranking.
  // - Cada vez que el admin prende el switch, genera un nuevo `publicacionId` (timestamp)
  // - El navegador guarda qué publicación ya vio
  // - Solo se muestra confetti si es una publicación NUEVA y la vendedora está viendo el ranking/boletin/trimestre
  useEffect(() => {
    if (!cargado) return;
    if (!config.rankingVisible) return;
    if (!config.publicacionId) return;
    const pantallasViz = ["ranking", "boletin", "trimestre"];
    if (!pantallasViz.includes(pantalla)) return;
    try {
      const visto = localStorage.getItem("televentas_confetti_visto");
      if (String(visto) === String(config.publicacionId)) return; // ya lo vio para esta publicación
      localStorage.setItem("televentas_confetti_visto", String(config.publicacionId));
      setConfetti(true);
      setTimeout(() => setConfetti(false), 4000);
    } catch { /* ignorar errores de localStorage */ }
  }, [config.rankingVisible, config.publicacionId, pantalla, cargado]);

  // Estilos centrales
  const S = makeStyles();

  // ============================================================
  // SUB-COMPONENTES
  // ============================================================

  function BadgeCiudad({ ciudad, full }) {
    return (
      <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 10, background: COLOR_CIUDAD[ciudad] + "20", color: COLOR_CIUDAD[ciudad], border: "1px solid " + COLOR_CIUDAD[ciudad] + "40" }}>
        {full ? LABEL_CIUDAD[ciudad] : ciudad}
      </span>
    );
  }

  function NotaBadge({ nota, size }) {
    const sz = size || 18;
    return (
      <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: sz * 2.8, padding: "2px 10px", borderRadius: 8, background: bgN(nota), color: colorN(nota), fontWeight: 900, fontSize: sz }}>
        {fmtN(nota)}
      </div>
    );
  }

  // Número que se "anima" contando hacia el valor real
  function NotaAnimada({ nota, size = 56, color }) {
    const [v, setV] = useState(0);
    useEffect(() => {
      if (nota === null || nota === undefined) { setV(0); return; }
      let raf;
      const start = performance.now();
      const dur = 700;
      function step(t) {
        const p = Math.min(1, (t - start) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        setV(nota * eased);
        if (p < 1) raf = requestAnimationFrame(step);
      }
      raf = requestAnimationFrame(step);
      return () => cancelAnimationFrame(raf);
    }, [nota]);
    return (
      <div style={{ fontSize: size, fontWeight: 900, color: color || colorN(nota), lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
        {nota === null || nota === undefined ? "—" : v.toFixed(2)}
      </div>
    );
  }

  // Modal de login con email + password (Firebase Auth)
  function ModalLogin({ titulo, onClose }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [err, setErr] = useState("");
    const [cargando, setCargando] = useState(false);

    async function intentar() {
      setErr(""); setCargando(true);
      try {
        await hacerLogin(email.trim(), password);
        // Login exitoso: el listener de auth se encarga
        setCargando(false);
        if (onClose) onClose();
      } catch (e) {
        setCargando(false);
        const code = e?.code || "";
        if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
          setErr("Correo o contraseña incorrectos");
        } else if (code.includes("too-many-requests")) {
          setErr("Demasiados intentos. Esperá unos minutos.");
        } else if (code.includes("network")) {
          setErr("Sin conexión a internet");
        } else {
          setErr("Error: " + (e?.message || "intenta de nuevo"));
        }
      }
    }

    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 320 }}>
          <div style={{ fontSize: 32, marginBottom: 8, textAlign: "center" }}>🔐</div>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 16, textAlign: "center" }}>{titulo || "Iniciar sesión"}</div>
          <label style={S.lbl}>Correo</label>
          <input type="email" autoComplete="email" autoFocus value={email}
            onChange={e => { setEmail(e.target.value); setErr(""); }}
            onKeyDown={e => { if (e.key === "Enter") document.getElementById("pwd-input")?.focus(); }}
            placeholder="tucorreo@ejemplo.com"
            style={{ ...S.inp, marginBottom: 8 }} />
          <label style={S.lbl}>Contraseña</label>
          <input id="pwd-input" type="password" autoComplete="current-password" value={password}
            onChange={e => { setPassword(e.target.value); setErr(""); }}
            onKeyDown={e => { if (e.key === "Enter") intentar(); }}
            style={{ ...S.inp, marginBottom: 8 }} />
          {err && <div style={{ color: "#dc2626", fontSize: 12, marginBottom: 8, textAlign: "center" }}>{err}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {onClose && <button style={{ ...S.btnS, flex: 1 }} onClick={onClose} disabled={cargando}>Cancelar</button>}
            <button disabled={cargando || !email || !password} onClick={intentar}
              style={{ flex: 2, padding: "12px 0", borderRadius: 10, border: "none", cursor: cargando ? "wait" : "pointer", fontWeight: 800, fontSize: 14, background: "linear-gradient(135deg,#ea580c,#f97316)", color: "#fff", opacity: (!email || !password) ? 0.5 : 1 }}>
              {cargando ? "Verificando…" : "Ingresar"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Pantalla cuando se requiere login (Ingreso/Ventas/Admin sin estar logueado)
  function PantallaRequiereLogin({ emoji, titulo, descripcion }) {
    const [showLogin, setShowLogin] = useState(false);
    return (
      <div style={{ fontFamily: "'DM Sans',sans-serif", maxWidth: 320, margin: "60px auto", textAlign: "center", padding: 20 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>{emoji}</div>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8, color: "#0f172a" }}>{titulo}</div>
        <div style={{ fontSize: 13, color: "#475569", marginBottom: 20 }}>{descripcion}</div>
        <button style={{ padding: "13px 0", width: "100%", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 800, fontSize: 14, background: "linear-gradient(135deg,#ea580c,#f97316)", color: "#fff" }}
          onClick={() => setShowLogin(true)}>🔐 Iniciar sesión</button>
        {showLogin && <ModalLogin titulo={titulo} onClose={() => setShowLogin(false)} />}
      </div>
    );
  }

  // Pantalla cuando estás logueado pero no tenés permiso
  function PantallaSinPermiso({ titulo }) {
    return (
      <div style={{ fontFamily: "'DM Sans',sans-serif", maxWidth: 320, margin: "60px auto", textAlign: "center", padding: 20 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🚫</div>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8, color: "#0f172a" }}>{titulo}</div>
        <div style={{ fontSize: 13, color: "#475569", marginBottom: 16 }}>Tu cuenta no tiene permiso para esta sección.</div>
        <div style={{ fontSize: 12, color: "#475569", marginBottom: 16 }}>Sesión: <b>{user?.email}</b></div>
        <button style={{ ...S.btnS, padding: "10px 16px" }} onClick={() => hacerLogout()}>Cerrar sesión</button>
      </div>
    );
  }

  // Pantalla bloqueada cuando el switch del ranking está apagado
  function PantallaBloqueada() {
    return (
      <div style={{ ...S.body, textAlign: "center", paddingTop: 50 }}>
        <div style={{ fontSize: 50, marginBottom: 16 }}>🚀</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 8, lineHeight: 1.4 }}>
          Cada venta cuenta.<br />Cada cliente importa.
        </div>
        <div style={{ fontSize: 14, color: "#475569", marginTop: 12 }}>
          Tus calificaciones se publicarán pronto. ✨
        </div>
        <div style={{ marginTop: 30, padding: "20px 16px", background: "linear-gradient(135deg,#fff7ed,#fff)", border: "2px solid #fed7aa", borderRadius: 14 }}>
          <div style={{ fontSize: 13, color: "#9a3412", fontWeight: 700 }}>💡 Mientras tanto…</div>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 6, lineHeight: 1.5 }}>
            Sigue dando lo mejor en cada momento. Cada reseña, cada minuto puntual y cada cliente bien atendido cuentan para el premio del trimestre.
          </div>
        </div>
      </div>
    );
  }

  // Confetti simple en CSS (no librería externa)
  function Confetti() {
    if (!confetti) return null;
    const piezas = Array.from({ length: 50 });
    return (
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 300, overflow: "hidden" }}>
        {piezas.map((_, i) => {
          const left = Math.random() * 100;
          const delay = Math.random() * 1.5;
          const dur = 2 + Math.random() * 2;
          const col = ["#fbbf24", "#ec4899", "#10b981", "#3b82f6", "#ea580c"][i % 5];
          return (
            <div key={i} style={{
              position: "absolute", top: -20, left: left + "%",
              width: 8, height: 14, background: col,
              animation: `caer ${dur}s linear ${delay}s 1`,
              borderRadius: 2, transform: "rotate(" + (Math.random() * 360) + "deg)",
            }} />
          );
        })}
        <style>{`@keyframes caer { to { transform: translateY(110vh) rotate(720deg); opacity: 0; } }`}</style>
      </div>
    );
  }

  // ============================================================
  // PANTALLA RANKING
  // ============================================================
  function PantallaRanking() {

    const indicadoresMes = getIndicadores(año, mes);
    const indicadorActivo = indicadoresMes.find(i => i.id === tabRank);

    const conDatos = ranking.filter(v => v.notaFinal !== null);

    let lista;
    if (tabRank === "general") {
      lista = ranking.filter(v => v.notaFinal !== null).map(v => ({ ...v, nm: v.notaFinal, rm: v.rankGen }));
    } else if (tabRank === "ventas") {
      lista = ranking.filter(v => v.meta > 0)
        .sort((a, b) => (b.real / Math.max(b.meta, 1)) - (a.real / Math.max(a.meta, 1)))
        .map((v, i) => ({ ...v, nm: v.notaVentas, rm: i + 1 }));
    } else {
      lista = ranking.filter(v => v.porInd?.[tabRank] !== null && v.porInd?.[tabRank] !== undefined)
        .sort((a, b) => ((b.porInd[tabRank] ?? -1) - (a.porInd[tabRank] ?? -1)))
        .map((v, i) => ({ ...v, nm: v.porInd[tabRank], rm: i + 1 }));
    }

    // Info contextual debajo del nombre por tab
    function infoDebajoNombre(v) {
      if (tabRank === "general") return `${v.dias} día${v.dias !== 1 ? "s" : ""} trabajado${v.dias !== 1 ? "s" : ""}`;
      if (tabRank === "ventas") return `$${(v.real / 1e6).toFixed(1)}M de $${(v.meta / 1e6).toFixed(1)}M (${v.pct}%)`;
      if (tabRank === "puntualidad") {
        const d = v.detalle?.puntualidad;
        if (d) {
          const partes = [`${d.diasTarde} día${d.diasTarde !== 1 ? "s" : ""} tarde`];
          if (d.diasGraves > 0) partes.push(`${d.diasGraves} grave${d.diasGraves !== 1 ? "s" : ""}`);
          partes.push(`${d.minutosAcum} min acum.`);
          return partes.join(" · ");
        }
        return `${v.dias} días trabajados`;
      }
      if (tabRank === "resenas") {
        const d = v.detalle?.resenas;
        if (d) return `${d.totalResenas} reseña${d.totalResenas !== 1 ? "s" : ""} totales`;
        return `${v.dias} días trabajados`;
      }
      // Indicadores con "días con novedad" — V2 (tienda/planilla/actitud) y V1 (celular/uniforme/tienda_e/planilla)
      const novTabs = ["tienda", "tienda_e", "planilla", "actitud", "celular", "uniforme"];
      if (novTabs.includes(tabRank)) {
        const d = v.detalle?.[tabRank];
        if (d && d.novedades !== undefined) return `${d.novedades} día${d.novedades !== 1 ? "s" : ""} con novedad`;
        return `${v.dias} días trabajados`;
      }
      // Fallback
      return `${v.dias} días trabajados`;
    }

    return (
      <div style={S.body}>
        <div style={S.tit}>🏆 Rankings</div>
        {mesEstaCerrado && (
          <div style={{ background: "linear-gradient(135deg,#fef3c7,#fff)", border: "2px solid #fde68a", borderRadius: 12, padding: "8px 14px", marginBottom: 12, fontSize: 12, fontWeight: 700, color: "#92400e", display: "flex", alignItems: "center", gap: 8 }}>
            🔒 MES CERRADO · Las notas están finalizadas
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
            .filter(m => añoViendo < añoActual || m <= mesActual)
            .map(m => (
              <button key={m} onClick={() => setMesViendo(m)}
                style={{ padding: "4px 10px", borderRadius: 16, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: mes === m ? "#ea580c" : "#f1f5f9", color: mes === m ? "#fff" : "#475569" }}>
                {new Date(año, m - 1).toLocaleDateString("es-CO", { month: "short" })}
              </button>
            ))}
        </div>
        <div style={S.sub}>
          {new Date(año, mes - 1).toLocaleDateString("es-CO", { month: "long", year: "numeric" })} · {conDatos.length} vendedoras con datos
        </div>

        {/* Tabs en grid 4x2 — sin scroll, todo visible */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5, marginBottom: 14, background: "#f1f5f9", borderRadius: 12, padding: 6 }}>
          <button style={S.tabActivo("general", tabRank, "#ea580c")} onClick={() => setTabRank("general")}>🏅 General</button>
          {indicadoresMes.map(ind =>
            <button key={ind.id} style={S.tabActivo(ind.id, tabRank, ind.color)} onClick={() => setTabRank(ind.id)}>
              {ind.emoji} {ind.label}
            </button>
          )}
          <button style={S.tabActivo("ventas", tabRank, COLOR_VENTAS)} onClick={() => setTabRank("ventas")}>💰 Ventas</button>
        </div>

        {/* Podio top 3 */}
        {tabRank === "general" && conDatos.length >= 3 && (
          <div style={{ ...S.card, background: "linear-gradient(135deg,#fff7ed,#fff)", border: "2px solid #fed7aa", marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#ea580c", marginBottom: 14, textTransform: "uppercase", letterSpacing: 1 }}>⚡ Top 3 del mes</div>
            <div style={{ display: "flex", justifyContent: "space-around", alignItems: "flex-end", gap: 8 }}>
              {[
                { v: conDatos[1], h: 60, e: "🥈", size: 70, color: "linear-gradient(135deg,#cbd5e1,#94a3b8)", glow: false },
                { v: conDatos[0], h: 95, e: "🥇", size: 95, color: "linear-gradient(135deg,#fbbf24,#f59e0b)", glow: true },
                { v: conDatos[2], h: 45, e: "🥉", size: 50, color: "linear-gradient(135deg,#fb923c,#c2410c)", glow: false },
              ].map((item) => {
                const { v, h, e, size, color, glow } = item;
                if (!v) return null;
                return (
                  <div key={v.id} style={{ textAlign: "center", flex: 1, cursor: "pointer" }} onClick={() => { setVerVid(v.id); setVerModoTrim(false); setPantalla("boletin"); }}>
                    <div style={{ fontSize: 11, fontWeight: 800, marginBottom: 4, color: COLOR_CIUDAD[v.ciudad] }}>{v.nombre.split(" ")[0]}</div>
                    <NotaBadge nota={v.notaFinal} size={14} />
                    <div style={{
                      height: h, marginTop: 5, borderRadius: "8px 8px 0 0",
                      background: color, display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: size * 0.45, position: "relative",
                      boxShadow: glow ? "0 0 24px rgba(251,191,36,0.55), 0 0 48px rgba(251,191,36,0.25)" : "none",
                      animation: glow ? "halo 2s ease-in-out infinite" : "none",
                    }}>{e}</div>
                  </div>
                );
              })}
            </div>
            <style>{`@keyframes halo { 0%, 100% { box-shadow: 0 0 24px rgba(251,191,36,0.55), 0 0 48px rgba(251,191,36,0.25); } 50% { box-shadow: 0 0 36px rgba(251,191,36,0.8), 0 0 72px rgba(251,191,36,0.4); } }`}</style>
          </div>
        )}

        {/* Lista del ranking */}
        {lista.length === 0 ? (
          <div style={{ ...S.card, textAlign: "center", padding: 36 }}>
            <div style={{ fontSize: 30, marginBottom: 8 }}>📋</div>
            <div style={{ fontWeight: 700, color: "#475569" }}>Sin registros este mes</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>Ve a ✏️ Ingresar para empezar</div>
          </div>
        ) : lista.map(v => {
          const esTopInd = v.rm === 1 && tabRank !== "general" && tabRank !== "ventas";
          return (
            <div key={v.id} style={{ ...S.card, display: "flex", alignItems: "center", gap: 11, cursor: "pointer", borderLeft: tabRank !== "general" && indicadorActivo ? `3px solid ${indicadorActivo.color}` : undefined }}
              onClick={() => { setVerVid(v.id); setVerModoTrim(false); setPantalla("boletin"); }}>
              <div style={{
                width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                background: v.rm === 1 ? "linear-gradient(135deg,#fbbf24,#f59e0b)" :
                  v.rm === 2 ? "linear-gradient(135deg,#cbd5e1,#94a3b8)" :
                  v.rm === 3 ? "linear-gradient(135deg,#fb923c,#c2410c)" : "#f1f5f9",
                display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 15,
                color: v.rm <= 3 ? "#fff" : "#475569",
                boxShadow: v.rm === 1 ? "0 0 12px rgba(251,191,36,0.4)" : "none",
              }}>#{v.rm}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{v.nombre}</div>
                  <BadgeCiudad ciudad={v.ciudad} />
                  {esTopInd && <span style={{ fontSize: 9, fontWeight: 800, color: "#854d0e", background: "#fef9c3", padding: "1px 6px", borderRadius: 8 }}>👑 Estrella</span>}
                </div>
                <div style={{ fontSize: 10, color: "#475569", marginTop: 1 }}>{infoDebajoNombre(v)}</div>
              </div>
              <NotaBadge nota={v.nm} size={18} />
            </div>
          );
        })}
      </div>
    );
  }

  // ============================================================
  // PANTALLA BOLETIN
  // ============================================================
  function PantallaBoletin() {
    const v = vendedoras.find(x => x.id === verVid);
    if (!v) return null;
    const qActual = trimestreActual();
    const mesesTrim = mesesTrimestre(qActual);
    const indicadoresMes = getIndicadores(año, mes);

    const datos = calcNotaMensual(registros, metas, v.id, año, mes, snapshots);
    const datosPrev = calcNotaMensual(registros, metas, v.id, mes === 1 ? año - 1 : año, mes === 1 ? 12 : mes - 1, snapshots);
    const trimDatos = calcTrimestre(registros, metas, v.id, año, qActual, snapshots);

    const rankV = ranking.find(x => x.id === v.id);
    const total = ranking.filter(x => x.notaFinal !== null).length;

    const esTrim = verModoTrim;
    const notaMostrar = esTrim ? trimDatos.notaTrim : datos.notaFinal;
    const diasMostrar = esTrim ? trimDatos.datosMes.reduce((s, d) => s + (d.dias || 0), 0) : datos.dias;
    const titulo = esTrim
      ? `Q${qActual} · ${mesesTrim.map(m => MES_NAMES[m - 1]).join("-")}`
      : new Date(año, mes - 1).toLocaleDateString("es-CO", { month: "long", year: "numeric" });

    // Frase motivacional contextual
    const fraseMotivacional = (() => {
      if (notaMostrar === null) return "📊 Aún no hay datos de este mes.";
      if (rankV?.rankGen === 1) return "🌟 ¡Estás en el #1! Lidera el equipo este mes.";
      if (rankV?.rankGen <= 3) return "🥇 ¡Estás en el podio! Sigue así, cada día cuenta.";
      if (notaMostrar >= 4.5) return "⚡ ¡Estás cerca del premio del trimestre! Mantén el ritmo.";
      if (notaMostrar >= 4.0 && notaMostrar < 4.5) return `🚀 ¡A solo ${(4.5 - notaMostrar).toFixed(2)} puntos del 4.50! Sigue empujando.`;
      if (notaMostrar >= 3.5) return "💪 Vas bien — un esfuerzo extra te lleva al siguiente nivel.";
      if (notaMostrar >= 2.5) return "✨ Cada día es una nueva oportunidad. ¡Tú puedes!";
      return "💖 Mañana es otra oportunidad. ¡Cuentas con nosotros!";
    })();

    // Comparativo con mes anterior
    const compMes = (datos.notaFinal !== null && datosPrev.notaFinal !== null)
      ? Math.round((datos.notaFinal - datosPrev.notaFinal) * 100) / 100
      : null;

    // Cálculo del detalle por indicador a mostrar
    const porIndMostrar = esTrim
      ? (() => {
        const inds = getIndicadores(año, mesesTrim[0]);
        const r = {};
        inds.forEach(ind => {
          const vals = trimDatos.datosMes.map(d => d.porInd?.[ind.id]).filter(n => n !== null && n !== undefined);
          r[ind.id] = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 100) / 100 : null;
        });
        return r;
      })()
      : (datos.porInd || {});

    return (
      <div style={S.body}>
        <button style={{ ...S.btnS, marginBottom: 14 }} onClick={() => { setPantalla(esTrim ? "trimestre" : "ranking"); setVerModoTrim(false); }}>← Volver</button>

        {datos.cerrado && !esTrim && (
          <div style={{ background: "linear-gradient(135deg,#fef3c7,#fff)", border: "2px solid #fde68a", borderRadius: 12, padding: "8px 14px", marginBottom: 12, fontSize: 12, fontWeight: 700, color: "#92400e" }}>
            🔒 MES CERRADO · Notas finalizadas
          </div>
        )}

        <div style={{ ...S.card, background: "linear-gradient(135deg,#fff7ed,#fff)", border: "2px solid #fed7aa", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: COLOR_CIUDAD[v.ciudad], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 900, color: "#fff", flexShrink: 0 }}>{v.nombre[0]}</div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 900 }}>{v.nombre}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                <BadgeCiudad ciudad={v.ciudad} full />
                <span style={{ fontSize: 11, color: "#475569" }}>{diasMostrar} días · {titulo}</span>
              </div>
            </div>
          </div>
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
              {esTrim ? "Nota trimestral acumulada" : "Nota general del mes"}
            </div>
            <NotaAnimada nota={notaMostrar} size={56} />
            <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>/5.00 · {titulo}</div>
            {compMes !== null && !esTrim && (
              <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: compMes >= 0 ? "#059669" : "#dc2626" }}>
                {compMes >= 0 ? "↑ +" : "↓ "}{Math.abs(compMes).toFixed(2)} vs mes anterior
              </div>
            )}
            {datos.bono > 0 && !esTrim && (
              <div style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: "#059669" }}>
                + Bono ventas: +{datos.bono.toFixed(1)}
              </div>
            )}
          </div>

          {!esTrim && rankV?.rankGen && (
            <div style={{ marginTop: 12, background: bgN(notaMostrar), borderRadius: 10, padding: "8px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 12, color: "#475569", fontWeight: 700 }}>Posición en el ranking</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: colorN(notaMostrar) }}>#{rankV.rankGen} <span style={{ fontSize: 12, color: "#475569", fontWeight: 400 }}>de {total}</span></div>
            </div>
          )}

          <div style={{ marginTop: 14, padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, fontSize: 12, color: "#92400e", fontWeight: 600 }}>
            {fraseMotivacional}
          </div>
        </div>

        {/* Ventas */}
        {!esTrim && (
          <div style={{ ...S.card, borderLeft: "4px solid " + (datos.notaVentas !== null ? colorN(datos.notaVentas) : "#e2e8f0") }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 13 }}>💰 Ventas <span style={{ fontSize: 10, color: "#475569", fontWeight: 400 }}>({esFormulaV2(año, mes) ? "50%" : "30%"})</span></div>
              <NotaBadge nota={datos.notaVentas} size={16} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase" }}>Meta</div>
                <div style={{ fontSize: 15, fontWeight: 800, marginTop: 2 }}>${Number(datos.meta || 0).toLocaleString("es-CO")}</div>
              </div>
              <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase" }}>Vendido</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: datos.pct >= 100 ? "#059669" : "#0f172a", marginTop: 2 }}>${Number(datos.real || 0).toLocaleString("es-CO")}</div>
              </div>
            </div>
            <div style={{ background: "#f1f5f9", borderRadius: 6, height: 8, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 6, width: Math.min(datos.pct, 100) + "%", background: datos.pct >= 100 ? "#059669" : datos.pct >= 70 ? "#d97706" : "#ea580c" }} />
            </div>
            <div style={{ fontSize: 11, color: "#475569", marginTop: 5 }}>{datos.pct}% {datos.pct >= 100 ? "✅" : ""}</div>
          </div>
        )}

        {/* Detalle por indicador */}
        <div style={{ fontSize: 12, fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, marginTop: 6 }}>Detalle por indicador</div>
        {indicadoresMes.map(ind => {
          const ni = porIndMostrar?.[ind.id] ?? null;
          const det = !esTrim ? datos.detalle?.[ind.id] : null;
          return (
            <div key={ind.id} style={{ ...S.card, display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderLeft: `3px solid ${ind.color}` }}>
              <div style={{ fontSize: 20, flexShrink: 0 }}>{ind.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{ind.label}</div>
                  <div style={{ fontSize: 10, color: "#475569" }}>Peso {ind.peso}%</div>
                </div>
                {det && (
                  <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>
                    {ind.id === "puntualidad" && det.minutosAcum != null && `⏱ ${det.minutosAcum} min · ${det.diasTarde} días tarde · ${det.diasGraves} graves`}
                    {ind.id === "resenas" && det.totalResenas != null && `⭐ ${det.totalResenas} reseñas totales`}
                    {ind.id === "tienda" && det.novedades != null && `🏪 ${det.novedades} días con novedad`}
                    {ind.id === "planilla" && det.novedades != null && `📋 ${det.novedades} días con novedad`}
                    {ind.id === "actitud" && det.novedades != null && `💪 ${det.novedades} días con novedad`}
                  </div>
                )}
                <div style={{ marginTop: 4, background: "#f1f5f9", borderRadius: 4, height: 5, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 4, width: (((ni ?? 0) / 5) * 100) + "%", background: ind.color }} />
                </div>
              </div>
              <NotaBadge nota={ni} size={16} />
            </div>
          );
        })}
      </div>
    );
  }

  // ============================================================
  // PANTALLA INGRESO DIARIO
  // ============================================================
  function PantallaIngreso() {
    if (!user) return <PantallaRequiereLogin emoji="✏️" titulo="Ingreso diario" descripcion="Inicia sesión para ingresar los datos del día." />;
    if (!puedeIngresoVentas(user)) return <PantallaSinPermiso titulo="Ingreso diario" />;

    const [yStr, mStr] = fecha.split("-");
    const yIng = parseInt(yStr), mIng = parseInt(mStr);
    const isV2 = esFormulaV2(yIng, mIng);
    const claveDelMes = claveMes(yIng, mIng);
    const cerrado = !!snapshots[claveDelMes];

    const trabajan = activas.filter(v => !filas[v.id]?.descanso);

    return (
      <div style={S.body}>
        <div style={S.tit}>✏️ Ingreso diario</div>
        {cerrado && (
          <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 10, padding: "8px 14px", marginBottom: 12, fontSize: 12, fontWeight: 700, color: "#991b1b" }}>
            ⚠️ Este mes ya está CERRADO. Editar requiere abrir el mes desde Admin.
          </div>
        )}
        <div style={{ ...S.card, marginBottom: 14 }}>
          <label style={S.lbl}>Fecha</label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={S.inp} />
          {guardado && !editando && (
            <div style={{ marginTop: 9, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: "#059669", fontWeight: 700 }}>✅ Día guardado</span>
              {esAdmin(user) ? (
                <button style={S.btnS} onClick={() => setEditando(true)}>Editar</button>
              ) : (
                <span style={{ fontSize: 10, color: "#94a3b8", fontStyle: "italic" }}>Solo admin puede editar</span>
              )}
            </div>
          )}
        </div>
        <div style={{ ...S.card, marginBottom: 13 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#ea580c", marginBottom: 9 }}>1️⃣ ¿Quién descansó?</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {activas.map(v => {
              const desc = filas[v.id]?.descanso;
              return (
                <button key={v.id} disabled={bloqueado || cerrado} onClick={() => setFila(v.id, "descanso", !desc)}
                  style={{ padding: "5px 11px", borderRadius: 20, border: "2px solid " + (desc ? "#fca5a5" : COLOR_CIUDAD[v.ciudad] + "40"), cursor: (bloqueado || cerrado) ? "default" : "pointer", fontSize: 12, fontWeight: 700, opacity: (bloqueado || cerrado) ? 0.6 : 1, background: desc ? "#fee2e2" : "#fff", color: desc ? "#dc2626" : COLOR_CIUDAD[v.ciudad], textDecoration: desc ? "line-through" : "none" }}>
                  {v.nombre.split(" ")[0]}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 7 }}>✅ {trabajan.length} trabajan · 😴 {activas.length - trabajan.length} descansan</div>
        </div>

        <div style={{ fontSize: 13, fontWeight: 800, color: "#ea580c", marginBottom: 9 }}>
          2️⃣ Novedades <span style={{ fontSize: 11, color: "#475569", fontWeight: 400 }}>(solo lo que NO fue perfecto)</span>
        </div>

        {trabajan.map(v => {
          const f = filas[v.id] || diaVacio(v.id, yIng, mIng);
          const nd = notaDia(f, yIng, mIng);
          const hayNov = isV2
            ? (f.minutos > 0 || f.resenas > 0 || f.tienda_orden === "mal" || f.tienda_uniforme === "mal" || f.tienda_deposito === "mal" || f.planilla === "mal" || f.actitud === "regular" || f.actitud === "mal")
            : (f.minutos > 0 || f.resenas > 0 || f.celular === "mal" || f.uniforme === "mal" || f.tienda_e === "mal" || f.planilla === "mal");
          return (
            <div key={v.id} style={{ ...S.card, borderLeft: "3px solid " + (hayNov ? "#ea580c" : COLOR_CIUDAD[v.ciudad]), marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>{v.nombre}</div>
                  <BadgeCiudad ciudad={v.ciudad} />
                </div>
                {nd !== null && <NotaBadge nota={nd} size={14} />}
              </div>

              {/* Minutos + Reseñas */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                {[["minutos", "⏰ Min tarde", 1, 150], ["resenas", "⭐ Reseñas", 1, 50]].map(([campo, etiq, paso, max]) => (
                  <div key={campo}>
                    <label style={S.lbl}>{etiq}</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <button disabled={bloqueado || cerrado || f[campo] <= 0} onClick={() => setFila(v.id, campo, Math.max(0, f[campo] - paso))}
                        style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid #e2e8f0", background: "#f1f5f9", fontSize: 18, fontWeight: 900, cursor: "pointer", flexShrink: 0, color: "#475569" }}>−</button>
                      <div style={{ flex: 1, textAlign: "center", fontWeight: 800, fontSize: 16, padding: "6px 0", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>{f[campo]}</div>
                      <button disabled={bloqueado || cerrado || f[campo] >= max} onClick={() => setFila(v.id, campo, Math.min(max, f[campo] + paso))}
                        style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid #e2e8f0", background: "#f1f5f9", fontSize: 18, fontWeight: 900, cursor: "pointer", flexShrink: 0, color: "#475569" }}>+</button>
                    </div>
                  </div>
                ))}
              </div>

              {isV2 ? (
                <>
                  {/* TIENDA - 3 checkboxes */}
                  <label style={S.lbl}>🏪 Tienda</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 8 }}>
                    {[["tienda_orden", "Orden"], ["tienda_uniforme", "Uniforme"], ["tienda_deposito", "Depósito"]].map(([campo, etiq]) => {
                      const ok = f[campo] === "bien" || f[campo] === undefined;
                      return (
                        <button key={campo} disabled={bloqueado || cerrado} onClick={() => setFila(v.id, campo, ok ? "mal" : "bien")}
                          style={{ padding: "8px 4px", borderRadius: 8, border: "2px solid " + (ok ? "#86efac" : "#fca5a5"), background: ok ? "#f0fdf4" : "#fee2e2", color: ok ? "#059669" : "#dc2626", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                          {ok ? "✅" : "❌"} {etiq}
                        </button>
                      );
                    })}
                  </div>

                  {/* PLANILLA */}
                  <label style={S.lbl}>📋 Planilla</label>
                  <div style={{ marginBottom: 8 }}>
                    <select disabled={bloqueado || cerrado} value={f.planilla || "bien"} onChange={e => setFila(v.id, "planilla", e.target.value)}
                      style={{ ...S.inp, color: f.planilla === "mal" ? "#dc2626" : "#059669", fontWeight: 700 }}>
                      <option value="bien">✅ Bien</option>
                      <option value="mal">❌ Mal</option>
                    </select>
                  </div>

                  {/* ACTITUD */}
                  <label style={S.lbl}>💪 Actitud</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                    {[["bien", "✅ Bien", "#86efac", "#f0fdf4", "#059669"], ["regular", "⚠️ Regular", "#fcd34d", "#fffbeb", "#d97706"], ["mal", "❌ Mal", "#fca5a5", "#fee2e2", "#dc2626"]].map(([val, lab, b, bg, c]) => {
                      const sel = (f.actitud || "bien") === val;
                      return (
                        <button key={val} disabled={bloqueado || cerrado} onClick={() => setFila(v.id, "actitud", val)}
                          style={{ padding: "8px 4px", borderRadius: 8, border: `2px solid ${sel ? b : "#e2e8f0"}`, background: sel ? bg : "#fff", color: sel ? c : "#94a3b8", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                          {lab}
                        </button>
                      );
                    })}
                  </div>
                  {(f.actitud === "regular" || f.actitud === "mal") && (() => {
                    const haynota = (f.actitud_nota || "").trim().length > 0;
                    const enError = erroresFalt.includes(v.id) && !haynota;
                    return (
                      <div data-actitud-vid={v.id}>
                        <input type="text"
                          placeholder={enError ? "⚠️ Obligatorio: ¿qué pasó?" : "¿Qué pasó? (obligatorio)"}
                          value={f.actitud_nota || ""}
                          onChange={e => {
                            setFila(v.id, "actitud_nota", e.target.value);
                            if (enError && e.target.value.trim().length > 0) {
                              setErroresFalt(prev => prev.filter(id => id !== v.id));
                            }
                          }}
                          disabled={bloqueado || cerrado}
                          style={{
                            ...S.inp, marginTop: 6, fontSize: 12,
                            border: enError ? "2px solid #dc2626" : "1px solid #e2e8f0",
                            background: enError ? "#fee2e2" : "#f8fafc",
                          }} />
                        {enError && (
                          <div style={{ fontSize: 10, color: "#dc2626", marginTop: 3, fontWeight: 700 }}>
                            ⚠️ Tienes que escribir qué pasó para guardar
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </>
              ) : (
                /* V1: 4 selects bien/mal */
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
                  {[["celular", "📱 Cel"], ["uniforme", "👔 Unif"], ["tienda_e", "🏪 Tda"], ["planilla", "📋 Pla"]].map(([campo, etiq]) => (
                    <div key={campo}>
                      <label style={S.lbl}>{etiq}</label>
                      <select disabled={bloqueado || cerrado} value={f[campo]} onChange={e => setFila(v.id, campo, e.target.value)}
                        style={{ ...S.inp, color: f[campo] === "mal" ? "#dc2626" : "#059669", fontWeight: 700, padding: "8px 4px" }}>
                        <option value="bien">✅</option>
                        <option value="mal">❌</option>
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {erroresFalt.length > 0 && (
          <div style={{ background: "#fee2e2", border: "2px solid #fca5a5", borderRadius: 10, padding: "10px 14px", marginTop: 6, fontSize: 13, fontWeight: 700, color: "#991b1b" }}>
            ⚠️ Faltan campos por llenar: {erroresFalt.length} vendedora{erroresFalt.length !== 1 ? "s" : ""} con actitud Regular/Mal sin describir qué pasó.
          </div>
        )}
        {!bloqueado && !cerrado && <button style={{ ...S.btnP, marginTop: 6 }} onClick={guardarDia}>💾 Guardar día</button>}
        {guardado && !editando && esAdmin(user) && (
          <div style={{ textAlign: "center", fontSize: 12, color: "#475569", marginTop: 10 }}>Toca "Editar" para corregir</div>
        )}
        {guardado && !editando && !esAdmin(user) && (
          <div style={{ textAlign: "center", fontSize: 12, color: "#475569", marginTop: 10 }}>Para corregir el día, contacta al admin</div>
        )}
      </div>
    );
  }

  // ============================================================
  // PANTALLA VENTAS
  // ============================================================
  function PantallaVentas() {
    const [mesVentasV, setMesVentasV] = useState(mesActual);
    const [añoVentasV] = useState(añoActual);
    const claveVentas = claveMes(añoVentasV, mesVentasV);
    const cerrado = !!snapshots[claveVentas];
    const [metaInput, setMetaInput] = useState("");
    const [vendsInput, setVendsInput] = useState({});
    const [ok, setOk] = useState(false);

    useEffect(() => {
      const mi = metas[claveVentas] || { meta: 0, vendidas: {} };
      setMetaInput(String(mi.meta || ""));
      const i = {};
      activas.forEach(v => { i[v.id] = String(mi.vendidas?.[v.id] || ""); });
      setVendsInput(i);
    }, [mesVentasV]);

    function guardar() {
      const vendidas = {};
      activas.forEach(v => { if (vendsInput[v.id]) vendidas[v.id] = Number(vendsInput[v.id]); });
      saveMetas({ ...metas, [claveVentas]: { meta: Number(metaInput) || 0, vendidas } });
      setOk(true);
      setTimeout(() => setOk(false), 2000);
    }

    if (!user) return <PantallaRequiereLogin emoji="💰" titulo="Ventas" descripcion="Inicia sesión para registrar las ventas." />;
    if (!puedeIngresoVentas(user)) return <PantallaSinPermiso titulo="Ventas" />;
    const mesNombreVentas = new Date(añoVentasV, mesVentasV - 1).toLocaleDateString("es-CO", { month: "long", year: "numeric" });

    return (
      <div style={S.body}>
        <div style={S.tit}>💰 Ventas</div>
        {cerrado && (
          <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 10, padding: "8px 14px", marginBottom: 12, fontSize: 12, fontWeight: 700, color: "#991b1b" }}>
            ⚠️ Este mes ya está CERRADO. Editar requiere abrir el mes desde Admin.
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter(m => m <= mesActual).map(m => (
            <button key={m} onClick={() => setMesVentasV(m)}
              style={{ padding: "4px 10px", borderRadius: 16, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: mesVentasV === m ? "#ea580c" : "#f1f5f9", color: mesVentasV === m ? "#fff" : "#475569" }}>
              {new Date(añoVentasV, m - 1).toLocaleDateString("es-CO", { month: "short" })}
            </button>
          ))}
        </div>
        <div style={S.sub}>{mesNombreVentas}</div>
        <div style={S.card}>
          <label style={S.lbl}>Meta del mes ($)</label>
          <input type="number" disabled={cerrado} value={metaInput} onChange={e => setMetaInput(e.target.value)} placeholder="Ej: 5000000" style={S.inp} />
        </div>
        {activas.map(v => {
          const real = Number(vendsInput[v.id] || 0);
          const meta = Number(metaInput || 0);
          const pct = meta > 0 ? Math.round((real / meta) * 100) : 0;
          return (
            <div key={v.id} style={{ ...S.card, padding: "10px 14px", marginBottom: 7 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{v.nombre}</div>
                  <BadgeCiudad ciudad={v.ciudad} />
                </div>
                <div style={{ fontSize: 11, fontWeight: 800, color: pct >= 100 ? "#059669" : pct >= 70 ? "#d97706" : "#475569" }}>{pct}%</div>
              </div>
              <input type="number" disabled={cerrado} value={vendsInput[v.id] || ""} onChange={e => setVendsInput(i => ({ ...i, [v.id]: e.target.value }))} placeholder="$ vendido" style={S.inp} />
              {meta > 0 && real > 0 && (
                <div style={{ marginTop: 6, background: "#f1f5f9", borderRadius: 4, height: 5, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 4, width: Math.min(pct, 100) + "%", background: pct >= 100 ? "#059669" : pct >= 70 ? "#d97706" : "#ea580c" }} />
                </div>
              )}
            </div>
          );
        })}
        <button disabled={cerrado} style={{ ...S.btnP, marginTop: 6, opacity: cerrado ? 0.5 : 1 }} onClick={guardar}>{ok ? "✅ Guardado" : "💾 Guardar ventas"}</button>
      </div>
    );
  }

  // ============================================================
  // PANTALLA TRIMESTRE
  // ============================================================
  function PantallaTrimestre() {
    const qActual = trimestreActual();
    const [q, setQ] = useState(qActual);
    const meses = mesesTrimestre(q);
    const inicioTrim = año + "-" + String((q - 1) * 3 + 1).padStart(2, "0") + "-01";
    const elegibles = activas.filter(v => !v.fechaIngreso || v.fechaIngreso <= inicioTrim);
    const soloMensuales = activas.filter(v => v.fechaIngreso && v.fechaIngreso > inicioTrim);

    const datos = elegibles.map(v => {
      const t = calcTrimestre(registros, metas, v.id, año, q, snapshots);
      const realTrim = meses.reduce((s, m) => s + (metas[claveMes(año, m)]?.vendidas?.[v.id] || 0), 0);
      return { ...v, ...t, realTrim };
    });

    const conNota = datos.filter(v => v.notaTrim !== null);
    const rankingTrim = [...conNota].sort((a, b) => (b.notaTrim - a.notaTrim) || ((b.realTrim ?? 0) - (a.realTrim ?? 0))).map((v, i) => ({ ...v, rt: i + 1 }));
    const sinDatos = datos.filter(v => v.notaTrim === null);

    const premios = calcPremios(rankingTrim);
    const idsConBono = new Set(premios.conBono.map(v => v.id));

    return (
      <div style={S.body}>
        <div style={S.tit}>📈 Trimestre</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {[1, 2, 3, 4].filter(n => n <= qActual).map(n => (
            <button key={n} onClick={() => setQ(n)}
              style={{ padding: "4px 14px", borderRadius: 16, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: q === n ? "#ea580c" : "#f1f5f9", color: q === n ? "#fff" : "#475569" }}>Q{n}</button>
          ))}
        </div>
        <div style={S.sub}>{meses.map(m => MES_NAMES[m - 1]).join(" · ")} · Pesos: 20% · 30% · 50%</div>

        {/* Bloque de premios — agrupado por vendedora */}
        {rankingTrim.length > 0 && (() => {
          // Construir lista de ganadoras agrupadas
          const ganadoras = [];
          const addRazon = (v, razon, monto, emoji) => {
            let g = ganadoras.find(x => x.id === v.id);
            if (!g) {
              g = { ...v, razones: [], total: 0 };
              ganadoras.push(g);
            }
            g.razones.push({ razon, monto, emoji });
            g.total += monto;
          };
          if (premios.mejorMED) addRazon(premios.mejorMED, "Mejor de Medellín", 1000000, "🏆");
          if (premios.mejorBOG) addRazon(premios.mejorBOG, "Mejor de Bogotá", 1000000, "🏆");
          premios.conBono.forEach(v => {
            if (v.id !== premios.mejorMED?.id && v.id !== premios.mejorBOG?.id) {
              addRazon(v, "Nota trimestral ≥4.50", 1000000, "⭐");
            }
          });
          if (premios.extraNacional) addRazon(premios.extraNacional, "La mejor de las mejores", 1000000, "🌟");

          // Ordenar por total descendente
          ganadoras.sort((a, b) => b.total - a.total || (b.notaTrim - a.notaTrim));
          const totalGeneral = ganadoras.reduce((s, g) => s + g.total, 0);

          if (ganadoras.length === 0) return null;

          return (
            <div style={{ ...S.card, background: "linear-gradient(135deg,#fff7ed,#fff)", border: "2px solid #fed7aa", marginBottom: 16 }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#ea580c", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                  🏆 Premios {rankingTrim.every(v => v.completo) ? "(final)" : "(tiempo real)"}
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#9a3412" }}>
                  Total a entregar: <span style={{ fontSize: 16 }}>${totalGeneral.toLocaleString("es-CO")}</span>
                </div>
              </div>

              {ganadoras.map((g, idx) => {
                const esTop = idx === 0 && g.total >= 2000000;
                const fondoCard = esTop
                  ? "linear-gradient(135deg,#fef9c3,#fff)"
                  : g.total >= 2000000
                    ? "linear-gradient(135deg,#fef9c3,#fff)"
                    : g.ciudad === "MED"
                      ? "linear-gradient(135deg,#ecfdf5,#fff)"
                      : "linear-gradient(135deg,#fffbeb,#fff)";
                const bordeCard = esTop ? "2px solid #fde047" : g.ciudad === "MED" ? "1px solid #6ee7b7" : "1px solid #fde68a";

                return (
                  <div key={g.id} style={{
                    background: fondoCard, border: bordeCard, borderRadius: 12, padding: "12px 14px", marginBottom: 9,
                    boxShadow: esTop ? "0 0 16px rgba(251,191,36,0.4)" : "0 1px 4px rgba(0,0,0,0.05)",
                  }}>
                    {/* Encabezado: vendedora + total */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: "50%", background: COLOR_CIUDAD[g.ciudad],
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 16, fontWeight: 900, color: "#fff", flexShrink: 0,
                      }}>{g.nombre[0]}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 900, fontSize: 14 }}>{g.nombre}</div>
                          <BadgeCiudad ciudad={g.ciudad} />
                        </div>
                        <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>Nota trimestral: <span style={{ color: colorN(g.notaTrim), fontWeight: 700 }}>{fmtN(g.notaTrim)}</span></div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: "#475569", textTransform: "uppercase" }}>Gana</div>
                        <div style={{ fontSize: 17, fontWeight: 900, color: esTop ? "#854d0e" : "#9a3412", lineHeight: 1 }}>
                          ${g.total.toLocaleString("es-CO")}
                        </div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: "#475569", marginTop: 2 }}>
                          {g.total === 1000000 && "Un millón de pesos"}
                          {g.total === 2000000 && "Dos millones de pesos"}
                          {g.total > 2000000 && `${Math.round(g.total / 1e6)} millones de pesos`}
                        </div>
                      </div>
                    </div>

                    {/* Razones */}
                    <div style={{ borderTop: "1px dashed " + (esTop ? "#fde047" : "#e2e8f0"), paddingTop: 8 }}>
                      {g.razones.map((r, i) => (
                        <div key={i} style={{ fontSize: 11, color: "#475569", padding: "2px 0", display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ flexShrink: 0 }}>{r.emoji}</span>
                          <span style={{ flex: 1 }}>{r.razon}</span>
                          <span style={{ fontWeight: 800, color: "#0f172a" }}>${r.monto.toLocaleString("es-CO")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {rankingTrim.length > 0 && (
          <>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Ranking trimestral</div>
            {rankingTrim.map(v => {
              const esMejorMED = premios.mejorMED?.id === v.id;
              const esMejorBOG = premios.mejorBOG?.id === v.id;
              const esExtra = premios.extraNacional?.id === v.id;
              const conBono = idsConBono.has(v.id);
              const ganaAlgo = esMejorMED || esMejorBOG || conBono;
              const colorBorde = esMejorMED ? "#10b981" : esMejorBOG ? "#f59e0b" : conBono ? "#ea580c" : "#cbd5e1";
              const fondoEspecial = ganaAlgo
                ? (esMejorMED ? "linear-gradient(90deg,#ecfdf5,#fff 40%)" :
                   esMejorBOG ? "linear-gradient(90deg,#fffbeb,#fff 40%)" :
                   "linear-gradient(90deg,#ffedd5,#fff 40%)")
                : "#fff";
              return (
                <div key={v.id} style={{
                  ...S.card,
                  display: "flex", alignItems: "center", gap: 11, cursor: "pointer",
                  borderLeft: `5px solid ${colorBorde}`,
                  background: fondoEspecial,
                  boxShadow: ganaAlgo ? `0 2px 8px ${colorBorde}30` : "0 1px 4px rgba(0,0,0,0.04)",
                }}
                  onClick={() => { setVerVid(v.id); setVerModoTrim(true); setPantalla("boletin"); }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                    background: v.rt === 1 ? "linear-gradient(135deg,#fbbf24,#f59e0b)" :
                      v.rt === 2 ? "linear-gradient(135deg,#cbd5e1,#94a3b8)" :
                      v.rt === 3 ? "linear-gradient(135deg,#fb923c,#c2410c)" : "#f1f5f9",
                    display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 15, color: v.rt <= 3 ? "#fff" : "#475569",
                  }}>#{v.rt}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{v.nombre}</div>
                      <BadgeCiudad ciudad={v.ciudad} />
                      {esMejorMED && <span style={{ fontSize: 9, fontWeight: 800, color: "#065f46", background: "#d1fae5", padding: "1px 6px", borderRadius: 8 }}>🏆 MED $1M</span>}
                      {esMejorBOG && <span style={{ fontSize: 9, fontWeight: 800, color: "#854d0e", background: "#fef3c7", padding: "1px 6px", borderRadius: 8 }}>🏆 BOG $1M</span>}
                      {conBono && !esMejorMED && !esMejorBOG && <span style={{ fontSize: 9, fontWeight: 800, color: "#9a3412", background: "#ffedd5", padding: "1px 6px", borderRadius: 8 }}>⭐ ≥4.5 $1M</span>}
                      {esExtra && <span style={{ fontSize: 9, fontWeight: 800, color: "#854d0e", background: "#fef9c3", padding: "1px 6px", borderRadius: 8 }}>🌟 +$1M</span>}
                      {!v.completo && <span style={{ fontSize: 9, fontWeight: 800, color: "#94a3b8", background: "#f1f5f9", padding: "1px 6px", borderRadius: 8 }}>{v.mesesConDatos}/3 meses</span>}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                      {meses.map((m, i) => (
                        <div key={m} style={{ fontSize: 10, color: "#475569", background: "#f8fafc", borderRadius: 6, padding: "2px 6px" }}>
                          {MES_NAMES[m - 1]}: <span style={{ color: v.notasMes[i] !== null ? colorN(v.notasMes[i]) : "#94a3b8", fontWeight: 700 }}>{v.notasMes[i] !== null ? fmtN(v.notasMes[i]) : "—"}</span>
                          <span style={{ color: "#cbd5e1" }}> ×{PESOS_TRIMESTRE[i] * 100}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <NotaBadge nota={v.notaTrim} size={18} />
                </div>
              );
            })}
          </>
        )}

        {sinDatos.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Sin datos aún</div>
            {sinDatos.map(v => (
              <div key={v.id} style={{ ...S.card, padding: "10px 14px", opacity: 0.5, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#94a3b8" }}>{v.nombre}</div>
                <BadgeCiudad ciudad={v.ciudad} />
              </div>
            ))}
          </div>
        )}

        {soloMensuales.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Solo ranking mensual</div>
            {soloMensuales.map(v => (
              <div key={v.id} style={{ ...S.card, padding: "10px 14px", borderLeft: "3px solid #e2e8f0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#475569" }}>{v.nombre}</div>
                  <BadgeCiudad ciudad={v.ciudad} />
                </div>
                <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>Ingresó {v.fechaIngreso} · No participa en el premio trimestral</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ============================================================
  // PANTALLA ADMIN
  // ============================================================
  function PantallaAdmin() {
    const [nuevoNombre, setNuevoNombre] = useState("");
    const [nuevaCiudad, setNuevaCiudad] = useState("BOG");
    const [confirmarBaja, setConfirmarBaja] = useState(null);
    const [confirmarEliminar, setConfirmarEliminar] = useState(null);
    const [msg, setMsg] = useState("");
    const [modalTexto, setModalTexto] = useState(null);
    const [importTexto, setImportTexto] = useState("");
    const [confirmarCierre, setConfirmarCierre] = useState(null);
    const [mostrarAbrir, setMostrarAbrir] = useState(false);
    const [confirmarAbrir, setConfirmarAbrir] = useState(null);
    const [mostrarAvanzado, setMostrarAvanzado] = useState(false);
    // Mes anterior al actual (caso típico de cierre)
    const _mesAntAño = mesActual === 1 ? añoActual - 1 : añoActual;
    const _mesAntMes = mesActual === 1 ? 12 : mesActual - 1;
    const [añoSel, setAñoSel] = useState(_mesAntAño);
    const [mesSel, setMesSel] = useState(_mesAntMes);

    function flash(txt) { setMsg(txt); setTimeout(() => setMsg(""), 2500); }

    function agregar() {
      if (!nuevoNombre.trim()) return;
      const nuevas = [...vendedoras, { id: Date.now(), nombre: nuevoNombre.trim(), ciudad: nuevaCiudad, activa: true, fechaIngreso: hoyStr() }];
      saveVends(nuevas); setNuevoNombre(""); flash("✅ " + nuevoNombre.trim() + " agregada");
    }
    function cambiarCiudad(id) { saveVends(vendedoras.map(v => v.id === id ? { ...v, ciudad: v.ciudad === "BOG" ? "MED" : "BOG" } : v)); flash("✅ Ciudad actualizada"); }
    function darDeBaja(id) { saveVends(vendedoras.map(v => v.id === id ? { ...v, activa: false } : v)); setConfirmarBaja(null); flash("⬇️ Dada de baja"); }
    function reactivar(id) { saveVends(vendedoras.map(v => v.id === id ? { ...v, activa: true } : v)); flash("✅ Reactivada"); }
    function eliminarDefinitivo(id) {
      saveVends(vendedoras.filter(v => v.id !== id));
      const nr = {}; Object.entries(registros).forEach(([k, v]) => { if (!k.startsWith(id + "_")) nr[k] = v; });
      saveRegs(nr); setConfirmarEliminar(null); flash("🗑️ Eliminada");
    }
    function exportarJSON() {
      const data = { vendedoras, registros, metas, snapshots, config, fecha: new Date().toISOString() };
      setModalTexto({ titulo: "📋 Backup JSON", texto: JSON.stringify(data, null, 2), modo: "json" });
    }
    function ejecutarImport() {
      try {
        const data = JSON.parse(importTexto);
        if (data.vendedoras) saveVends(data.vendedoras);
        if (data.registros) saveRegs(data.registros);
        if (data.metas) saveMetas(data.metas);
        if (data.snapshots) saveSnapshots(data.snapshots);
        if (data.config) saveConfig(data.config);
        setModalTexto(null); setImportTexto(""); flash("✅ Backup restaurado");
      } catch { flash("❌ JSON inválido"); }
    }

    function toggleRanking() {
      const nuevoEstado = !config.rankingVisible;
      const nuevoConfig = { ...config, rankingVisible: nuevoEstado };
      // Si se prende, generar un nuevo ID de publicación para que cada vendedora vea confetti UNA VEZ
      if (nuevoEstado) {
        nuevoConfig.publicacionId = Date.now();
      }
      saveConfig(nuevoConfig);
      flash(nuevoEstado ? "🔓 Ranking VISIBLE para vendedoras" : "🔒 Ranking OCULTO para vendedoras");
    }

    function intentarCerrarMes(añoCierre, mesCierre) {
      const claveCierre = claveMes(añoCierre, mesCierre);
      if (snapshots[claveCierre]) {
        flash("⚠️ Este mes ya está cerrado");
        return;
      }
      setConfirmarCierre({ año: añoCierre, mes: mesCierre, faltantes: detectarFaltantes(añoCierre, mesCierre) });
    }

    function detectarFaltantes(añoC, mesC) {
      const faltantes = [];
      const ultimoDia = new Date(añoC, mesC, 0).getDate();
      const act = vendedoras.filter(v => v.activa !== false);
      for (let d = 1; d <= ultimoDia; d++) {
        const f = añoC + "-" + String(mesC).padStart(2, "0") + "-" + String(d).padStart(2, "0");
        const sinReg = act.filter(v => !registros[v.id + "_" + f]);
        if (sinReg.length > 0) faltantes.push(`Día ${d}: ${sinReg.length} vendedora(s) sin registrar`);
      }
      const meta = metas[claveMes(añoC, mesC)];
      if (!meta || !meta.meta) faltantes.push("Meta del mes no cargada");
      else {
        const sinVent = act.filter(v => meta.vendidas?.[v.id] === undefined);
        if (sinVent.length > 0) faltantes.push(`${sinVent.length} vendedora(s) sin ventas cargadas`);
      }
      return faltantes;
    }

    function ejecutarCierre(añoC, mesC) {
      const claveCierre = claveMes(añoC, mesC);
      const snap = {
        año: añoC, mes: mesC,
        version: esFormulaV2(añoC, mesC) ? "v2" : "v1",
        indicadores: getIndicadores(añoC, mesC),
        fechaCierre: new Date().toISOString(),
        vendedoras: {},
      };
      vendedoras.forEach(v => {
        const r = calcNotaMensual(registros, metas, v.id, añoC, mesC, null);
        snap.vendedoras[v.id] = {
          notaBase: r.notaBase,
          notaVentas: r.notaVentas,
          notaFinal: r.notaFinal,
          bono: r.bono || 0,
          dias: r.dias,
          porInd: r.porInd,
          detalle: r.detalle,
          real: r.real,
          meta: r.meta,
          pct: r.pct,
        };
      });
      saveSnapshots({ ...snapshots, [claveCierre]: snap });
      setConfirmarCierre(null);
      flash(`🔒 ${MES_NAMES[mesC - 1]} ${añoC} cerrado`);
    }

    function ejecutarApertura(añoC, mesC) {
      const claveCierre = claveMes(añoC, mesC);
      const nuevos = { ...snapshots };
      delete nuevos[claveCierre];
      saveSnapshots(nuevos);
      setConfirmarAbrir(null);
      flash(`🔓 ${MES_NAMES[mesC - 1]} ${añoC} abierto`);
    }

    if (!user) return <PantallaRequiereLogin emoji="⚙️" titulo="Administrador" descripcion="Inicia sesión con tu cuenta de admin." />;
    if (!puedeAdmin(user)) return <PantallaSinPermiso titulo="Administrador" />;

    const act = vendedoras.filter(v => v.activa !== false);
    const inact = vendedoras.filter(v => v.activa === false);

    // Mes anterior al actual (caso típico de cierre)
    const mesAntAño = _mesAntAño;
    const mesAntMes = _mesAntMes;
    const mesAntCerrado = !!snapshots[claveMes(mesAntAño, mesAntMes)];

    // Lista de meses cerrados (para mostrar)
    const cerrados = Object.keys(snapshots).map(k => {
      const [yStr, mStr] = k.split("_");
      return { año: parseInt(yStr), mes: parseInt(mStr) };
    }).sort((a, b) => (a.año - b.año) || (a.mes - b.mes));

    // Validez del selector: NO cerrar mes futuro o el mes en curso
    const mesSelValido = (añoSel < añoActual) || (añoSel === añoActual && mesSel < mesActual);
    const mesSelYaCerrado = !!snapshots[claveMes(añoSel, mesSel)];

    return (
      <div style={S.body}>
        <div style={S.tit}>⚙️ Administrador</div>
        {msg && <div style={{ background: "#d1fae5", border: "1px solid #6ee7b7", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 13, fontWeight: 700, color: "#065f46" }}>{msg}</div>}

        {/* SWITCH MAESTRO RANKING */}
        <div style={{ ...S.card, padding: "14px", marginBottom: 14, background: config.rankingVisible ? "linear-gradient(135deg,#ecfdf5,#fff)" : "linear-gradient(135deg,#fef2f2,#fff)", border: "2px solid " + (config.rankingVisible ? "#86efac" : "#fca5a5") }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: config.rankingVisible ? "#065f46" : "#991b1b" }}>
                {config.rankingVisible ? "🔓 Ranking VISIBLE" : "🔒 Ranking OCULTO"}
              </div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
                {config.rankingVisible ? "Las vendedoras pueden ver sus notas" : "Las vendedoras NO ven sus notas"}
              </div>
            </div>
            <button onClick={toggleRanking}
              style={{ width: 60, height: 32, borderRadius: 16, border: "none", cursor: "pointer", background: config.rankingVisible ? "#10b981" : "#cbd5e1", position: "relative", padding: 0, transition: "background 0.3s" }}>
              <div style={{ position: "absolute", top: 3, left: config.rankingVisible ? 31 : 3, width: 26, height: 26, borderRadius: "50%", background: "#fff", boxShadow: "0 2px 4px rgba(0,0,0,0.2)", transition: "left 0.3s" }} />
            </button>
          </div>
        </div>

        {/* CIERRE DE MES */}
        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#ea580c", marginBottom: 10 }}>📅 Cerrar mes</div>
          <div style={{ fontSize: 11, color: "#475569", marginBottom: 10 }}>
            Cerrar un mes deja sus notas FIJAS para siempre. Útil al terminar un mes y haber cargado todos los datos.
          </div>

          {/* Botón principal: cerrar mes anterior */}
          {!mesAntCerrado ? (
            <button onClick={() => intentarCerrarMes(mesAntAño, mesAntMes)}
              style={{ ...S.btnP, marginBottom: 8, background: "linear-gradient(135deg,#dc2626,#b91c1c)", padding: "12px 0" }}>
              🔒 Cerrar {MES_NAMES[mesAntMes - 1]} {mesAntAño}
            </button>
          ) : (
            <div style={{ padding: "10px 14px", background: "#fef3c7", borderRadius: 8, marginBottom: 8, fontSize: 12, fontWeight: 700, color: "#92400e", textAlign: "center" }}>
              ✅ {MES_NAMES[mesAntMes - 1]} {mesAntAño} ya está cerrado
            </div>
          )}

          {/* Toggle para opciones avanzadas */}
          <button onClick={() => setMostrarAvanzado(!mostrarAvanzado)} style={{ background: "none", border: "none", color: "#475569", textDecoration: "underline", cursor: "pointer", fontSize: 11, marginTop: 4 }}>
            {mostrarAvanzado ? "Ocultar opciones avanzadas" : "Cerrar otro mes / opciones avanzadas"}
          </button>

          {mostrarAvanzado && (
            <div style={{ marginTop: 10, padding: 10, background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 8 }}>Cerrar un mes específico:</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                <div>
                  <label style={S.lbl}>Año</label>
                  <select value={añoSel} onChange={e => setAñoSel(parseInt(e.target.value))} style={S.inp}>
                    {[añoActual - 1, añoActual, añoActual + 1].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.lbl}>Mes</label>
                  <select value={mesSel} onChange={e => setMesSel(parseInt(e.target.value))} style={S.inp}>
                    {MES_NAMES.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
                  </select>
                </div>
              </div>
              {!mesSelValido && (
                <div style={{ fontSize: 11, color: "#dc2626", marginBottom: 6 }}>⚠️ No puedes cerrar el mes en curso ni un mes futuro.</div>
              )}
              {mesSelYaCerrado && (
                <div style={{ fontSize: 11, color: "#92400e", marginBottom: 6 }}>✅ Ese mes ya está cerrado.</div>
              )}
              <button disabled={!mesSelValido || mesSelYaCerrado} onClick={() => intentarCerrarMes(añoSel, mesSel)}
                style={{ ...S.btnP, padding: "8px 0", opacity: (!mesSelValido || mesSelYaCerrado) ? 0.4 : 1, marginTop: 4 }}>
                🔒 Cerrar {MES_NAMES[mesSel - 1]} {añoSel}
              </button>

              {cerrados.length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", marginTop: 14, marginBottom: 6 }}>Meses cerrados ({cerrados.length}):</div>
                  <div style={{ maxHeight: 120, overflowY: "auto" }}>
                    {cerrados.map(c => (
                      <div key={`${c.año}-${c.mes}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 8px", background: "#fef3c7", borderRadius: 6, marginBottom: 3, fontSize: 11 }}>
                        <span style={{ fontWeight: 700, color: "#92400e" }}>🔒 {MES_NAMES[c.mes - 1]} {c.año}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setMostrarAbrir(!mostrarAbrir)} style={{ background: "none", border: "none", color: "#94a3b8", textDecoration: "underline", cursor: "pointer", fontSize: 10, marginTop: 8 }}>
                    {mostrarAbrir ? "Ocultar abrir mes" : "¿Necesitas abrir un mes? (emergencia)"}
                  </button>
                  {mostrarAbrir && (
                    <div style={{ marginTop: 8, padding: 8, background: "#fee2e2", border: "1px dashed #fca5a5", borderRadius: 6 }}>
                      <div style={{ fontSize: 10, color: "#991b1b", marginBottom: 6 }}>⚠️ Abrir descongela el mes. SOLO emergencias.</div>
                      {cerrados.map(c => (
                        <button key={`abrir-${c.año}-${c.mes}`} onClick={() => setConfirmarAbrir({ año: c.año, mes: c.mes })}
                          style={{ display: "block", width: "100%", marginBottom: 3, padding: "5px", borderRadius: 6, border: "1px solid #fca5a5", background: "#fff", color: "#991b1b", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                          🔓 Abrir {MES_NAMES[c.mes - 1]} {c.año}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {modalTexto && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ background: "#fff", borderRadius: 16, padding: 20, width: "100%", maxWidth: 540, maxHeight: "85vh", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: "#ea580c" }}>{modalTexto.titulo}</div>
              {modalTexto.modo !== "importar" ? (
                <>
                  <textarea readOnly value={modalTexto.texto} onClick={e => e.target.select()}
                    style={{ flex: 1, minHeight: 260, maxHeight: 380, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, fontSize: 11, fontFamily: "monospace", resize: "none", color: "#0f172a" }} />
                  <div style={{ fontSize: 11, color: "#475569" }}>👆 Toca el texto y Cmd+A para seleccionar, luego Cmd+C.</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={{ flex: 1, ...S.btnP }} onClick={() => { const ta = document.querySelector("textarea"); if (ta) { ta.select(); document.execCommand("copy"); } flash("✅ Copiado"); setModalTexto(null); }}>📋 Copiar todo</button>
                    <button style={{ ...S.btnS, padding: "12px 16px" }} onClick={() => setModalTexto(null)}>Cerrar</button>
                  </div>
                </>
              ) : (
                <>
                  <textarea value={importTexto} onChange={e => setImportTexto(e.target.value)} placeholder='{"vendedoras":[...]}'
                    style={{ flex: 1, minHeight: 260, maxHeight: 380, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, fontSize: 16, fontFamily: "monospace", resize: "none", color: "#0f172a" }} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={{ flex: 1, ...S.btnP }} onClick={ejecutarImport}>⬆️ Restaurar</button>
                    <button style={{ ...S.btnS, padding: "12px 16px" }} onClick={() => { setModalTexto(null); setImportTexto(""); }}>Cancelar</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Modal de confirmación de cierre */}
        {confirmarCierre && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ background: "#fff", borderRadius: 16, padding: 20, width: "100%", maxWidth: 420 }}>
              <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10, color: "#dc2626" }}>🔒 Cerrar {MES_NAMES[confirmarCierre.mes - 1]} {confirmarCierre.año}</div>
              <div style={{ fontSize: 12, color: "#475569", marginBottom: 12 }}>Esta acción es <b>IRREVERSIBLE</b>. Las notas quedarán fijas para siempre.</div>
              {confirmarCierre.faltantes.length > 0 && (
                <div style={{ background: "#fef3c7", border: "1px solid #fde68a", padding: 10, borderRadius: 8, marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#92400e", marginBottom: 4 }}>⚠️ Faltan datos:</div>
                  <ul style={{ margin: 0, padding: "0 0 0 16px", fontSize: 11, color: "#92400e" }}>
                    {confirmarCierre.faltantes.slice(0, 8).map((f, i) => <li key={i}>{f}</li>)}
                    {confirmarCierre.faltantes.length > 8 && <li>... y {confirmarCierre.faltantes.length - 8} más</li>}
                  </ul>
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ flex: 1, ...S.btnS }} onClick={() => setConfirmarCierre(null)}>Cancelar</button>
                <button style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 800, fontSize: 13, background: "#dc2626", color: "#fff" }}
                  onClick={() => ejecutarCierre(confirmarCierre.año, confirmarCierre.mes)}>
                  {confirmarCierre.faltantes.length > 0 ? "🔒 Forzar cierre" : "🔒 Cerrar mes"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal abrir mes */}
        {confirmarAbrir && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ background: "#fff", borderRadius: 16, padding: 20, width: "100%", maxWidth: 420 }}>
              <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10, color: "#dc2626" }}>🔓 Abrir {MES_NAMES[confirmarAbrir.mes - 1]} {confirmarAbrir.año}</div>
              <div style={{ fontSize: 12, color: "#475569", marginBottom: 12 }}>
                Esta acción descongela el mes. Las notas se podrán recalcular y los registros editar.<br /><br />
                <b style={{ color: "#dc2626" }}>SOLO USAR EN EMERGENCIAS.</b>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ flex: 1, ...S.btnS }} onClick={() => setConfirmarAbrir(null)}>Cancelar</button>
                <button style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 800, fontSize: 13, background: "#dc2626", color: "#fff" }}
                  onClick={() => ejecutarApertura(confirmarAbrir.año, confirmarAbrir.mes)}>
                  🔓 Sí, abrir mes
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#ea580c", marginBottom: 10 }}>➕ Agregar vendedora</div>
          <div style={{ marginBottom: 8 }}>
            <label style={S.lbl}>Nombre completo</label>
            <input value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} placeholder="Nombre y apellido" style={S.inp} onKeyDown={e => { if (e.key === "Enter") agregar(); }} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={S.lbl}>Ciudad</label>
            <div style={{ display: "flex", gap: 8 }}>
              {["BOG", "MED"].map(c => (
                <button key={c} onClick={() => setNuevaCiudad(c)}
                  style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "2px solid " + (nuevaCiudad === c ? COLOR_CIUDAD[c] : "#e2e8f0"), cursor: "pointer", fontWeight: 800, fontSize: 12, background: nuevaCiudad === c ? COLOR_CIUDAD[c] + "15" : "#fff", color: nuevaCiudad === c ? COLOR_CIUDAD[c] : "#64748b" }}>
                  {LABEL_CIUDAD[c]}
                </button>
              ))}
            </div>
          </div>
          <button style={S.btnP} onClick={agregar}>+ Agregar</button>
        </div>
        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#ea580c", marginBottom: 10 }}>👥 Activas ({act.length})</div>
          {act.map(v => (
            <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>{v.nombre}</div>
              <button onClick={() => cambiarCiudad(v.id)} style={{ padding: "3px 10px", borderRadius: 12, border: "1px solid " + COLOR_CIUDAD[v.ciudad] + "40", cursor: "pointer", fontSize: 10, fontWeight: 800, background: COLOR_CIUDAD[v.ciudad] + "15", color: COLOR_CIUDAD[v.ciudad] }}>{LABEL_CIUDAD[v.ciudad]}</button>
              {confirmarBaja === v.id ? (
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => darDeBaja(v.id)} style={{ padding: "4px 8px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 800, background: "#dc2626", color: "#fff" }}>¿Seguro?</button>
                  <button onClick={() => setConfirmarBaja(null)} style={{ padding: "4px 8px", borderRadius: 7, border: "1px solid #e2e8f0", cursor: "pointer", fontSize: 11, background: "#fff", color: "#475569" }}>No</button>
                </div>
              ) : (
                <button onClick={() => setConfirmarBaja(v.id)} style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid #fca5a5", cursor: "pointer", fontSize: 11, fontWeight: 700, background: "#fff", color: "#dc2626" }}>Baja</button>
              )}
            </div>
          ))}
        </div>
        {inact.length > 0 && (
          <div style={S.card}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#94a3b8", marginBottom: 10 }}>💤 Inactivas ({inact.length})</div>
            {inact.map(v => (
              <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
                <div style={{ flex: 1, fontWeight: 700, fontSize: 13, textDecoration: "line-through", color: "#94a3b8" }}>{v.nombre}</div>
                <BadgeCiudad ciudad={v.ciudad} />
                <button onClick={() => reactivar(v.id)} style={{ padding: "4px 8px", borderRadius: 7, border: "1px solid #bbf7d0", cursor: "pointer", fontSize: 11, fontWeight: 700, background: "#fff", color: "#059669" }}>Activar</button>
                {confirmarEliminar === v.id ? (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => eliminarDefinitivo(v.id)} style={{ padding: "4px 8px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 800, background: "#dc2626", color: "#fff" }}>¿Seguro?</button>
                    <button onClick={() => setConfirmarEliminar(null)} style={{ padding: "4px 8px", borderRadius: 7, border: "1px solid #e2e8f0", cursor: "pointer", fontSize: 11, background: "#fff", color: "#475569" }}>No</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmarEliminar(v.id)} style={{ padding: "4px 8px", borderRadius: 7, border: "1px solid #fca5a5", cursor: "pointer", fontSize: 11, fontWeight: 700, background: "#fff", color: "#dc2626" }}>🗑️</button>
                )}
              </div>
            ))}
          </div>
        )}
        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#ea580c", marginBottom: 10 }}>💾 Copia de seguridad</div>
          <button style={{ ...S.btnP, marginBottom: 10 }} onClick={exportarJSON}>⬇️ Exportar backup (JSON)</button>
          <button style={{ ...S.btnP, background: "#f1f5f9", color: "#475569", boxShadow: "none" }} onClick={() => setModalTexto({ titulo: "⬆️ Importar backup", texto: "", modo: "importar" })}>⬆️ Importar backup</button>
        </div>
        <div style={{ ...S.card, marginTop: 14, background: "#f8fafc" }}>
          <div style={{ fontSize: 11, color: "#475569", marginBottom: 6 }}>Sesión actual:</div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{user?.email}</div>
          <button style={{ ...S.btnP, background: "#f1f5f9", color: "#475569", boxShadow: "none" }} onClick={() => hacerLogout()}>🔒 Cerrar sesión</button>
        </div>
      </div>
    );
  }

  // ============================================================
  // RENDER PRINCIPAL
  // ============================================================
  if (!cargado || !authReady) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, minHeight: "100vh", background: "#f8fafc" }}>
      <div style={{ fontSize: 30 }}>⚡</div>
      <div style={{ color: "#475569", fontSize: 13 }}>Cargando...</div>
    </div>
  );

  // Si el ranking está apagado, las vendedoras (no logueadas) ven pantalla bloqueada.
  // Luis y Carolina (logueados) siempre ven el ranking.
  const pantallasBloqueables = ["ranking", "boletin", "trimestre"];
  const pantallaActualBloqueada = !user && !config.rankingVisible && pantallasBloqueables.includes(pantalla);

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800;900&display=swap" rel="stylesheet" />
      <Confetti />
      <div style={S.wrap}>
        {pideLogin && <ModalLogin titulo="Iniciar sesión" onClose={() => { setPideLogin(false); if (pantallaTrasLogin) { setPantalla(pantallaTrasLogin); setPantallaTrasLogin(null); } }} />}
        <div style={S.hdr}>
          <div style={S.logo}>⚡ Televentas</div>
          <div style={S.nav}>
            <button style={S.navB(pantalla === "ranking" || pantalla === "boletin")} onClick={() => setPantalla("ranking")}>📊</button>
            {puedeIngresoVentas(user) && <button style={S.navB(pantalla === "ingreso")} onClick={() => setPantalla("ingreso")}>✏️</button>}
            {puedeIngresoVentas(user) && <button style={S.navB(pantalla === "ventas")} onClick={() => setPantalla("ventas")}>💰</button>}
            <button style={S.navB(pantalla === "trimestre")} onClick={() => setPantalla("trimestre")}>📈</button>
            {esAdmin(user) && <button style={S.navB(pantalla === "admin")} onClick={() => setPantalla("admin")}>⚙️</button>}
            {!user && <button style={{ ...S.navB(false), background: "#0f172a", color: "#fff" }} onClick={() => setPideLogin(true)}>🔐</button>}
          </div>
        </div>
        {pantallaActualBloqueada ? (
          <PantallaBloqueada />
        ) : (
          <>
            {pantalla === "ranking" && <PantallaRanking />}
            {pantalla === "boletin" && <PantallaBoletin />}
            {pantalla === "ingreso" && <PantallaIngreso />}
            {pantalla === "ventas" && <PantallaVentas />}
            {pantalla === "trimestre" && <PantallaTrimestre />}
            {pantalla === "admin" && <PantallaAdmin />}
          </>
        )}
      </div>
    </>
  );
}

// =============================================================
// ESTILOS
// =============================================================
function makeStyles() {
  return {
    wrap: { fontFamily: "'DM Sans',sans-serif", background: "#f8fafc", minHeight: "100vh", color: "#0f172a" },
    hdr: { background: "#fff", borderBottom: "2px solid #f1f5f9", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" },
    logo: { fontSize: 15, fontWeight: 900, color: "#ea580c" },
    nav: { display: "flex", gap: 3, background: "#f1f5f9", padding: 3, borderRadius: 9 },
    navB: a => ({ padding: "6px 11px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 800, background: a ? "#ea580c" : "transparent", color: a ? "#fff" : "#475569" }),
    body: { padding: "14px 14px 50px", maxWidth: 560, margin: "0 auto" },
    tit: { fontSize: 19, fontWeight: 900, marginBottom: 3, color: "#0f172a" },
    sub: { fontSize: 11, color: "#475569", marginBottom: 16 },
    card: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 13, padding: 14, marginBottom: 9, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" },
    lbl: { fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: ".7px", marginBottom: 3, display: "block" },
    inp: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", color: "#0f172a", fontSize: 16, width: "100%", boxSizing: "border-box" },
    btnP: { padding: "13px 0", width: "100%", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 800, fontSize: 14, background: "linear-gradient(135deg,#ea580c,#f97316)", color: "#fff", boxShadow: "0 2px 8px rgba(234,88,12,0.3)" },
    btnS: { padding: "7px 13px", borderRadius: 7, border: "1px solid #e2e8f0", cursor: "pointer", fontWeight: 700, fontSize: 11, background: "#fff", color: "#475569" },
    tabActivo: (id, activo, color) => ({
      padding: "7px 13px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 11,
      fontWeight: 800, whiteSpace: "nowrap",
      background: id === activo ? "#fff" : "transparent",
      color: id === activo ? color : "#475569",
      boxShadow: id === activo ? `0 2px 8px ${color}40, 0 0 0 2px ${color}` : "none",
      transition: "all 0.2s",
    }),
  };
}
