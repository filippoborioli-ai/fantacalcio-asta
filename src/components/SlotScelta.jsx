import React, { useState } from "react";
import { RUOLI } from "../lib/model.js";

// Prima di tirare la leva: da che reparto pescare. Resta locale a chi lancia
// (gli altri vedono solo i rulli girare, non questa scelta), e mostra quanti
// giocatori ci sono davvero in ogni reparto — così non si tira la leva su un
// ruolo ormai esaurito.
export default function SlotScelta({ conteggi, onGira, onChiudi }) {
  const [ruolo, setRuolo] = useState("TUTTI");
  const totale = RUOLI.reduce((s, r) => s + (conteggi[r.key] || 0), 0);
  const disponibili = ruolo === "TUTTI" ? totale : conteggi[ruolo] || 0;

  return (
    <div className="fk-slot-overlay" onClick={onChiudi}>
      <div className="fk-slot-macchina" onClick={(e) => e.stopPropagation()}>
        <div className="fk-slot-testata">
          <span className="fk-slot-luci" aria-hidden="true">
            <i /><i /><i /><i /><i /><i /><i />
          </span>
          <span className="fk-slot-titolo">🎰 Chiamata a sorte</span>
          <span className="fk-slot-chi">Da che reparto peschiamo?</span>
        </div>

        <div className="fk-slot-ruoli">
          <button
            className={ruolo === "TUTTI" ? "fk-choice fk-choice-active" : "fk-choice"}
            onClick={() => setRuolo("TUTTI")}
          >
            Tutti <span className="fk-slot-quanti">{totale}</span>
          </button>
          {RUOLI.map((r) => {
            const attivo = ruolo === r.key;
            const quanti = conteggi[r.key] || 0;
            return (
              <button
                key={r.key}
                className={attivo ? "fk-choice fk-choice-active" : "fk-choice"}
                style={attivo ? { background: r.colore, borderColor: r.colore, color: "#231A12" } : undefined}
                disabled={quanti === 0}
                onClick={() => setRuolo(r.key)}
              >
                {r.label} <span className="fk-slot-quanti">{quanti}</span>
              </button>
            );
          })}
        </div>

        <div className="fk-slot-azioni">
          <button className="fk-primary fk-slot-leva" disabled={disponibili === 0} onClick={() => onGira(ruolo)}>
            🕹️ Tira la leva
          </button>
          <button className="fk-secondary" onClick={onChiudi}>
            Annulla
          </button>
        </div>
        <p className="fk-slot-attesa">
          {disponibili === 0
            ? "Nessun giocatore libero in questo reparto"
            : `${disponibili} giocatori ancora liberi · la vedranno tutti`}
        </p>
      </div>
    </div>
  );
}
