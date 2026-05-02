import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, browserLocalPersistence, setPersistence } from "firebase/auth";

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
// Persistencia local: el login queda guardado entre sesiones
setPersistence(auth, browserLocalPersistence).catch(() => {});