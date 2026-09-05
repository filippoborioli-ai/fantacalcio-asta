export const RUOLI = [
  { key: "P", label: "Portieri", colore: "#C99A2E" },
  { key: "D", label: "Difensori", colore: "#3B6E8F" },
  { key: "C", label: "Centrocampisti", colore: "#3B7A45" },
  { key: "A", label: "Attaccanti", colore: "#B8412B" },
];

export const defaultConfig = () => ({
  numSquadre: 8,
  budget: 500,
  slot: { P: 3, D: 8, C: 8, A: 6 },
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
