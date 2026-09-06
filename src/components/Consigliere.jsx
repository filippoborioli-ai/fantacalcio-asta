import React, { useEffect, useRef, useState } from "react";
import { MessageCircle, Minus, Send } from "lucide-react";

// Il consigliere d'asta: vignetta in basso a destra, si apre e si richiude.
//
// Le domande passano dal centralino (worker/consigliere.js), che è l'unico a
// conoscere la chiave OpenAI: da qui parte solo la domanda e la fotografia
// della situazione dell'asta. Se l'indirizzo del centralino non è configurato
// il componente non viene nemmeno montato (vedi AstaRoom).
//
// Il tetto di domande per squadra è tenuto qui e sul documento condiviso: è un
// contatore, non una difesa (chi smanetta lo aggira come aggira tutto il resto
// di questa app). Quello che protegge la spesa sta nel Worker e nel tetto
// mensile su OpenAI.
const MAX_DOMANDA = 300;

export default function Consigliere({ endpoint, contesto, domandeFatte, maxDomande, onDomandaFatta }) {
  const [aperto, setAperto] = useState(false);
  const [testo, setTesto] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [messaggi, setMessaggi] = useState([
    {
      da: "bot",
      testo:
        "Ciao! Chiedimi se conviene rilanciare, quanto spendere o come messo sei di reparto. Guardo i numeri della tua asta.",
    },
  ]);
  const fondoRef = useRef(null);

  const rimaste = Math.max(0, maxDomande - domandeFatte);
  const esaurite = rimaste <= 0;

  useEffect(() => {
    if (aperto) fondoRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messaggi, aperto, inCorso]);

  const chiedi = async () => {
    const domanda = testo.trim().slice(0, MAX_DOMANDA);
    if (!domanda || inCorso || esaurite) return;

    setMessaggi((m) => [...m, { da: "io", testo: domanda }]);
    setTesto("");
    setInCorso(true);
    onDomandaFatta();

    try {
      // Le ultime battute della conversazione: senza queste ogni domanda
      // parte da zero e le risposte sembrano tutte uguali, perché il modello
      // non sa cosa ha già detto un attimo prima.
      const storico = messaggi
        .slice(-8)
        .filter((m) => !m.errore)
        .map((m) => ({ ruolo: m.da === "io" ? "utente" : "bot", testo: m.testo }));

      const risposta = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domanda, contesto, storico }),
      });
      const dati = await risposta.json().catch(() => ({}));
      setMessaggi((m) => [
        ...m,
        {
          da: "bot",
          testo: dati.testo || dati.errore || "Non sono riuscito a rispondere.",
          errore: !dati.testo,
        },
      ]);
    } catch (e) {
      setMessaggi((m) => [
        ...m,
        { da: "bot", testo: "Non riesco a raggiungere il consigliere. Connessione?", errore: true },
      ]);
    } finally {
      setInCorso(false);
    }
  };

  if (!aperto) {
    return (
      <button
        className="fk-cons-bolla"
        onClick={() => setAperto(true)}
        title="Chiedi consiglio"
        aria-label="Apri il consigliere d'asta"
      >
        <MessageCircle size={20} />
        {rimaste > 0 && <span className="fk-cons-contatore">{rimaste}</span>}
      </button>
    );
  }

  return (
    <div className="fk-cons-finestra">
      <div className="fk-cons-testata">
        <span className="fk-cons-titolo">🧠 Consigliere d'asta</span>
        <span className="fk-cons-rimaste">{rimaste} domande</span>
        <button
          className="fk-cons-riduci"
          onClick={() => setAperto(false)}
          title="Riduci"
          aria-label="Riduci il consigliere"
        >
          <Minus size={15} />
        </button>
      </div>

      <div className="fk-cons-corpo">
        {messaggi.map((m, i) => (
          <div
            key={i}
            className={[
              "fk-cons-msg",
              m.da === "io" ? "fk-cons-msg-io" : "fk-cons-msg-bot",
              m.errore ? "fk-cons-msg-errore" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {m.testo}
          </div>
        ))}
        {inCorso && (
          <div className="fk-cons-msg fk-cons-msg-bot fk-cons-pensa">
            <span /><span /><span />
          </div>
        )}
        <div ref={fondoRef} />
      </div>

      <div className="fk-cons-piede">
        {esaurite ? (
          <p className="fk-cons-finite">Domande finite per questa squadra.</p>
        ) : (
          <>
            <input
              type="text"
              value={testo}
              maxLength={MAX_DOMANDA}
              placeholder="Conviene arrivare a 40 per lui?"
              onChange={(e) => setTesto(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && chiedi()}
              disabled={inCorso}
            />
            <button
              className="fk-cons-invia"
              onClick={chiedi}
              disabled={inCorso || !testo.trim()}
              aria-label="Invia la domanda"
            >
              <Send size={15} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
