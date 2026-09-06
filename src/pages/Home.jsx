import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase.js";
import { defaultConfig } from "../lib/model.js";
import TemaToggle from "../components/TemaToggle.jsx";

// Niente 0/O/1/I per evitare ambiguità quando il codice viene letto ad alta voce
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generaCodice(lunghezza = 6) {
  let s = "";
  for (let i = 0; i < lunghezza; i++) {
    s += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  }
  return s;
}

export default function Home() {
  const navigate = useNavigate();
  const [nomeAsta, setNomeAsta] = useState("");
  const [codiceInput, setCodiceInput] = useState("");
  const [creando, setCreando] = useState(false);
  const [unendo, setUnendo] = useState(false);
  const [errore, setErrore] = useState("");

  const creaAsta = async () => {
    setErrore("");
    setCreando(true);
    try {
      let codice = "";
      for (let tentativi = 0; tentativi < 8; tentativi++) {
        const tentativo = generaCodice(6);
        const snap = await getDoc(doc(db, "aste", tentativo));
        if (!snap.exists()) {
          codice = tentativo;
          break;
        }
      }
      if (!codice) throw new Error("Non sono riuscito a generare un codice libero: riprova.");

      await setDoc(doc(db, "aste", codice), {
        nome: nomeAsta.trim() || "Asta del Fanta",
        config: defaultConfig(),
        squadre: null,
        astaLive: null,
        creatoIl: serverTimestamp(),
      });

      navigate(`/asta/${codice}`);
    } catch (e) {
      setErrore(e.message || "Errore nella creazione dell'asta. Controlla la configurazione Firebase.");
    } finally {
      setCreando(false);
    }
  };

  const uniscitiAsta = async () => {
    setErrore("");
    const codice = codiceInput.trim().toUpperCase();
    if (!codice) return setErrore("Inserisci un codice.");
    setUnendo(true);
    try {
      const snap = await getDoc(doc(db, "aste", codice));
      if (!snap.exists()) {
        setErrore("Codice non trovato: controlla di averlo scritto giusto.");
        return;
      }
      navigate(`/asta/${codice}`);
    } catch (e) {
      setErrore("Errore di connessione: controlla la configurazione Firebase e riprova.");
    } finally {
      setUnendo(false);
    }
  };

  return (
    <div className="home-root">
      <div className="home-topbar">
        <TemaToggle />
      </div>
      <div className="home-inner">
        <span className="home-badge">⚽</span>
        <h1>Asta del Fanta</h1>
        <p className="home-sub">
          Rilanci in tempo reale, budget sotto controllo, zero fogli di carta.
        </p>

        <div className="home-card">
          <h2>Crea una nuova asta</h2>
          <p>Ricevi un codice da girare ai tuoi amici.</p>
          <input
            type="text"
            placeholder="Nome della lega (es. Panda)"
            value={nomeAsta}
            onChange={(e) => setNomeAsta(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !creando && creaAsta()}
          />
          <button className="home-primary" onClick={creaAsta} disabled={creando}>
            {creando ? "Creo…" : "Crea asta"}
          </button>
        </div>

        <div className="home-card">
          <h2>Entra con un codice</h2>
          <p>Te l'ha passato chi ha creato la lega.</p>
          <input
            type="text"
            className="home-code-input"
            placeholder="7K3PLQ"
            maxLength={6}
            value={codiceInput}
            onChange={(e) => setCodiceInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && !unendo && uniscitiAsta()}
          />
          <button className="home-secondary" onClick={uniscitiAsta} disabled={unendo}>
            {unendo ? "Entro…" : "Unisciti"}
          </button>
        </div>

        {errore && <p className="home-error">{errore}</p>}
      </div>
    </div>
  );
}
