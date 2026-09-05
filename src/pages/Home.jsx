import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase.js";
import { defaultConfig } from "../lib/model.js";

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
        teamNames: Array.from({ length: 8 }, () => ""),
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
      <h1>Asta del Fanta</h1>
      <p className="home-sub">Crea la tua asta o entra in una già avviata da un amico.</p>

      <div className="home-card">
        <h2>Crea una nuova asta</h2>
        <input
          type="text"
          placeholder="Nome dell'asta (es. Panda)"
          value={nomeAsta}
          onChange={(e) => setNomeAsta(e.target.value)}
        />
        <button className="home-primary" onClick={creaAsta} disabled={creando}>
          {creando ? "Creo…" : "Crea asta"}
        </button>
      </div>

      <div className="home-card">
        <h2>Unisciti con un codice</h2>
        <input
          type="text"
          placeholder="Codice (es. 7K3PLQ)"
          value={codiceInput}
          onChange={(e) => setCodiceInput(e.target.value.toUpperCase())}
        />
        <button className="home-secondary" onClick={uniscitiAsta} disabled={unendo}>
          {unendo ? "Entro…" : "Unisciti"}
        </button>
      </div>

      {errore && <p className="home-error">{errore}</p>}
    </div>
  );
}
