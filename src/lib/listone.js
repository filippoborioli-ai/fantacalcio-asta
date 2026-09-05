import { doc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "../firebase.js";

// Il listone (elenco giocatori Serie A) è condiviso tra tutte le aste create
// con questa app, non legato a una singola asta: si carica una volta e resta
// disponibile per sempre, anche per le stagioni future (basta ricaricare un
// nuovo file quando escono le nuove quotazioni).
const RIF_LISTONE = doc(db, "listoni", "seriea");

const RUOLI_VALIDI = new Set(["P", "D", "C", "A"]);

export function subscribeListone(callback) {
  return onSnapshot(
    RIF_LISTONE,
    (snap) => callback(snap.exists() ? snap.data() : null),
    () => callback(null)
  );
}

export async function salvaListone(giocatori) {
  await setDoc(RIF_LISTONE, {
    giocatori,
    numeroGiocatori: giocatori.length,
    aggiornatoIl: serverTimestamp(),
  });
}

// Legge un file Excel in formato "Quotazioni Fantacalcio" (fantacalcio.it e
// simili: fogli Tutti/Portieri/Difensori/... con colonne Id, R, RM, Nome,
// Squadra, ...) e restituisce l'elenco {nome, ruolo, squadra}.
export async function estraiGiocatoriDaFile(file) {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const nomeFoglio = wb.SheetNames.includes("Tutti") ? "Tutti" : wb.SheetNames[0];
  const ws = wb.Sheets[nomeFoglio];
  const righe = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  const indiceIntestazione = righe.findIndex(
    (r) => r.includes("Nome") && r.includes("Squadra") && r.includes("R")
  );
  if (indiceIntestazione === -1) {
    throw new Error(
      "Formato file non riconosciuto: mi aspetto le colonne Id, R, Nome, Squadra (esportazione quotazioni fantacalcio)."
    );
  }
  const intestazione = righe[indiceIntestazione];
  const idxRuolo = intestazione.indexOf("R");
  const idxNome = intestazione.indexOf("Nome");
  const idxSquadra = intestazione.indexOf("Squadra");

  const giocatori = [];
  const visti = new Set();
  for (let i = indiceIntestazione + 1; i < righe.length; i++) {
    const riga = righe[i];
    const ruolo = String(riga[idxRuolo] || "").trim().toUpperCase();
    const nome = String(riga[idxNome] || "").trim();
    const squadra = String(riga[idxSquadra] || "").trim();
    if (!nome || !RUOLI_VALIDI.has(ruolo)) continue;
    const chiave = `${nome}|${ruolo}`;
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    giocatori.push({ nome, ruolo, squadra });
  }
  if (giocatori.length === 0) {
    throw new Error("Nessun giocatore valido trovato nel file.");
  }
  return giocatori;
}

function normalizza(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Cerca per nome o cognome (o entrambi): "lautaro", "martinez" e
// "lautaro martinez" trovano tutti lo stesso giocatore.
export function cercaGiocatori(listone, query, limite = 8) {
  const q = normalizza(query.trim());
  if (q.length < 2 || !listone || listone.length === 0) return [];
  return listone.filter((g) => normalizza(g.nome).includes(q)).slice(0, limite);
}
