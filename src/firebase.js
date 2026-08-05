import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import {
  getAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  setPersistence,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyA0dRWJ79Tlb5VwSrjv6pLhE2b5AuQINlg",
  authDomain: "televentas-evaluacion.firebaseapp.com",
  projectId: "televentas-evaluacion",
  storageBucket: "televentas-evaluacion.firebasestorage.app",
  messagingSenderId: "1044356969620",
  appId: "1:1044356969620:web:0740bf13ded04ad454f081"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
// PERSISTENCIA — IndexedDB primero (más robusto en PWA standalone iOS/Android),
// fallback a localStorage si el navegador no soporta IndexedDB.
// browserLocal solo se pierde en Safari PWA "add to home screen" bajo ciertas
// condiciones; IndexedDB persiste correctamente en ese contexto.
setPersistence(auth, indexedDBLocalPersistence)
  .catch(() => setPersistence(auth, browserLocalPersistence).catch(() => {}));