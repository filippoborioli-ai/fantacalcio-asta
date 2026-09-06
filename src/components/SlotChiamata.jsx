import React, { useEffect, useMemo, useRef, useState } from "react";
import { RUOLI } from "../lib/model.js";
import { suona } from "../lib/suoni.js";

// Estrazione a sorte del prossimo giocatore da chiamare.
//
// Il vincitore è già deciso quando il rullo parte: l'animazione è teatro, non
// sorteggio: così il risultato non dipende da quanti fotogrammi riesce a fare
// il telefono di chi guarda, e tutti vedono la stessa cosa.
//
// Serve a coprire il momento morto tra un giocatore e l'altro, quello in cui
// nessuno sa chi chiamare e la serata si siede.
const RIGHE_RULLO = 34; // quante ne scorrono prima di fermarsi
const ALTEZZA_RIGA = 54; // px, deve combaciare con il CSS
const DURATA_MS = 2400;

export default function SlotChiamata({ disponibili, onEstratto, onChiudi }) {
  const [fase, setFase] = useState("gira"); // gira -> ferma
  const [giro, setGiro] = useState(0);
  const timerRef = useRef([]);

  // Il rullo: righe casuali con in fondo il giocatore estratto davvero.
  // Cambiare "giro" rimescola tutto: è quello che fa il pulsante "Rigira".
  const { righe, vincitore } = useMemo(() => {
    if (!disponibili.length) return { righe: [], vincitore: null };
    const scelto = disponibili[Math.floor(Math.random() * disponibili.length)];
    const riempimento = Array.from({ length: RIGHE_RULLO - 1 }, () =>
      disponibili[Math.floor(Math.random() * disponibili.length)]
    );
    return { righe: [...riempimento, scelto], vincitore: scelto };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disponibili, giro]);

  useEffect(() => {
    if (!vincitore) return;
    suona("slot");
    const t1 = setTimeout(() => {
      setFase("ferma");
      suona("slotFerma");
    }, DURATA_MS);
    timerRef.current.push(t1);
    return () => timerRef.current.forEach(clearTimeout);
  }, [vincitore, giro]);

  const rigira = () => {
    setFase("gira");
    // Il rullo deve tornare in cima senza animazione, altrimenti si vede
    // "risalire": lo rimonto cambiando la chiave del contenitore.
    setGiro((g) => g + 1);
  };

  if (!vincitore) return null;

  // Lo scorrimento porta l'ultima riga dentro la finestrella evidenziata, che
  // è la SECONDA delle tre visibili: quindi una riga in meno rispetto a
  // portarla in cima, altrimenti il vincitore si ferma sopra la banda dorata.
  const scorrimento = (righe.length - 2) * ALTEZZA_RIGA;

  return (
    <div className="fk-slot-overlay" onClick={fase === "ferma" ? onChiudi : undefined}>
      <div className="fk-slot-box" onClick={(e) => e.stopPropagation()}>
        <span className="fk-slot-titolo">🎰 Chiamata a sorte</span>

        <div className="fk-slot-finestra">
          <div className="fk-slot-riga-attiva" />
          <div
            key={giro}
            className="fk-slot-rullo"
            style={{
              transform: `translateY(-${scorrimento}px)`,
              transitionDuration: `${DURATA_MS}ms`,
            }}
          >
            {righe.map((g, i) => {
              const r = RUOLI.find((x) => x.key === g.ruolo);
              return (
                <div className="fk-slot-riga" key={`${g.nome}-${i}`}>
                  <span className="fk-chip" style={{ background: r?.colore }}>
                    {g.ruolo}
                  </span>
                  <span className="fk-slot-nome">{g.nome}</span>
                  <span className="fk-slot-club">{g.squadra}</span>
                </div>
              );
            })}
          </div>
        </div>

        {fase === "ferma" ? (
          <div className="fk-slot-azioni">
            <button className="fk-primary" onClick={() => onEstratto(vincitore)}>
              Chiama {vincitore.nome}
            </button>
            <button className="fk-secondary" onClick={rigira}>
              🎲 Rigira
            </button>
            <button className="fk-secondary" onClick={onChiudi}>
              Chiudi
            </button>
          </div>
        ) : (
          <p className="fk-slot-attesa">Il destino sta scegliendo…</p>
        )}
      </div>
    </div>
  );
}
