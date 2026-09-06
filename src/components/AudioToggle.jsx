import React, { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { impostaAudioSpento, sbloccaAudio } from "../lib/suoni.js";

// Interruttore dell'audio. Serve davvero: in otto attorno a un tavolo, otto
// dispositivi che suonano insieme sono troppi — chi vuole silenzia il proprio.
// La scelta resta su questo dispositivo.
const CHIAVE = "fantacalcio-audio-spento";

function spentoSalvato() {
  try {
    return localStorage.getItem(CHIAVE) === "1";
  } catch (e) {
    return false;
  }
}

export default function AudioToggle() {
  const [spento, setSpento] = useState(spentoSalvato);

  useEffect(() => {
    impostaAudioSpento(spento);
    try {
      localStorage.setItem(CHIAVE, spento ? "1" : "0");
    } catch (e) {
      // se non si salva, vale per questa sessione
    }
  }, [spento]);

  // Il browser tiene l'audio bloccato finché l'utente non tocca la pagina, e
  // non basta chiamarlo dopo: va agganciato a un gesto vero. Chi guarda l'asta
  // senza mai cliccare, altrimenti, non sentirebbe niente per tutta la serata.
  useEffect(() => {
    const sblocca = () => sbloccaAudio();
    window.addEventListener("pointerdown", sblocca, { once: true });
    window.addEventListener("keydown", sblocca, { once: true });
    return () => {
      window.removeEventListener("pointerdown", sblocca);
      window.removeEventListener("keydown", sblocca);
    };
  }, []);

  const etichetta = spento ? "Riattiva i suoni" : "Silenzia i suoni";

  return (
    <button
      type="button"
      className="fk-tema-btn"
      onClick={() => setSpento((s) => !s)}
      title={etichetta}
      aria-label={etichetta}
    >
      {spento ? <VolumeX size={15} /> : <Volume2 size={15} />}
    </button>
  );
}
