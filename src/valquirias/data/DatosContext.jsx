// Data provider — carga los 5 documentos de Firestore en tiempo real y los expone via Context
// Modelo: colección "televentas" con docs: registros, metas, vendedoras, snapshots, config
// Cada doc guarda un solo campo `data` con JSON stringified.
//
// Mejora sobre app vieja: usa onSnapshot para cambios en tiempo real
// (así cuando systemlap sincroniza, la vista de vendedoras se actualiza sin refresh).

import { createContext, useContext, useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../../firebase.js";

const DatosContext = createContext(null);

export function useDatos() {
  const ctx = useContext(DatosContext);
  if (!ctx) throw new Error("useDatos debe usarse dentro de <DatosProvider>");
  return ctx;
}

const DOCS = ["registros", "metas", "vendedoras", "snapshots", "config"];

// OJO: `vendedoras` arranca vacío a propósito. Antes usaba VENDEDORAS_DEFAULT
// (roster hardcodeado en lib/constantes.js) y eso hacía que la UI pudiera pintar
// un equipo falso si el doc de Firestore no existía o todavía no había llegado.
// El roster real SIEMPRE viene de Firestore.
const DEFAULTS = {
  registros: {},
  metas: {},
  vendedoras: [],
  snapshots: {},
  config: { rankingVisible: true },
};

export function DatosProvider({ modoDemo, datosMock, children }) {
  const [datos, setDatos] = useState(DEFAULTS);
  const [cargado, setCargado] = useState(false);
  const [error, setError] = useState(null);
  const [ultimoSync, setUltimoSync] = useState(null);

  useEffect(() => {
    // Modo demo: no cargar Firestore, usar mock provisto por prop
    if (modoDemo) {
      setDatos({ ...DEFAULTS, ...(datosMock || {}) });
      setCargado(true);
      return;
    }

    // `cargado` sólo puede ser true cuando los 5 docs hayan emitido su PRIMER
    // snapshot. Si se marcara por doc, la UI se pintaba con el primero que
    // llegaba y los otros 4 todavía en DEFAULTS (síntoma: Backup en 0 mientras
    // otra pantalla ya mostraba el ranking real).
    //
    // El contador vive en el closure del efecto, NO en state: con state se
    // perderían actualizaciones porque los callbacks de onSnapshot capturan el
    // valor viejo de la render en que se suscribieron.
    let cancelado = false;
    const pendientes = new Set(DOCS);

    setCargado(false);

    const marcarLlegado = (nombre) => {
      if (cancelado) return;
      pendientes.delete(nombre);
      if (pendientes.size === 0) setCargado(true);
    };

    // Suscripciones en tiempo real a los 5 docs
    const unsubs = DOCS.map(nombre =>
      onSnapshot(
        doc(db, "televentas", nombre),
        (snap) => {
          if (cancelado) return;
          try {
            if (snap.exists()) {
              const raw = snap.data().data;
              const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
              setDatos(d => ({ ...d, [nombre]: parsed ?? DEFAULTS[nombre] }));
            } else {
              setDatos(d => ({ ...d, [nombre]: DEFAULTS[nombre] }));
            }
            setUltimoSync(new Date());
          } catch (e) {
            console.error("Error parseando", nombre, e);
            setError(e);
          }
          // Llegó (haya parseado bien o mal): no debe bloquear a los otros 4.
          marcarLlegado(nombre);
        },
        (err) => {
          console.error("Error onSnapshot", nombre, err);
          if (cancelado) return;
          setError(err);
          // Se cuenta como llegado igual, si no la UI queda cargando para siempre.
          marcarLlegado(nombre);
        }
      )
    );

    return () => {
      cancelado = true;
      unsubs.forEach(u => u());
    };
  }, [modoDemo]);

  // Guardar un doc (optimista: actualiza local primero, después Firestore)
  async function guardar(nombre, nuevoValor) {
    setDatos(d => ({ ...d, [nombre]: nuevoValor }));
    if (modoDemo) return; // en demo, solo local
    try {
      await setDoc(doc(db, "televentas", nombre), { data: JSON.stringify(nuevoValor) });
    } catch (e) {
      console.error("Error guardando", nombre, e);
      setError(e);
    }
  }

  const valor = {
    ...datos,
    cargado,
    error,
    ultimoSync,
    modoDemo: !!modoDemo,
    guardar,
    // Shortcuts para cada doc
    saveRegistros:  (v) => guardar("registros",  v),
    saveMetas:      (v) => guardar("metas",      v),
    saveVendedoras: (v) => guardar("vendedoras", v),
    saveSnapshots:  (v) => guardar("snapshots",  v),
    saveConfig:     (v) => guardar("config",     v),
  };

  return <DatosContext.Provider value={valor}>{children}</DatosContext.Provider>;
}
