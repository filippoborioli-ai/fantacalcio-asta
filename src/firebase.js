import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Le chiavi arrivano dal file .env (vedi .env.example) e NON vanno mai
// scritte qui direttamente, così puoi tenere il repository pubblico su GitHub
// senza esporre nulla di sensibile (per Firebase, comunque, queste chiavi
// sono pensate per essere lato client: la vera protezione dei dati sta nelle
// regole di Firestore, non nel nascondere queste chiavi).
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
