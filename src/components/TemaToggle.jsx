import React, { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { applicaTema, salvaTema, temaIniziale, temaSalvato, temaDiSistema } from "../lib/tema.js";

// Interruttore chiaro/scuro. Finché non si sceglie a mano, resta agganciato
// alla preferenza del sistema e la segue anche se cambia mentre l'app è aperta.
export default function TemaToggle({ compatto = false }) {
  const [tema, setTema] = useState(temaIniziale);

  useEffect(() => {
    applicaTema(tema);
  }, [tema]);

  useEffect(() => {
    if (temaSalvato()) return;
    let mq;
    try {
      mq = window.matchMedia("(prefers-color-scheme: light)");
    } catch (e) {
      return;
    }
    const aggiorna = () => {
      if (!temaSalvato()) setTema(temaDiSistema());
    };
    mq.addEventListener("change", aggiorna);
    return () => mq.removeEventListener("change", aggiorna);
  }, []);

  const cambia = () => {
    const nuovo = tema === "light" ? "dark" : "light";
    setTema(nuovo);
    salvaTema(nuovo);
  };

  const etichetta = tema === "light" ? "Passa al tema scuro" : "Passa al tema chiaro";

  return (
    <button
      type="button"
      className={compatto ? "fk-tema-btn fk-tema-btn-compatto" : "fk-tema-btn"}
      onClick={cambia}
      title={etichetta}
      aria-label={etichetta}
    >
      {tema === "light" ? <Moon size={15} /> : <Sun size={15} />}
    </button>
  );
}
