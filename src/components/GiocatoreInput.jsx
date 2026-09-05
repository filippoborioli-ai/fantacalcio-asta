import React, { useState, useRef } from "react";
import { RUOLI } from "../lib/model.js";
import { cercaGiocatori } from "../lib/listone.js";

// Campo "nome giocatore" con autocomplete dal listone Serie A: mentre scrivi
// propone i giocatori che combaciano (nome o cognome), e selezionandone uno
// si autocompilano nome e ruolo. Resta comunque un campo di testo libero:
// se il giocatore non è nel listone, si può scrivere il nome a mano.
export default function GiocatoreInput({
  value,
  onChangeValue,
  onPick,
  listone,
  placeholder,
  inputClassName,
}) {
  const [aperto, setAperto] = useState(false);
  const chiudiTimeout = useRef(null);

  const suggerimenti = aperto ? cercaGiocatori(listone, value || "") : [];

  return (
    <div className="gi-wrap">
      <input
        type="text"
        className={inputClassName}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChangeValue(e.target.value);
          setAperto(true);
        }}
        onFocus={() => setAperto(true)}
        onBlur={() => {
          // piccolo ritardo per far arrivare il click sul suggerimento
          chiudiTimeout.current = setTimeout(() => setAperto(false), 150);
        }}
      />
      {aperto && suggerimenti.length > 0 && (
        <ul className="gi-suggerimenti">
          {suggerimenti.map((g, i) => {
            const r = RUOLI.find((x) => x.key === g.ruolo);
            return (
              <li
                key={`${g.nome}-${i}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (chiudiTimeout.current) clearTimeout(chiudiTimeout.current);
                  onPick(g);
                  setAperto(false);
                }}
              >
                <span className="fk-chip" style={{ background: r?.colore }}>
                  {g.ruolo}
                </span>
                <span className="gi-nome">{g.nome}</span>
                <span className="gi-squadra">{g.squadra}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
