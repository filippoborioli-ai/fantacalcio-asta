import React, { useEffect, useRef, useState } from "react";
import { RUOLI } from "../lib/model.js";
import { suona } from "../lib/suoni.js";

// La slot dell'asta, vera macchinetta a tre rulli: ruolo, nome e squadra.
// Mentre girano mostrano pezzi di giocatori diversi (è così che si comporta
// una slot); quando si fermano, uno alla volta da sinistra a destra, le tre
// finestrelle compongono il giocatore estratto davvero.
//
// L'estrazione è già decisa e scritta su Firestore prima che i rulli
// partano: l'animazione è teatro. Così tutti i dispositivi collegati vedono
// lo stesso identico risultato, anche se i loro telefoni vanno a velocità
// diverse.
const ALTEZZA_RIGA = 54;
const STOP_RULLI = [1500, 2100, 2700]; // quando si ferma ciascun rullo
const DURATA_TOTALE = STOP_RULLI[2];

function Rullo({ valori, durata, chip }) {
  // L'ultima riga è quella buona: il rullo scorre fino a portarla nella
  // banda evidenziata, che è la seconda delle tre visibili.
  const scorrimento = (valori.length - 2) * ALTEZZA_RIGA;
  return (
    <div className="fk-slot-rullo-box">
      <div
        className="fk-slot-rullo"
        style={{ transform: `translateY(-${scorrimento}px)`, transitionDuration: `${durata}ms` }}
      >
        {valori.map((v, i) => (
          <div className="fk-slot-cella" key={i}>
            {chip ? (
              <span
                className="fk-chip"
                style={{ background: RUOLI.find((r) => r.key === v)?.colore }}
              >
                {v}
              </span>
            ) : (
              <span className="fk-slot-valore">{v}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SlotChiamata({ sorteggio, sonoIoIlLanciatore, onChiama, onRigira, onChiudi }) {
  const [fermata, setFermata] = useState(false);
  const timers = useRef([]);

  useEffect(() => {
    setFermata(false);
    timers.current.forEach(clearTimeout);
    timers.current = [];
    suona("slot");
    // un colpo secco a ogni rullo che si incastra
    STOP_RULLI.forEach((t, i) => {
      timers.current.push(
        setTimeout(() => suona(i === STOP_RULLI.length - 1 ? "slotFerma" : "tic"), t)
      );
    });
    timers.current.push(setTimeout(() => setFermata(true), DURATA_TOTALE + 150));
    return () => timers.current.forEach(clearTimeout);
  }, [sorteggio.id]);

  const v = sorteggio.vincitore;

  return (
    <div className="fk-slot-overlay">
      <div className="fk-slot-macchina" onClick={(e) => e.stopPropagation()}>
        <div className="fk-slot-testata">
          <span className="fk-slot-luci" aria-hidden="true">
            <i /><i /><i /><i /><i /><i /><i />
          </span>
          <span className="fk-slot-titolo">🎰 Chiamata a sorte</span>
          <span className="fk-slot-chi">
            {sonoIoIlLanciatore ? "Stai girando tu" : `Gira ${sorteggio.daNome || "qualcuno"}`}
            {sorteggio.ruolo !== "TUTTI" &&
              ` · solo ${RUOLI.find((r) => r.key === sorteggio.ruolo)?.label.toLowerCase()}`}
          </span>
        </div>

        <div className={fermata ? "fk-slot-rulli fk-slot-rulli-vinta" : "fk-slot-rulli"}>
          <div className="fk-slot-banda" />
          <Rullo valori={sorteggio.reels.ruoli} durata={STOP_RULLI[0]} chip />
          <Rullo valori={sorteggio.reels.nomi} durata={STOP_RULLI[1]} />
          <Rullo valori={sorteggio.reels.club} durata={STOP_RULLI[2]} />
        </div>

        {fermata ? (
          <>
            <p className="fk-slot-esito">
              <strong>{v.nome}</strong>
              {v.quotazione ? ` · quotazione ${v.quotazione}` : ""}
            </p>
            {sonoIoIlLanciatore ? (
              <div className="fk-slot-azioni">
                <button className="fk-primary" onClick={() => onChiama(v)}>
                  Chiama {v.nome}
                </button>
                <button className="fk-secondary" onClick={onRigira}>
                  🎲 Rigira
                </button>
                <button className="fk-secondary" onClick={onChiudi}>
                  Chiudi
                </button>
              </div>
            ) : (
              <p className="fk-slot-attesa">
                Decide {sorteggio.daNome || "chi ha girato"}…
              </p>
            )}
          </>
        ) : (
          <p className="fk-slot-attesa">Il destino sta scegliendo…</p>
        )}
      </div>
    </div>
  );
}
