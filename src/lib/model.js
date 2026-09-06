export const RUOLI = [
  { key: "P", label: "Portieri", colore: "#F5C542" },
  { key: "D", label: "Difensori", colore: "#4EA8DE" },
  { key: "C", label: "Centrocampisti", colore: "#35D07F" },
  { key: "A", label: "Attaccanti", colore: "#FF6B45" },
];

export const defaultConfig = () => ({
  budget: 500,
  slot: { P: 3, D: 8, C: 8, A: 6 },
  countdownSec: 20,
});

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function occupati(squadra, ruolo) {
  return squadra.giocatori.filter((g) => g.ruolo === ruolo).length;
}

export function creditiSpesi(squadra) {
  return squadra.giocatori.reduce((s, g) => s + g.crediti, 0);
}

export function creditiResidui(squadra, budget) {
  return budget - creditiSpesi(squadra);
}

export function postiLiberiTotali(squadra, slotConfig) {
  return Object.keys(slotConfig).reduce(
    (s, r) => s + Math.max(0, slotConfig[r] - occupati(squadra, r)),
    0
  );
}

// Un giocatore può stare in una sola rosa: cerca se è già stato assegnato
// da qualche parte (confronto per nome, senza distinguere maiuscole/spazi).
export function trovaGiocatoreAssegnato(squadre, nome) {
  const target = nome.trim().toLowerCase();
  if (!target) return null;
  for (const s of squadre) {
    const g = s.giocatori.find((gg) => gg.nome.trim().toLowerCase() === target);
    if (g) return { squadraNome: s.nome, giocatore: g };
  }
  return null;
}
