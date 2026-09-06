import { creditiSpesi, creditiResidui } from "./model.js";

// Gli "Oscar dell'asta": premi scherzosi calcolati sui dati che l'asta ha già
// raccolto per conto suo (acquisti, prezzi, contatore rilanci). Nessun dato
// nuovo da salvare — è tutta roba che sta già nel documento.
//
// Ogni premio restituisce null quando non ha senso assegnarlo (nessun
// acquisto, parità che lo rende ridicolo, ecc.): meglio un premio in meno
// che un premio inventato.
export function calcolaPremi({ squadre, storicoAcquisti, rilanci, budget }) {
  const rose = squadre || [];
  const acquisti = storicoAcquisti || [];
  if (rose.length === 0) return [];

  const premi = [];
  const perSquadra = (id) => rose.find((s) => s.id === id);

  // 💸 Lo Sperperone: l'acquisto singolo più caro della serata.
  const piuCaro = acquisti.reduce((max, a) => (!max || a.crediti > max.crediti ? a : max), null);
  if (piuCaro && piuCaro.crediti > 1) {
    premi.push({
      emoji: "💸",
      titolo: "Lo Sperperone",
      squadra: piuCaro.squadraNome,
      dettaglio: `${piuCaro.crediti} crediti per ${piuCaro.nome}`,
    });
  }

  // 🪙 Il Braccino Corto: chi ha speso meno in tutta la serata, ma solo se
  // ha davvero comprato qualcuno (chi non ha preso nessuno non è taccagno).
  const conAcquisti = rose.filter((s) => s.giocatori.length > 0);
  if (conAcquisti.length >= 2) {
    const tirchio = conAcquisti.reduce((min, s) =>
      creditiSpesi(s) < creditiSpesi(min) ? s : min
    );
    premi.push({
      emoji: "🪙",
      titolo: "Il Braccino Corto",
      squadra: tirchio.nome,
      dettaglio: `${creditiSpesi(tirchio)} crediti spesi in tutto`,
    });
  }

  // 😤 Il Fastidioso: chi ha rilanciato di più. Il contatore esiste già,
  // alimentato a ogni offerta.
  const classificaRilanci = Object.entries(rilanci || {})
    .map(([id, n]) => ({ squadra: perSquadra(id), n }))
    .filter((x) => x.squadra && x.n > 0)
    .sort((a, b) => b.n - a.n);
  if (classificaRilanci.length > 0 && classificaRilanci[0].n >= 3) {
    premi.push({
      emoji: "😤",
      titolo: "Il Fastidioso",
      squadra: classificaRilanci[0].squadra.nome,
      dettaglio: `${classificaRilanci[0].n} rilanci in tutta la serata`,
    });
  }

  // 🎯 Il Cecchino: più giocatori presi a 1 credito. Chi riempie la rosa con
  // gli scarti e tiene i soldi per i pezzi grossi.
  const conteggioUno = {};
  acquisti.forEach((a) => {
    if (a.crediti === 1) conteggioUno[a.squadraNome] = (conteggioUno[a.squadraNome] || 0) + 1;
  });
  const cecchino = Object.entries(conteggioUno).sort((a, b) => b[1] - a[1])[0];
  if (cecchino && cecchino[1] >= 3) {
    premi.push({
      emoji: "🎯",
      titolo: "Il Cecchino",
      squadra: cecchino[0],
      dettaglio: `${cecchino[1]} giocatori presi a 1 credito`,
    });
  }

  // 🏦 Il Tesoriere: chi si è tenuto più crediti in tasca a fine serata.
  if (budget) {
    const riccone = rose.reduce((max, s) =>
      creditiResidui(s, budget) > creditiResidui(max, budget) ? s : max
    );
    const residui = creditiResidui(riccone, budget);
    if (residui > 0) {
      premi.push({
        emoji: "🏦",
        titolo: "Il Tesoriere",
        squadra: riccone.nome,
        dettaglio: `${residui} crediti mai spesi`,
      });
    }
  }

  // 👑 Il Nababbo: la rosa più costosa nel complesso.
  if (rose.length >= 2) {
    const nababbo = rose.reduce((max, s) => (creditiSpesi(s) > creditiSpesi(max) ? s : max));
    if (creditiSpesi(nababbo) > 0) {
      premi.push({
        emoji: "👑",
        titolo: "Il Nababbo",
        squadra: nababbo.nome,
        dettaglio: `${creditiSpesi(nababbo)} crediti bruciati in totale`,
      });
    }
  }

  // 🧊 Il Ghiacciolo: nessun rilancio in tutta la serata, e non per finta
  // (ha comprato lo stesso). Aspetta, prende quello che avanza e non litiga.
  const senzaRilanci = rose.filter(
    (s) => !(rilanci || {})[s.id] && s.giocatori.length > 0
  );
  if (senzaRilanci.length === 1 && rose.length >= 3) {
    premi.push({
      emoji: "🧊",
      titolo: "Il Ghiacciolo",
      squadra: senzaRilanci[0].nome,
      dettaglio: "Zero rilanci: ha preso solo chi nessuno voleva",
    });
  }

  return premi;
}
