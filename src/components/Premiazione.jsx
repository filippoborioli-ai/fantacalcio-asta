import React, { useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { calcolaPremi } from "../lib/premi.js";
import { suona } from "../lib/suoni.js";

// La cerimonia di premiazione. Si apre a fine serata (o quando si vuole
// sbirciare), ed è pensata per essere fotografata e buttata nel gruppo:
// una schermata sola, niente scroll infinito, i premi uno sotto l'altro.
export default function Premiazione({ squadre, storicoAcquisti, rilanci, budget, onChiudi }) {
  const premi = useMemo(
    () => calcolaPremi({ squadre, storicoAcquisti, rilanci, budget }),
    [squadre, storicoAcquisti, rilanci, budget]
  );

  useEffect(() => {
    suona("record");
  }, []);

  return (
    <div className="fk-premi-overlay" onClick={onChiudi}>
      <div className="fk-premi-box" onClick={(e) => e.stopPropagation()}>
        <button className="fk-premi-chiudi" onClick={onChiudi} aria-label="Chiudi">
          <X size={16} />
        </button>
        <span className="fk-premi-titolo">🏆 Gli Oscar dell'asta</span>

        {premi.length === 0 ? (
          <div className="fk-empty">
            <span className="fk-empty-emoji">🍿</span>
            Ancora troppo presto: comprate qualcuno e tornate qui.
          </div>
        ) : (
          <ul className="fk-premi-lista">
            {premi.map((p, i) => (
              <li key={p.titolo} style={{ animationDelay: `${i * 90}ms` }}>
                <span className="fk-premi-emoji">{p.emoji}</span>
                <span className="fk-premi-testi">
                  <span className="fk-premi-nome">{p.titolo}</span>
                  <span className="fk-premi-squadra">{p.squadra}</span>
                  <span className="fk-premi-dettaglio">{p.dettaglio}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
