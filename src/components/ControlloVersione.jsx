import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

// GitHub Pages serve index.html con "Cache-Control: max-age=600" e non lascia
// cambiare quell'header: per dieci minuti dopo un aggiornamento un F5 normale
// può ancora pescare la versione vecchia dalla cache del browser.
//
// Quindi il controllo lo fa l'app: ogni tanto chiede il file version.json
// (saltando la cache) e lo confronta con la versione che sta girando. Se non
// combaciano, propone di ricaricare — proporre, non farlo da solo: ricaricare
// di sorpresa mentre qualcuno sta rilanciando sarebbe peggio del problema.
const OGNI_MS = 90 * 1000;

export default function ControlloVersione() {
  const [nuova, setNuova] = useState(false);

  const controlla = useCallback(async () => {
    if (typeof __BUILD_ID__ === "undefined") return;
    try {
      const risposta = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!risposta.ok) return;
      const dati = await risposta.json();
      if (dati && dati.build && dati.build !== __BUILD_ID__) setNuova(true);
    } catch (e) {
      // offline o file assente (es. in sviluppo): si riprova al giro dopo
    }
  }, []);

  useEffect(() => {
    if (nuova) return; // trovata: inutile continuare a chiedere
    controlla();
    const id = setInterval(controlla, OGNI_MS);
    const alRitorno = () => {
      if (document.visibilityState === "visible") controlla();
    };
    document.addEventListener("visibilitychange", alRitorno);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", alRitorno);
    };
  }, [controlla, nuova]);

  if (!nuova) return null;

  return (
    <div className="fk-aggiornamento">
      <span>C'è una versione più recente dell'app.</span>
      <button onClick={() => window.location.reload()}>
        <RefreshCw size={13} /> Aggiorna
      </button>
    </div>
  );
}
