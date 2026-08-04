// Data provider — carga los 5 documentos de Firestore en tiempo real y los expone via Context
// Modelo: colección "televentas" con docs: registros, metas, vendedoras, snapshots, config
// Cada doc guarda un solo campo `data` con JSON stringified.
//
// Mejora sobre app vieja: usa onSnapshot para cambios en tiempo real
// (así cuando systemlap sincroniza, la vista de vendedoras se actualiza sin refresh).

import { createContext, useContext, useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../../firebase.js";
import { VENDEDORAS_DEFAULT } from "../../lib/constantes.js";

const DatosContext = createContext(null);

export function useDatos() {
  const ctx = useContext(DatosContext);
  if (!ctx) throw new Error("useDatos debe usarse dentro de <DatosProvider>");
  return ctx;
}

const DOCS = ["registros", "metas", "vendedoras", "snapshots", "config"];

const DEFAULTS = {
  registros: {},
  metas: {},
  vendedoras: VENDEDORAS_DEFAULT,
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

    // Suscripciones en tiempo real a los 5 docs
    const unsubs = DOCS.map(nombre =>
      onSnapshot(
        doc(db, "televentas", nombre),
        (snap) => {
          try {
            if (snap.exists()) {
              const raw = snap.data().data;
              const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
              setDatos(d => ({ ...d, [nombre]: parsed ?? DEFAULTS[nombre] }));
            } else {
              setDatos(d => ({ ...d, [nombre]: DEFAULTS[nombre] }));
            }
            setUltimoSync(new Date());
            setCargado(true);
          } catch (e) {
            console.error("Error parseando", nombre, e);
            setError(e);
          }
        },
        (err) => {
          console.error("Error onSnapshot", nombre, err);
          setError(err);
          setCargado(true); // marca cargado igual, para no bloquear la UI
        }
      )
    );

    return () => unsubs.forEach(u => u());
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
