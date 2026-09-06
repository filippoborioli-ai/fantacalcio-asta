import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, onSnapshot, updateDoc, runTransaction } from "firebase/firestore";
import { db } from "../firebase.js";
import {
  RUOLI,
  defaultConfig,
  uid,
  occupati,
  creditiSpesi,
  creditiResidui,
  postiLiberiTotali,
  trovaGiocatoreAssegnato,
  creditiVisibili,
} from "../lib/model.js";
import { subscribeListone, salvaListone, estraiGiocatoriDaFile, normalizza } from "../lib/listone.js";
import GiocatoreInput from "../components/GiocatoreInput.jsx";
import TemaToggle from "../components/TemaToggle.jsx";
import {
  Trash2,
  AlertTriangle,
  Coins,
  ShieldCheck,
  Pencil,
  Check,
  X,
  Plus,
  Download,
  Upload,
  Crown,
  Copy,
  Eye,
  EyeOff,
  LogOut,
} from "lucide-react";
import * as XLSX from "xlsx";
import confetti from "canvas-confetti";

// Fuochi d'artificio quando un giocatore viene assegnato: raffica più
// grande e dorata per i top player (quotazione alta nel listone).
function spara(top) {
  const colori = top
    ? ["#FFC94D", "#FFE3A3", "#FFFFFF"]
    : ["#FF8A3D", "#B08CFF", "#FFC94D"];
  const base = { colors: colori, ticks: 420, gravity: 0.75, scalar: 1.1 };
  confetti({
    ...base,
    particleCount: top ? 150 : 90,
    spread: top ? 100 : 75,
    startVelocity: top ? 55 : 42,
    origin: { y: 0.3 },
  });
  // una seconda ondata più leggera qualche istante dopo, per far durare
  // la festa qualche secondo invece di un lampo solo
  setTimeout(
    () => confetti({ ...base, particleCount: top ? 70 : 40, spread: 90, startVelocity: 32, origin: { y: 0.35 } }),
    500
  );
  if (top) {
    setTimeout(
      () => confetti({ ...base, particleCount: 90, angle: 60, spread: 60, origin: { x: 0, y: 0.5 } }),
      200
    );
    setTimeout(
      () => confetti({ ...base, particleCount: 90, angle: 120, spread: 60, origin: { x: 1, y: 0.5 } }),
      350
    );
    setTimeout(
      () => confetti({ ...base, particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.5 } }),
      1000
    );
    setTimeout(
      () => confetti({ ...base, particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.5 } }),
      1150
    );
  }
}

// Piccoli suoni sintetizzati via WebAudio (niente file da caricare). Falliscono
// in silenzio se il browser blocca l'audio: mai un errore visibile per questo.
let audioCtx = null;
function suona(tipo) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const ora = audioCtx.currentTime;
    const note = (freq, inizio, durata, volume = 0.09) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ora + inizio);
      gain.gain.linearRampToValueAtTime(volume, ora + inizio + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, ora + inizio + durata);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(ora + inizio);
      osc.stop(ora + inizio + durata + 0.05);
    };
    if (tipo === "assegnato") {
      note(660, 0, 0.12);
      note(880, 0.1, 0.22);
    } else if (tipo === "top") {
      note(523, 0, 0.1);
      note(659, 0.09, 0.1);
      note(880, 0.18, 0.3);
    } else if (tipo === "rush") {
      note(740, 0, 0.08, 0.06);
    } else if (tipo === "superato") {
      note(300, 0, 0.16, 0.07);
      note(220, 0.1, 0.2, 0.07);
    } else if (tipo === "squadra") {
      note(587, 0, 0.1, 0.07);
      note(784, 0.08, 0.18, 0.07);
    } else if (tipo === "lancio") {
      note(500, 0, 0.06, 0.05);
      note(340, 0.05, 0.08, 0.05);
    } else if (tipo === "colpito") {
      note(180, 0, 0.18, 0.08);
    }
  } catch (e) {
    // audio non disponibile: nessun problema, l'app funziona lo stesso
  }
}

export default function AstaRoom() {
  const { codice } = useParams();
  const ref = useMemo(() => doc(db, "aste", codice), [codice]);

  const [stato, setStato] = useState(null);
  const [notFound, setNotFound] = useState(false);

  const [tab, setTab] = useState("setup");
  const [configDraft, setConfigDraft] = useState(defaultConfig());
  const draftInitRef = useRef(false);

  const [deviceRole, setDeviceRoleState] = useState(() => {
    try {
      const raw = localStorage.getItem(`fantacalcio-ruolo-${codice}`);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  });

  const [errore, setErrore] = useState("");
  const [quickAdd, setQuickAdd] = useState({});
  const [quickErr, setQuickErr] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [liveForm, setLiveForm] = useState({ nome: "", ruolo: "P", offertaBase: "1" });
  // Vuoto = rilancia di +1 (il default). Un numero scritto qui vince: il
  // pulsante rilancia a quella quota finale invece che al minimo.
  const [bidValue, setBidValue] = useState("");
  const [liveErr, setLiveErr] = useState("");
  const [copiato, setCopiato] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamErr, setNewTeamErr] = useState("");
  const [listoneDoc, setListoneDoc] = useState(null);
  const [caricandoListone, setCaricandoListone] = useState(false);
  const [listoneErr, setListoneErr] = useState("");
  const [secondiRimanenti, setSecondiRimanenti] = useState(null);
  const [dispRuolo, setDispRuolo] = useState("TUTTI");
  const [dispQuery, setDispQuery] = useState("");
  const [pannello, setPannello] = useState("ultimi");
  const [sbloccaImpostazioni, setSbloccaImpostazioni] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [inRush, setInRush] = useState(false);
  const [superato, setSuperato] = useState(false);
  const [lanci, setLanci] = useState([]);
  const [colpito, setColpito] = useState(false);
  const prevGiocatoriIdsRef = useRef(null);
  const prevSquadraIdsRef = useRef(null);
  const prevAstaLiveRef = useRef(null);
  const prevLancioIdRef = useRef(null);
  const lancioInizializzatoRef = useRef(false);
  const tabInitRef = useRef(false);
  const inRushRef = useRef(false);

  const aggiungiToast = useCallback((toast) => {
    const id = uid();
    const durata = toast.durata || 6500;
    setToasts((t) => [...t.slice(-2), { id, ...toast }]);
    setTimeout(
      () => setToasts((t) => t.map((x) => (x.id === id ? { ...x, uscendo: true } : x))),
      Math.max(0, durata - 450)
    );
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), durata);
  }, []);

  // Sottoscrizione realtime al documento dell'asta
  useEffect(() => {
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setNotFound(true);
          return;
        }
        setStato(snap.data());
      },
      () => setNotFound(true)
    );
    return () => unsub();
  }, [ref]);

  // Listone Serie A: condiviso tra tutte le aste, non serve ricaricarlo ogni
  // volta né aggiornare il codice ogni stagione, basta ricaricare il file.
  useEffect(() => subscribeListone(setListoneDoc), []);
  const listone = listoneDoc?.giocatori || [];

  const caricaListone = async (file) => {
    setListoneErr("");
    setCaricandoListone(true);
    try {
      const giocatori = await estraiGiocatoriDaFile(file);
      await salvaListone(giocatori);
    } catch (e) {
      setListoneErr(e.message || "Errore nella lettura del file.");
    } finally {
      setCaricandoListone(false);
    }
  };

  // Inizializzo le bozze di configurazione (solo se l'asta non è ancora iniziata) una sola volta.
  // Se l'asta è già partita, si riapre direttamente su "Asta Live" invece che
  // su "Impostazioni": è la scheda che serve davvero durante la serata.
  useEffect(() => {
    if (stato && !draftInitRef.current) {
      setConfigDraft({ ...defaultConfig(), ...(stato.config || {}) });
      draftInitRef.current = true;
    }
    if (stato && stato.squadre !== null && !tabInitRef.current) {
      setTab("live");
      tabInitRef.current = true;
    }
  }, [stato]);

  const impostaRuoloDispositivo = useCallback(
    (ruolo) => {
      setDeviceRoleState(ruolo);
      try {
        localStorage.setItem(`fantacalcio-ruolo-${codice}`, JSON.stringify(ruolo));
      } catch (e) {
        // se non si salva, resta valido solo per questa sessione del browser
      }
    },
    [codice]
  );

  const asta_iniziata = !!(stato && stato.squadre !== null);
  const config = asta_iniziata ? stato.config : configDraft;
  const squadre = asta_iniziata ? stato.squadre : null;
  const astaLive = stato?.astaLive || null;

  // A ogni cambio dell'offerta corrente (proprio o altrui) o nuovo giocatore,
  // il box torna vuoto: si riparte dal default (+1) invece di tenersi in
  // mano una quota finale che non ha più senso col nuovo numero.
  useEffect(() => {
    setBidValue("");
  }, [astaLive?.id, astaLive?.offertaCorrente]);

  // Giocatori del listone non ancora assegnati a nessuna squadra: utile per
  // vedere in un colpo d'occhio chi manca ancora da mettere all'asta.
  const giocatoriDisponibili = useMemo(() => {
    if (!listone.length) return [];
    const assegnati = new Set();
    (squadre || []).forEach((s) =>
      s.giocatori.forEach((g) => assegnati.add(normalizza(g.nome)))
    );
    const q = normalizza(dispQuery.trim());
    return listone
      .filter((g) => dispRuolo === "TUTTI" || g.ruolo === dispRuolo)
      .filter((g) => !assegnati.has(normalizza(g.nome)))
      .filter((g) => !q || normalizza(g.nome).includes(q))
      .sort((a, b) => b.quotazione - a.quotazione || a.nome.localeCompare(b.nome));
  }, [listone, squadre, dispRuolo, dispQuery]);

  // Dati del pannello laterale dell'asta live.
  const ultimiAcquisti = useMemo(
    () => (stato?.storicoAcquisti || []).slice().reverse(),
    [stato?.storicoAcquisti]
  );

  const topAcquisti = useMemo(() => {
    const tutti = [];
    (squadre || []).forEach((s) =>
      s.giocatori.forEach((g) => tutti.push({ ...g, squadraNome: s.nome }))
    );
    return tutti.sort((a, b) => b.crediti - a.crediti).slice(0, 20);
  }, [squadre]);

  const classificaRilanci = useMemo(() => {
    const conteggi = stato?.rilanci || {};
    return (squadre || [])
      .map((s) => ({ id: s.id, nome: s.nome, rilanci: conteggi[s.id] || 0 }))
      .sort((a, b) => b.rilanci - a.rilanci);
  }, [squadre, stato?.rilanci]);

  // Festeggiamento: appena un giocatore viene assegnato (da qualunque
  // dispositivo), tutti quelli connessi lo vedono e partono i fuochi
  // d'artificio — confronto gli id dei giocatori in rosa prima/dopo lo
  // snapshot per scoprire chi si è appena aggiudicato chi.
  useEffect(() => {
    if (!squadre) return;
    const idsAttuali = new Set();
    squadre.forEach((s) => s.giocatori.forEach((g) => idsAttuali.add(g.id)));
    const idsPrima = prevGiocatoriIdsRef.current;
    if (idsPrima) {
      for (const s of squadre) {
        const nuovo = s.giocatori.find((g) => !idsPrima.has(g.id));
        if (nuovo) {
          const inListone = listone.find((g) => normalizza(g.nome) === normalizza(nuovo.nome));
          const top = !!inListone && inListone.quotazione >= 25;
          aggiungiToast({
            tipo: top ? "giocatore-top" : "giocatore",
            emoji: top ? "🏆" : "🎉",
            titolo: (
              <>
                <strong>{nuovo.nome}</strong> a <strong>{s.nome}</strong>
              </>
            ),
            sub: `${nuovo.crediti} crediti`,
          });
          spara(top);
          suona(top ? "top" : "assegnato");
          break;
        }
      }
    }
    prevGiocatoriIdsRef.current = idsAttuali;
  }, [squadre, listone, aggiungiToast]);

  // Nuova squadra iscritta: piccolo benvenuto per tutti, così si sente che
  // la lega si sta riempiendo.
  useEffect(() => {
    if (!squadre) return;
    const idsAttuali = new Set(squadre.map((s) => s.id));
    const idsPrima = prevSquadraIdsRef.current;
    if (idsPrima) {
      const nuova = squadre.find((s) => !idsPrima.has(s.id));
      if (nuova) {
        aggiungiToast({
          tipo: "squadra",
          emoji: "🎊",
          titolo: (
            <>
              <strong>{nuova.nome}</strong> è entrata in lega
            </>
          ),
          sub: "In bocca al lupo!",
        });
        suona("squadra");
      }
    }
    prevSquadraIdsRef.current = idsAttuali;
  }, [squadre, aggiungiToast]);

  // Asta chiusa senza offerte, o superato mentre ero in testa: confronto lo
  // stato precedente di astaLive per accorgermi di entrambe le cose. "Sei
  // stato superato" è locale al dispositivo interessato (dipende da deviceRole).
  useEffect(() => {
    const prima = prevAstaLiveRef.current;
    if (prima && prima.attiva) {
      if (!astaLive?.attiva && prima.giocatore && !prima.squadraOfferenteId) {
        aggiungiToast({
          tipo: "passato",
          emoji: "😮‍💨",
          titolo: (
            <>
              Nessuno ha voluto <strong>{prima.giocatore}</strong>
            </>
          ),
          sub: "Torna tra i disponibili",
        });
      } else if (
        astaLive?.attiva &&
        astaLive.giocatore === prima.giocatore &&
        prima.squadraOfferenteId === deviceRole &&
        astaLive.squadraOfferenteId !== deviceRole &&
        astaLive.squadraOfferenteId
      ) {
        aggiungiToast({
          tipo: "superato",
          emoji: "⚡",
          titolo: <strong>Sei stato superato!</strong>,
          sub: `${astaLive.squadraOfferenteNome} ha rilanciato a ${astaLive.offertaCorrente}`,
          durata: 5000,
        });
        suona("superato");
        setSuperato(true);
        setTimeout(() => setSuperato(false), 650);
      }
    }
    prevAstaLiveRef.current = astaLive;
  }, [astaLive, deviceRole, aggiungiToast]);

  // Lancio oggetti in stile "tavolo da poker": una squadra ne prende in giro
  // un'altra (o la applaude) lanciandole un'emoji. Un solo campo condiviso
  // sull'asta, tutti i dispositivi lo vedono volare in tempo reale.
  const lanciaOggetto = useCallback(
    async (aId, aNome, emoji) => {
      const mia = (squadre || []).find((s) => s.id === deviceRole);
      if (!mia) return;
      try {
        await updateDoc(ref, {
          lancio: { id: uid(), daId: mia.id, daNome: mia.nome, aId, aNome, emoji, ts: Date.now() },
        });
      } catch (e) {
        // se fallisce non è grave, è solo goliardia
      }
    },
    [ref, squadre, deviceRole]
  );

  useEffect(() => {
    const l = stato?.lancio;
    // Prima esecuzione: fotografo lo stato attuale come base, senza animare
    // (evita di far volare all'apertura pagina un lancio già vecchio).
    if (!lancioInizializzatoRef.current) {
      lancioInizializzatoRef.current = true;
      prevLancioIdRef.current = l ? l.id : null;
      return;
    }
    if (l && l.id !== prevLancioIdRef.current) {
      const localId = uid();
      setLanci((arr) => [...arr.slice(-2), { ...l, localId }]);
      suona("lancio");
      setTimeout(() => setLanci((arr) => arr.filter((x) => x.localId !== localId)), 2600);
      if (l.aId === deviceRole) {
        setColpito(true);
        suona("colpito");
        setTimeout(() => setColpito(false), 550);
      }
      prevLancioIdRef.current = l.id;
    }
  }, [stato?.lancio, deviceRole]);

  // "Rush": due rilanci ravvicinati di fila accendono l'effetto visivo, si
  // spegne da solo se i rilanci rallentano.
  useEffect(() => {
    const storico = astaLive?.storico;
    if (!storico || storico.length < 2) {
      setInRush(false);
      return;
    }
    const ultimo = storico[storico.length - 1].ts;
    const penultimo = storico[storico.length - 2].ts;
    const acceso = ultimo - penultimo < 4000 && Date.now() - ultimo < 6000;
    if (acceso && !inRushRef.current) suona("rush");
    inRushRef.current = acceso;
    setInRush(acceso);
    if (acceso) {
      const id = setTimeout(() => setInRush(false), 6000);
      return () => clearTimeout(id);
    }
  }, [astaLive?.storico]);

  const iniziaAsta = async () => {
    // Nessuna squadra all'inizio: chi entra con il codice si registra da
    // solo con il nome della propria squadra, dalla scheda "Asta Live".
    await updateDoc(ref, {
      config: configDraft,
      squadre: [],
    });
    setTab("live");
  };

  const sblocca = () => {
    setConfigDraft({ ...defaultConfig(), ...stato.config });
    setSbloccaImpostazioni(true);
  };

  const salvaImpostazioni = async () => {
    await updateDoc(ref, { config: configDraft });
    setSbloccaImpostazioni(false);
  };

  // Assegnazioni transazionali: leggono lo stato più fresco dal server prima di scrivere,
  // così due assegnazioni quasi simultanee non si sovrascrivono a vicenda.
  const assegnaGiocatore = useCallback(
    async (squadraId, ruolo, nomeRaw, creditiRaw) => {
      const nome = nomeRaw.trim();
      const crediti = parseInt(creditiRaw, 10);
      if (!nome) return "Inserisci il nome del giocatore.";
      if (!squadraId) return "Seleziona la squadra aggiudicataria.";
      if (!Number.isFinite(crediti) || crediti < 1)
        return "Inserisci un numero di crediti valido (minimo 1).";
      try {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          const dati = snap.data();
          const squadra = dati.squadre.find((s) => s.id === squadraId);
          if (!squadra) throw new Error("Squadra non trovata.");
          const giaAssegnato = trovaGiocatoreAssegnato(dati.squadre, nome);
          if (giaAssegnato) {
            throw new Error(
              `${nome} è già in rosa a ${giaAssegnato.squadraNome} (${giaAssegnato.giocatore.crediti} crediti).`
            );
          }
          if (occupati(squadra, ruolo) >= dati.config.slot[ruolo]) {
            throw new Error(
              `${squadra.nome} ha già completato il reparto ${RUOLI.find((r) => r.key === ruolo).label.toLowerCase()}.`
            );
          }
          const residui = creditiResidui(squadra, dati.config.budget);
          const postiLiberi = postiLiberiTotali(squadra, dati.config.slot);
          const maxAmmessi = residui - Math.max(0, postiLiberi - 1);
          if (crediti > maxAmmessi) {
            if (postiLiberi > 1) {
              throw new Error(
                `${squadra.nome} deve lasciare almeno 1 credito per ciascuno degli altri ${postiLiberi - 1} posti ancora liberi in rosa: può spendere al massimo ${maxAmmessi}.`
              );
            }
            throw new Error(`Crediti insufficienti: ${squadra.nome} ha solo ${residui} crediti residui.`);
          }
          const nuovoGiocatore = { id: uid(), nome, ruolo, crediti };
          const nuoveSquadre = dati.squadre.map((s) =>
            s.id === squadra.id ? { ...s, giocatori: [...s.giocatori, nuovoGiocatore] } : s
          );
          // Storico globale degli acquisti: serve al pannello "ultimi acquisti"
          // (l'ordine dentro le singole rose non dice chi è arrivato prima).
          const storico = [
            ...(dati.storicoAcquisti || []),
            {
              giocatoreId: nuovoGiocatore.id,
              nome,
              ruolo,
              crediti,
              squadraId: squadra.id,
              squadraNome: squadra.nome,
              ts: Date.now(),
            },
          ].slice(-60);
          tx.update(ref, { squadre: nuoveSquadre, storicoAcquisti: storico });
        });
        return null;
      } catch (e) {
        return e.message || "Errore nell'assegnazione.";
      }
    },
    [ref]
  );

  const handleQuickAdd = useCallback(
    async (squadraId) => {
      const qa = quickAdd[squadraId] || { nome: "", ruolo: "P", crediti: "" };
      const err = await assegnaGiocatore(squadraId, qa.ruolo, qa.nome, qa.crediti);
      setQuickErr((e) => ({ ...e, [squadraId]: err }));
      if (!err) {
        setQuickAdd((q) => ({ ...q, [squadraId]: { nome: "", ruolo: qa.ruolo, crediti: "" } }));
      }
    },
    [quickAdd, assegnaGiocatore]
  );

  const setQuick = (squadraId, patch) =>
    setQuickAdd((q) => ({
      ...q,
      [squadraId]: { ...(q[squadraId] || { nome: "", ruolo: "P", crediti: "" }), ...patch },
    }));

  const modificaCrediti = useCallback(
    async (squadraId, giocatoreId, nuoviCreditiRaw) => {
      const nuoviCrediti = parseInt(nuoviCreditiRaw, 10);
      if (!Number.isFinite(nuoviCrediti) || nuoviCrediti < 1)
        return "Inserisci un numero di crediti valido (minimo 1).";
      try {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          const dati = snap.data();
          const squadra = dati.squadre.find((s) => s.id === squadraId);
          if (!squadra) throw new Error("Squadra non trovata.");
          const giocatore = squadra.giocatori.find((g) => g.id === giocatoreId);
          if (!giocatore) throw new Error("Giocatore non trovato.");
          const spesiAltri = creditiSpesi(squadra) - giocatore.crediti;
          // Il posto di questo giocatore è già occupato: la riserva va sui posti ANCORA vuoti.
          const postiLiberi = postiLiberiTotali(squadra, dati.config.slot);
          const maxAmmesso = dati.config.budget - spesiAltri - postiLiberi;
          if (nuoviCrediti > maxAmmesso) {
            if (postiLiberi > 0) {
              throw new Error(
                `Puoi assegnare al massimo ${maxAmmesso} crediti: bisogna lasciare almeno 1 credito per ciascuno degli altri ${postiLiberi} posti ancora liberi in rosa.`
              );
            }
            throw new Error(
              `Puoi assegnare al massimo ${maxAmmesso} crediti a questo giocatore, oltre il budget totale della squadra.`
            );
          }
          const nuoveSquadre = dati.squadre.map((s) =>
            s.id === squadraId
              ? {
                  ...s,
                  giocatori: s.giocatori.map((g) =>
                    g.id === giocatoreId ? { ...g, crediti: nuoviCrediti } : g
                  ),
                }
              : s
          );
          tx.update(ref, { squadre: nuoveSquadre });
        });
        return null;
      } catch (e) {
        return e.message || "Errore nella modifica.";
      }
    },
    [ref]
  );

  const rimuoviGiocatore = useCallback(
    async (squadraId, giocatoreId) => {
      try {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          const dati = snap.data();
          const nuoveSquadre = dati.squadre.map((s) =>
            s.id === squadraId
              ? { ...s, giocatori: s.giocatori.filter((g) => g.id !== giocatoreId) }
              : s
          );
          const storico = (dati.storicoAcquisti || []).filter(
            (a) => a.giocatoreId !== giocatoreId
          );
          tx.update(ref, { squadre: nuoveSquadre, storicoAcquisti: storico });
        });
      } catch (e) {
        setErrore(e.message || "Errore nella rimozione.");
      }
    },
    [ref]
  );

  const esportaExcel = useCallback(() => {
    const rose = [];
    squadre.forEach((s) => {
      RUOLI.forEach((r) => {
        s.giocatori
          .filter((g) => g.ruolo === r.key)
          .forEach((g) => {
            rose.push({ Squadra: s.nome, Ruolo: r.label, Giocatore: g.nome, Crediti: g.crediti });
          });
      });
    });
    const riepilogo = squadre.map((s) => ({
      Squadra: s.nome,
      "Crediti spesi": creditiSpesi(s),
      "Crediti residui": config.budget - creditiSpesi(s),
      "Giocatori in rosa": s.giocatori.length,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(riepilogo), "Riepilogo");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rose), "Rose");
    XLSX.writeFile(wb, `asta-fantacalcio-${codice}.xlsx`);
  }, [squadre, config, codice]);

  // --- Asta live: scritture transazionali, aggiornamenti in push reale via onSnapshot ---
  const avviaAstaLive = useCallback(async () => {
    setLiveErr("");
    const nome = liveForm.nome.trim();
    const base = parseInt(liveForm.offertaBase, 10);
    const durata = Math.max(5, Math.min(300, parseInt(config.countdownSec, 10) || 20));
    if (!nome) return setLiveErr("Inserisci il nome del giocatore.");
    if (!Number.isFinite(base) || base < 1) return setLiveErr("Offerta di partenza non valida.");
    const giaAssegnato = trovaGiocatoreAssegnato(squadre || [], nome);
    if (giaAssegnato) {
      return setLiveErr(
        `${nome} è già in rosa a ${giaAssegnato.squadraNome} (${giaAssegnato.giocatore.crediti} crediti).`
      );
    }
    await updateDoc(ref, {
      astaLive: {
        id: uid(),
        attiva: true,
        giocatore: nome,
        ruolo: liveForm.ruolo,
        offertaCorrente: base,
        squadraOfferenteId: null,
        squadraOfferenteNome: null,
        storico: [],
        durataSecondi: durata,
        scadenza: Date.now() + durata * 1000,
      },
    });
    setLiveForm((f) => ({ ...f, nome: "" }));
  }, [liveForm, ref, squadre, config]);

  const annullaAstaLive = useCallback(async () => {
    await updateDoc(ref, {
      astaLive: {
        attiva: false,
        giocatore: "",
        ruolo: "P",
        offertaCorrente: 0,
        squadraOfferenteId: null,
        squadraOfferenteNome: null,
        storico: [],
        durataSecondi: 0,
        scadenza: null,
      },
    });
  }, [ref]);

  const assegnaEChiudiAstaLive = useCallback(async () => {
    setLiveErr("");
    if (!astaLive || !astaLive.attiva) return;
    if (!astaLive.squadraOfferenteId) return setLiveErr("Nessuna offerta ricevuta ancora.");
    const err = await assegnaGiocatore(
      astaLive.squadraOfferenteId,
      astaLive.ruolo,
      astaLive.giocatore,
      String(astaLive.offertaCorrente)
    );
    if (err) return setLiveErr(err);
    await annullaAstaLive();
  }, [astaLive, assegnaGiocatore, annullaAstaLive]);

  const faiOfferta = useCallback(
    async (valoreRaw) => {
      setLiveErr("");
      const valore = parseInt(valoreRaw, 10);
      if (!Number.isFinite(valore) || valore < 1) return setLiveErr("Offerta non valida.");
      try {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          const dati = snap.data();
          const live = dati.astaLive;
          if (!live || !live.attiva) throw new Error("Nessuna asta attiva al momento.");
          const squadra = dati.squadre.find((s) => s.id === deviceRole);
          if (!squadra) throw new Error("Squadra non riconosciuta su questo dispositivo.");
          if (occupati(squadra, live.ruolo) >= dati.config.slot[live.ruolo]) {
            throw new Error(
              `Hai già completato il reparto ${RUOLI.find((r) => r.key === live.ruolo).label.toLowerCase()}.`
            );
          }
          const residui = creditiResidui(squadra, dati.config.budget);
          const postiLiberi = postiLiberiTotali(squadra, dati.config.slot);
          const maxOfferta = residui - Math.max(0, postiLiberi - 1);
          if (valore > maxOfferta) {
            if (postiLiberi > 1) {
              throw new Error(
                `Devi lasciare almeno 1 credito per ciascuno degli altri ${postiLiberi - 1} posti ancora liberi in rosa: puoi offrire al massimo ${maxOfferta}.`
              );
            }
            throw new Error(`Non hai abbastanza crediti (residui: ${residui}).`);
          }
          if (valore <= live.offertaCorrente)
            throw new Error(`Qualcuno ha già offerto ${live.offertaCorrente}: rilancia più alto.`);
          const nuovoLive = {
            ...live,
            offertaCorrente: valore,
            squadraOfferenteId: squadra.id,
            squadraOfferenteNome: squadra.nome,
            scadenza: Date.now() + (live.durataSecondi || 20) * 1000,
            storico: [
              ...(live.storico || []),
              { squadraNome: squadra.nome, valore, ts: Date.now() },
            ].slice(-20),
          };
          // Contatore rilanci per squadra: alimenta la classifica "più
          // fastidioso" (chi rilancia di più durante tutta l'asta).
          const rilanci = { ...(dati.rilanci || {}) };
          rilanci[squadra.id] = (rilanci[squadra.id] || 0) + 1;
          tx.update(ref, { astaLive: nuovoLive, rilanci });
        });
        setBidValue("");
      } catch (e) {
        setLiveErr(e.message || "Errore nell'invio dell'offerta.");
      }
    },
    [ref, deviceRole]
  );

  // Countdown dell'asta live: ogni dispositivo tiene il proprio timer locale
  // in base a "scadenza" (sincronizzata da Firestore, si resetta a ogni
  // rilancio). Allo scadere: assegna a chi è in testa, o annulla se nessuno
  // ha offerto. Sicuro anche se più dispositivi lo fanno insieme: chi arriva
  // secondo trova il giocatore già assegnato (o l'asta già chiusa) e non fa
  // danni.
  useEffect(() => {
    if (!astaLive || !astaLive.attiva || !astaLive.scadenza) {
      setSecondiRimanenti(null);
      return;
    }
    const tick = () => {
      const rimasti = Math.max(0, Math.ceil((astaLive.scadenza - Date.now()) / 1000));
      setSecondiRimanenti(rimasti);
      if (rimasti <= 0) {
        if (astaLive.squadraOfferenteId) {
          assegnaEChiudiAstaLive();
        } else {
          annullaAstaLive();
        }
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [astaLive?.scadenza, astaLive?.attiva, astaLive?.squadraOfferenteId, assegnaEChiudiAstaLive, annullaAstaLive]);

  // Registrazione self-service: chi entra con il codice crea la propria
  // squadra al volo con il nome che preferisce (transazionale, così due
  // persone che premono insieme non si sovrascrivono a vicenda).
  const aggiungiSquadra = useCallback(async () => {
    const nome = newTeamName.trim();
    if (!nome) return setNewTeamErr("Inserisci un nome per la tua squadra.");
    let nuovoId = null;
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const dati = snap.data();
        if (dati.squadre.some((s) => s.nome.toLowerCase() === nome.toLowerCase())) {
          throw new Error("Esiste già una squadra con questo nome: scegline un altro.");
        }
        nuovoId = uid();
        const nuovaSquadra = { id: nuovoId, nome, giocatori: [] };
        tx.update(ref, { squadre: [...dati.squadre, nuovaSquadra] });
      });
      setNewTeamErr("");
      setNewTeamName("");
      impostaRuoloDispositivo(nuovoId);
    } catch (e) {
      setNewTeamErr(e.message || "Errore nella creazione della squadra.");
    }
  }, [newTeamName, ref, impostaRuoloDispositivo]);

  // Visibilità dei propri crediti verso le altre squadre. Transazionale come
  // il resto: due dispositivi che scrivono insieme non si sovrascrivono.
  const cambiaVisibilitaCrediti = useCallback(
    async (squadraId, visibili) => {
      try {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          const dati = snap.data();
          const nuoveSquadre = dati.squadre.map((s) =>
            s.id === squadraId ? { ...s, creditiVisibili: visibili } : s
          );
          tx.update(ref, { squadre: nuoveSquadre });
        });
      } catch (e) {
        setErrore(e.message || "Non sono riuscito a cambiare la visibilità dei crediti.");
      }
    },
    [ref]
  );

  const copiaCodice = () => {
    try {
      navigator.clipboard.writeText(codice);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 1500);
    } catch (e) {
      // niente clipboard disponibile, l'utente può selezionare il codice a mano
    }
  };

  if (notFound) {
    return (
      <div className="fk-root">
        <div className="not-found">
          <h1>Codice non trovato</h1>
          <p>Controlla di aver scritto giusto il codice, oppure crea una nuova asta.</p>
          <Link to="/" className="fk-primary" style={{ display: "inline-block", textDecoration: "none" }}>
            Torna alla home
          </Link>
        </div>
      </div>
    );
  }

  if (!stato) return null;

  // Prima di vedere l'asta, chi entra con il codice deve dire chi è: così
  // registra subito la propria squadra, invece di trovarsi il cruscotto e
  // doverlo scoprire da solo dentro "Asta Live". Non c'è un ruolo admin: fa
  // tutto chiunque, come in un'asta vera tra amici.
  if (asta_iniziata && deviceRole === null) {
    return (
      <div className="home-root">
        <div className="home-topbar">
          <TemaToggle />
        </div>
        <div className="home-inner">
          <span className="home-badge">⚽</span>
          <h1>{stato.nome || "Asta del Fanta"}</h1>
          <p className="home-sub">
            Prima di entrare, dicci chi sei. La scelta resta su questo dispositivo.
          </p>

          {squadre.length > 0 && (
            <div className="home-card">
              <h2>Sono già iscritto</h2>
              <p>Tocca la tua squadra per riprendere il posto.</p>
              <div className="fk-choice-grid">
                {squadre.map((s) => (
                  <button key={s.id} className="fk-choice" onClick={() => impostaRuoloDispositivo(s.id)}>
                    {s.nome}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="home-card">
            <h2>Entro adesso</h2>
            <p>Scegli il nome della tua squadra: entra subito in lega.</p>
            <input
              type="text"
              placeholder="Nome della tua squadra"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && aggiungiSquadra()}
            />
            <button className="home-primary" onClick={aggiungiSquadra}>
              Crea la mia squadra
            </button>
            {newTeamErr && (
              <p className="fk-error fk-error-small">
                <AlertTriangle size={12} /> {newTeamErr}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={[
        "fk-root",
        tab === "live" ? "fk-root-live" : "",
        colpito ? "fk-root-colpito" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {lanci.map((l) => (
        <div key={l.localId} className="fk-lancio-fly">
          <span className="fk-lancio-fly-emoji">{l.emoji}</span>
          <span className="fk-lancio-fly-caption">
            {l.aId === deviceRole
              ? `${l.daNome} l'ha lanciato a TE!`
              : l.daId === deviceRole
              ? `Hai colpito ${l.aNome}!`
              : `${l.daNome} → ${l.aNome}`}
          </span>
        </div>
      ))}
      <div className="fk-toast-stack">
        {toasts.map((t, i) => (
          <div
            key={t.id}
            className={`fk-toast fk-toast-${t.tipo}${t.uscendo ? " fk-toast-uscendo" : ""}`}
            style={{ "--i": i }}
          >
            <span className="fk-toast-emoji">{t.emoji}</span>
            <div>
              <div className="fk-toast-title">{t.titolo}</div>
              {t.sub && <div className="fk-toast-sub">{t.sub}</div>}
            </div>
          </div>
        ))}
      </div>
      <header className="fk-header">
        <div className="fk-headbar">
          <div className="fk-brand">
            <h1>{stato.nome || "Asta del Fanta"}</h1>
            <p className="fk-sub">
              {asta_iniziata
                ? `${squadre.length} squadre · ${config.budget} crediti · P${config.slot.P} D${config.slot.D} C${config.slot.C} A${config.slot.A}`
                : "Configura l'asta qui sotto"}
            </p>
          </div>

          <nav className="fk-tabs">
            <button
              className={tab === "live" ? "fk-tab fk-tab-active" : "fk-tab"}
              onClick={() => asta_iniziata && setTab("live")}
              disabled={!asta_iniziata}
            >
              🔴 Asta Live
            </button>
            <button
              className={tab === "squadre" ? "fk-tab fk-tab-active" : "fk-tab"}
              onClick={() => asta_iniziata && setTab("squadre")}
              disabled={!asta_iniziata}
            >
              Squadre
            </button>
            <button
              className={tab === "disponibili" ? "fk-tab fk-tab-active" : "fk-tab"}
              onClick={() => asta_iniziata && setTab("disponibili")}
              disabled={!asta_iniziata}
            >
              Disponibili
            </button>
            <button
              className={tab === "setup" ? "fk-tab fk-tab-active" : "fk-tab"}
              onClick={() => setTab("setup")}
            >
              Impostazioni
            </button>
            {asta_iniziata && (
              <button className="fk-secondary fk-export-nav" onClick={esportaExcel}>
                <Download size={14} /> <span>Excel</span>
              </button>
            )}
          </nav>

          <div className="fk-topbar-right">
            <TemaToggle />
            <button className="fk-code-badge" onClick={copiaCodice} title="Copia il codice">
              <strong>{codice}</strong>
              {copiato ? <Check size={13} /> : <Copy size={13} />}
            </button>
            <Link to="/" className="fk-exit" title="Esci dall'asta">
              <LogOut size={14} />
            </Link>
          </div>
        </div>
      </header>

      <main className={tab === "live" ? "fk-main fk-main-live" : "fk-main"}>
        {tab === "setup" && (
          <div className="fk-setup-grid">
          <section className="fk-card fk-setup">
            {asta_iniziata && !sbloccaImpostazioni && (
              <div className="fk-notice">
                <ShieldCheck size={16} />
                L'asta è già iniziata: le impostazioni sono bloccate per evitare modifiche per sbaglio.{" "}
                <button className="fk-link-btn" onClick={sblocca} style={{ marginLeft: 4 }}>
                  Modifica impostazioni
                </button>
              </div>
            )}
            <span className="fk-section-label">Regole dell'asta</span>
            {(() => {
              const bloccato = asta_iniziata && !sbloccaImpostazioni;
              return (
                <>
                  {asta_iniziata && sbloccaImpostazioni && (
                    <p className="fk-warn" style={{ marginBottom: 10 }}>
                      Attenzione: cambiare crediti o slot ora non tocca i giocatori già assegnati,
                      solo i controlli sulle prossime assegnazioni.
                    </p>
                  )}
                  <div className="fk-field-row">
                    <label>
                      Crediti iniziali
                      <input
                        type="number"
                        min={1}
                        disabled={bloccato}
                        value={configDraft.budget}
                        onChange={(e) =>
                          setConfigDraft((c) => ({ ...c, budget: parseInt(e.target.value || "0", 10) || 0 }))
                        }
                      />
                    </label>
                    <label>
                      Countdown asta live (secondi)
                      <input
                        type="number"
                        min={5}
                        max={300}
                        disabled={bloccato}
                        value={configDraft.countdownSec}
                        onChange={(e) =>
                          setConfigDraft((c) => ({
                            ...c,
                            countdownSec: parseInt(e.target.value || "0", 10) || 20,
                          }))
                        }
                      />
                    </label>
                  </div>

                  <span className="fk-section-label" style={{ marginTop: 18, display: "block" }}>
                    Composizione rosa
                  </span>
                  <div className="fk-field-row">
                    {RUOLI.map((r) => (
                      <label key={r.key}>
                        {r.label}
                        <input
                          type="number"
                          min={0}
                          disabled={bloccato}
                          value={configDraft.slot[r.key]}
                          onChange={(e) =>
                            setConfigDraft((c) => ({
                              ...c,
                              slot: { ...c.slot, [r.key]: parseInt(e.target.value || "0", 10) || 0 },
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <p className="fk-hint">
                    Totale giocatori per rosa: {Object.values(configDraft.slot).reduce((a, b) => a + b, 0)}
                  </p>
                </>
              );
            })()}

            <p className="fk-hint">
              Le squadre non si impostano qui: chi entra con il codice va nella scheda "Asta
              Live" e crea la propria squadra con il nome che preferisce.
            </p>

            <div className="fk-divider" />
            <span className="fk-section-label">Elenco giocatori Serie A (facoltativo)</span>
            <p className="fk-hint" style={{ marginTop: 0 }}>
              Carica il file Excel delle quotazioni: attiva l'autocompletamento nome → ruolo +
              squadra. Si carica una volta a stagione e vale per tutte le aste.
            </p>
            <label className="fk-upload-btn">
              <Upload size={14} />
              {caricandoListone ? "Carico…" : "Carica file Excel"}
              <input
                type="file"
                accept=".xlsx,.xls"
                hidden
                disabled={caricandoListone}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) caricaListone(file);
                }}
              />
            </label>
            {listoneErr && (
              <p className="fk-error">
                <AlertTriangle size={14} /> {listoneErr}
              </p>
            )}
            <p className="fk-hint">
              {listoneDoc
                ? `Elenco caricato: ${listoneDoc.numeroGiocatori} giocatori.`
                : "Nessun elenco caricato ancora: i campi nome restano comunque scrivibili a mano."}
            </p>

            {!asta_iniziata && (
              <button className="fk-primary" onClick={iniziaAsta}>
                Inizia l'asta
              </button>
            )}
            {asta_iniziata && sbloccaImpostazioni && (
              <div className="fk-live-actions">
                <button className="fk-primary" onClick={salvaImpostazioni}>
                  Salva modifiche
                </button>
                <button
                  className="fk-secondary"
                  onClick={() => {
                    setConfigDraft({ ...defaultConfig(), ...stato.config });
                    setSbloccaImpostazioni(false);
                  }}
                >
                  Annulla
                </button>
              </div>
            )}
          </section>

          <aside className="fk-card fk-setup-aside">
            {!asta_iniziata ? (
              <>
                <span className="fk-section-label">Come funziona</span>
                <ol className="fk-steps">
                  <li>
                    <span className="fk-step-num">1</span>
                    <div>
                      <strong>Configura le regole</strong>
                      <p>Crediti a disposizione e quanti giocatori per ruolo in ogni rosa.</p>
                    </div>
                  </li>
                  <li>
                    <span className="fk-step-num">2</span>
                    <div>
                      <strong>Inizia l'asta</strong>
                      <p>Ricevi un codice a 6 caratteri: nessuna registrazione richiesta.</p>
                    </div>
                  </li>
                  <li>
                    <span className="fk-step-num">3</span>
                    <div>
                      <strong>Passa il codice ai tuoi amici</strong>
                      <p>Ognuno entra da solo e crea la propria squadra col nome che preferisce.</p>
                    </div>
                  </li>
                  <li>
                    <span className="fk-step-num">4</span>
                    <div>
                      <strong>Chiama i giocatori</strong>
                      <p>Tutti rilanciano in tempo reale dal proprio telefono, come in un'asta vera.</p>
                    </div>
                  </li>
                </ol>
              </>
            ) : (
              <>
                <span className="fk-section-label">Squadre iscritte</span>
                {squadre.length === 0 ? (
                  <p className="fk-hint" style={{ marginTop: 0 }}>
                    Ancora nessuna squadra: passa il codice qui sotto ai tuoi amici, si iscrivono da
                    soli appena entrano.
                  </p>
                ) : (
                  <ul className="fk-aside-teams">
                    {squadre.map((s) => (
                      <li key={s.id}>{s.nome}</li>
                    ))}
                  </ul>
                )}
                <div className="fk-divider" />
                <span className="fk-section-label">Codice della lega</span>
                <button className="fk-code-badge fk-code-badge-big" onClick={copiaCodice}>
                  <strong>{codice}</strong>
                  {copiato ? <Check size={14} /> : <Copy size={14} />}
                </button>
                <p className="fk-hint">Tocca per copiare, poi condividilo dove preferisci.</p>
              </>
            )}
          </aside>
          </div>
        )}

        {tab === "live" && asta_iniziata && (
          <section className="fk-live-grid">
            {(() => {
              const miaSquadra = squadre.find((s) => s.id === deviceRole);
              if (!miaSquadra) {
                return (
                  <div className="fk-card">
                    <p className="fk-error">
                      <AlertTriangle size={14} /> Squadra non trovata su questo dispositivo, scegli
                      di nuovo.
                    </p>
                  </div>
                );
              }

              const residui = creditiResidui(miaSquadra, config.budget);
              const postiLiberiMia = postiLiberiTotali(miaSquadra, config.slot);
              const maxOffertaMia = residui - Math.max(0, postiLiberiMia - 1);

              // I propri numeri restano sempre a schermo: chi non vuole farli
              // vedere agli altri usa l'occhio sui crediti nella scheda Squadre.
              const statistiche = (
                <div className="fk-stats-row">
                  <div className="fk-stat">
                    <div className="fk-stat-num" style={{ color: "var(--gold-ink)" }}>{residui}</div>
                    <div className="fk-stat-lab">crediti</div>
                  </div>
                  <div className="fk-stat">
                    <div className="fk-stat-num">{postiLiberiMia}</div>
                    <div className="fk-stat-lab">posti liberi</div>
                  </div>
                  <div className="fk-stat">
                    <div className="fk-stat-num" style={{ color: "var(--accent-ink)" }}>
                      {Math.max(0, maxOffertaMia)}
                    </div>
                    <div className="fk-stat-lab">offerta max</div>
                  </div>
                </div>
              );

              /* ---------- nessuna asta in corso ---------- */
              if (!astaLive || !astaLive.attiva) {
                return (
                  <div className="fk-card fk-stage fk-stage-chiamata">
                    <p className="fk-live-you">
                      Giochi come <strong>{miaSquadra.nome}</strong>
                    </p>
                    <span className="fk-section-label">Chiama il prossimo giocatore</span>
                    <div className="fk-field-row">
                      <label>
                        Nome giocatore
                        <GiocatoreInput
                          value={liveForm.nome}
                          placeholder="es. Lautaro Martinez"
                          listone={listone}
                          onChangeValue={(v) => setLiveForm((f) => ({ ...f, nome: v }))}
                          onPick={(g) => setLiveForm((f) => ({ ...f, nome: g.nome, ruolo: g.ruolo }))}
                        />
                      </label>
                      <label>
                        Offerta di partenza
                        <input
                          type="number"
                          min={1}
                          value={liveForm.offertaBase}
                          onChange={(e) => setLiveForm((f) => ({ ...f, offertaBase: e.target.value }))}
                        />
                      </label>
                    </div>
                    <div className="fk-block" style={{ marginTop: 12 }}>
                      <span className="fk-label">Ruolo</span>
                      <div className="fk-choice-grid">
                        {RUOLI.map((r) => {
                          const attivo = liveForm.ruolo === r.key;
                          return (
                            <button
                              key={r.key}
                              type="button"
                              className={attivo ? "fk-choice fk-choice-active" : "fk-choice"}
                              style={
                                attivo
                                  ? { background: r.colore, borderColor: r.colore, color: "#231A12" }
                                  : undefined
                              }
                              onClick={() => setLiveForm((f) => ({ ...f, ruolo: r.key }))}
                            >
                              {r.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {liveErr && (
                      <p className="fk-error">
                        <AlertTriangle size={14} /> {liveErr}
                      </p>
                    )}
                    <button className="fk-primary" onClick={avviaAstaLive}>
                      Avvia asta
                    </button>
                    <p className="fk-hint">
                      Countdown {config.countdownSec || 20}s, si azzera a ogni rilancio: allo scadere
                      il giocatore va a chi è in testa.
                    </p>
                    {statistiche}
                  </div>
                );
              }

              /* ---------- asta in corso ---------- */
              const ruoloInfo = RUOLI.find((r) => r.key === astaLive.ruolo);
              const sonoIoInTesta = astaLive.squadraOfferenteId === miaSquadra.id;
              const ruoloPienoLive =
                occupati(miaSquadra, astaLive.ruolo) >= config.slot[astaLive.ruolo];
              const oltreTetto = astaLive.offertaCorrente + 1 > maxOffertaMia;
              const disabilitato = ruoloPienoLive || oltreTetto;
              // Box vuoto: il pulsante rilancia di +1 (il default). Un numero
              // scritto qui vince: il pulsante rilancia a quella quota finale.
              const rilancioMinimo = astaLive.offertaCorrente + 1;
              const boxVuoto = bidValue.trim() === "";
              const targetNum = parseInt(bidValue, 10);
              const targetScrittoValido = Number.isFinite(targetNum) && targetNum > astaLive.offertaCorrente;
              const targetValido = boxVuoto || targetScrittoValido;
              const targetOfferta = targetScrittoValido ? targetNum : rilancioMinimo;
              const quotaDisabilitata =
                disabilitato || !targetValido || targetOfferta > maxOffertaMia;
              const inListone = listone.find(
                (g) => normalizza(g.nome) === normalizza(astaLive.giocatore)
              );
              const durata = astaLive.durataSecondi || config.countdownSec || 20;
              const frazione =
                secondiRimanenti === null ? 1 : Math.max(0, Math.min(1, secondiRimanenti / durata));
              const circonferenza = 2 * Math.PI * 88;
              const urgente = secondiRimanenti !== null && secondiRimanenti <= 5;

              return (
                <div
                  key={astaLive.id}
                  className={[
                    "fk-card",
                    "fk-stage",
                    "fk-stage-in",
                    inRush ? "fk-stage-rush" : "",
                    superato ? "fk-stage-shake" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <p className="fk-live-you">
                    Giochi come <strong>{miaSquadra.nome}</strong>
                  </p>

                  <p className="fk-live-player">
                    <span className="fk-chip" style={{ background: ruoloInfo.colore }}>
                      {astaLive.ruolo}
                    </span>
                    {astaLive.giocatore}
                  </p>
                  {inListone && (
                    <p className="fk-live-club">
                      {inListone.squadra} · quotazione {inListone.quotazione}
                    </p>
                  )}

                  <div className="fk-bighero">
                    <svg className="fk-bighero-svg" viewBox="0 0 200 200">
                      <circle className="fk-ring-track" cx="100" cy="100" r="88" fill="none" strokeWidth="10" />
                      <circle
                        className="fk-ring-bar"
                        cx="100"
                        cy="100"
                        r="88"
                        fill="none"
                        strokeWidth="10"
                        strokeLinecap="round"
                        stroke={urgente ? "var(--red)" : "var(--accent)"}
                        strokeDasharray={circonferenza}
                        strokeDashoffset={circonferenza * (1 - frazione)}
                        transform="rotate(-90 100 100)"
                      />
                    </svg>
                    <div className="fk-bighero-center">
                      <p
                        className={inRush ? "fk-bid-value fk-bid-rush" : "fk-bid-value"}
                        key={astaLive.offertaCorrente}
                      >
                        {astaLive.offertaCorrente}
                      </p>
                      <p className="fk-bid-unit">crediti</p>
                      <p className={urgente ? "fk-hero-timer fk-countdown-urgent" : "fk-hero-timer"}>
                        {secondiRimanenti ?? durata}s
                      </p>
                    </div>
                  </div>

                  {inRush && <p className="fk-rush-badge">🔥 Rilanci a raffica!</p>}

                  <div>
                    {sonoIoInTesta ? (
                      <span className="fk-leader">
                        <Crown size={15} /> Sei in testa
                      </span>
                    ) : astaLive.squadraOfferenteNome ? (
                      <span className="fk-leader">
                        <Crown size={15} /> {astaLive.squadraOfferenteNome}
                      </span>
                    ) : (
                      <span className="fk-leader fk-leader-none">Nessuna offerta ancora</span>
                    )}
                  </div>

                  {ruoloPienoLive && (
                    <p className="fk-warn" style={{ marginTop: 10 }}>
                      Reparto {ruoloInfo.label.toLowerCase()} già completo: non puoi offrire.
                    </p>
                  )}
                  {!ruoloPienoLive && oltreTetto && (
                    <p className="fk-warn" style={{ marginTop: 10 }}>
                      Fuori portata: il tuo massimo è {Math.max(0, maxOffertaMia)} crediti.
                    </p>
                  )}
                  {liveErr && (
                    <p className="fk-error">
                      <AlertTriangle size={14} /> {liveErr}
                    </p>
                  )}

                  <div className="fk-bid-row">
                    <button
                      className="fk-primary fk-bid-btn"
                      disabled={quotaDisabilitata}
                      onClick={() => faiOfferta(targetOfferta)}
                    >
                      Rilancia a {targetOfferta}
                    </button>

                    <div className="fk-bid-step" title="Quota finale (vuoto = rilancia di +1)">
                      <input
                        type="number"
                        aria-label="Quota finale a cui rilanciare"
                        placeholder={String(rilancioMinimo)}
                        min={rilancioMinimo}
                        max={Math.max(rilancioMinimo, maxOffertaMia)}
                        value={bidValue}
                        onChange={(e) => setBidValue(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && !quotaDisabilitata && faiOfferta(targetOfferta)}
                      />
                    </div>
                  </div>

                  {statistiche}

                  <div className="fk-live-actions fk-chiudi-row">
                    <button
                      className="fk-secondary"
                      disabled={!astaLive.squadraOfferenteId}
                      onClick={assegnaEChiudiAstaLive}
                    >
                      <Check size={14} /> Chiudi e assegna
                    </button>
                    <button
                      className="fk-secondary"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Annullare l'asta per ${astaLive.giocatore}? Torna disponibile, l'offerta in corso va persa.`
                          )
                        ) {
                          annullaAstaLive();
                        }
                      }}
                    >
                      <X size={14} /> Annulla
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* ---------- pannello laterale: cronaca dell'asta ---------- */}
            <div className="fk-card fk-panel">
              <div className="fk-panel-tabs">
                <button
                  className={pannello === "ultimi" ? "fk-panel-tab fk-panel-tab-on" : "fk-panel-tab"}
                  onClick={() => setPannello("ultimi")}
                >
                  🕑 Ultimi
                </button>
                <button
                  className={pannello === "top" ? "fk-panel-tab fk-panel-tab-on" : "fk-panel-tab"}
                  onClick={() => setPannello("top")}
                >
                  💰 Top
                </button>
                <button
                  className={pannello === "rilanci" ? "fk-panel-tab fk-panel-tab-on" : "fk-panel-tab"}
                  onClick={() => setPannello("rilanci")}
                >
                  😤 Fastidiosi
                </button>
              </div>

              <div className="fk-panel-body">
                {pannello === "ultimi" &&
                  (ultimiAcquisti.length === 0 ? (
                    <div className="fk-empty">
                      <span className="fk-empty-emoji">🕑</span>
                      Nessun acquisto ancora.
                    </div>
                  ) : (
                    <ul className="fk-panel-list">
                      {ultimiAcquisti.map((a, i) => {
                        const r = RUOLI.find((x) => x.key === a.ruolo);
                        return (
                          <li key={`${a.giocatoreId}-${i}`}>
                            <span className="fk-chip" style={{ background: r?.colore }}>
                              {a.ruolo}
                            </span>
                            <span className="fk-panel-main">
                              <span className="fk-panel-nome">{a.nome}</span>
                              <span className="fk-panel-sub">{a.squadraNome}</span>
                            </span>
                            <span className="fk-panel-val">{a.crediti}</span>
                          </li>
                        );
                      })}
                    </ul>
                  ))}

                {pannello === "top" &&
                  (topAcquisti.length === 0 ? (
                    <div className="fk-empty">
                      <span className="fk-empty-emoji">💰</span>
                      Ancora nessun colpo di mercato.
                    </div>
                  ) : (
                    <ul className="fk-panel-list">
                      {topAcquisti.map((g, i) => {
                        const r = RUOLI.find((x) => x.key === g.ruolo);
                        return (
                          <li key={g.id}>
                            <span className="fk-panel-pos">{i + 1}</span>
                            <span className="fk-chip" style={{ background: r?.colore }}>
                              {g.ruolo}
                            </span>
                            <span className="fk-panel-main">
                              <span className="fk-panel-nome">{g.nome}</span>
                              <span className="fk-panel-sub">{g.squadraNome}</span>
                            </span>
                            <span className="fk-panel-val">{g.crediti}</span>
                          </li>
                        );
                      })}
                    </ul>
                  ))}

                {pannello === "rilanci" && (
                  <>
                    <p className="fk-hint" style={{ margin: "0 0 10px" }}>
                      Chi rilancia di più da inizio asta.
                    </p>
                    <ul className="fk-panel-list">
                      {classificaRilanci.map((s, i) => (
                        <li key={s.id} className={s.id === deviceRole ? "fk-panel-mia" : undefined}>
                          <span className="fk-panel-pos">{i + 1}</span>
                          <span className="fk-panel-main">
                            <span className="fk-panel-nome">
                              {i === 0 && s.rilanci > 0 ? "😤 " : ""}
                              {s.nome}
                            </span>
                          </span>
                          <span className="fk-panel-val">{s.rilanci}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </section>
        )}

        {tab === "squadre" && asta_iniziata && squadre.length === 0 && (
          <section className="fk-card">
            <div className="fk-empty">
              <span className="fk-empty-emoji">🫱</span>
              Ancora nessuna squadra. Passa il codice <strong>{codice}</strong> ai tuoi amici: si
              registrano da soli quando entrano.
            </div>
          </section>
        )}

        {tab === "squadre" && asta_iniziata && squadre.length > 0 && (
          <section className="fk-teams-grid">
            {squadre.map((s) => {
              const spesi = creditiSpesi(s);
              const residui = config.budget - spesi;
              const totaleSlot = Object.values(config.slot).reduce((a, b) => a + b, 0);
              const totaleOccupati = s.giocatori.length;
              const mia = s.id === deviceRole;
              const visibili = creditiVisibili(s);
              const postiLiberiS = postiLiberiTotali(s, config.slot);
              const maxOffertaS = residui - Math.max(0, postiLiberiS - 1);
              return (
                <div
                  className={mia ? "fk-card fk-team-card fk-team-mine" : "fk-card fk-team-card"}
                  key={s.id}
                >
                  <div className="fk-team-head">
                    <h3>{s.nome}</h3>
                    {mia ? (
                      <span className="fk-credits">
                        <Coins size={14} /> {residui} / {config.budget}
                        <button
                          className="fk-credits-eye"
                          title={
                            visibili
                              ? "I tuoi crediti sono visibili alle altre squadre: tocca per nasconderli"
                              : "I tuoi crediti sono nascosti alle altre squadre: tocca per mostrarli"
                          }
                          aria-label={
                            visibili ? "Nascondi i miei crediti alle altre squadre" : "Mostra i miei crediti alle altre squadre"
                          }
                          onClick={() => cambiaVisibilitaCrediti(s.id, !visibili)}
                        >
                          {visibili ? <Eye size={13} /> : <EyeOff size={13} />}
                        </button>
                      </span>
                    ) : visibili ? (
                      <span className="fk-credits">
                        <Coins size={14} /> {residui} / {config.budget}
                      </span>
                    ) : (
                      <span
                        className="fk-credits fk-credits-hidden"
                        title={`${s.nome} ha scelto di non mostrare i suoi crediti`}
                      >
                        <EyeOff size={13} /> nascosti
                      </span>
                    )}
                  </div>
                  {(mia || visibili) && (
                    <div className="fk-progress">
                      <div
                        className="fk-progress-bar"
                        style={{ width: `${Math.min(100, (spesi / config.budget) * 100)}%` }}
                      />
                    </div>
                  )}
                  <p className="fk-hint">
                    {totaleOccupati} / {totaleSlot} giocatori in rosa
                  </p>

                  {!mia && (
                    <div className="fk-lancio-box">
                      <span className="fk-lancio-label">
                        🎯 Lancia qualcosa a <strong>{s.nome}</strong>
                      </span>
                      <div className="fk-lancio-bar">
                        {["🍅", "🥚", "🍌", "👏", "🎉"].map((e) => (
                          <button
                            key={e}
                            className="fk-lancio-btn"
                            title={`Lancia ${e} a ${s.nome}`}
                            onClick={() => lanciaOggetto(s.id, s.nome, e)}
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {RUOLI.map((r) => {
                    const giocatoriRuolo = s.giocatori.filter((g) => g.ruolo === r.key);
                    return (
                      <div className="fk-role-block" key={r.key}>
                        <div className="fk-role-title">
                          <span className="fk-chip" style={{ background: r.colore }}>
                            {r.key}
                          </span>
                          {r.label} · {giocatoriRuolo.length}/{config.slot[r.key]}
                        </div>
                        {giocatoriRuolo.length > 0 && (
                          <ul className="fk-player-list">
                            {giocatoriRuolo.map((g) => (
                              <li key={g.id}>
                                {editingId === g.id ? (
                                  <>
                                    <span>{g.nome}</span>
                                    <span className="fk-player-right">
                                      <input
                                        type="number"
                                        min={1}
                                        className="fk-edit-input"
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                      />
                                      <button
                                        className="fk-icon-btn"
                                        title="Conferma"
                                        onClick={async () => {
                                          const err = await modificaCrediti(s.id, g.id, editValue);
                                          if (err) {
                                            setErrore(err);
                                          } else {
                                            setErrore("");
                                            setEditingId(null);
                                          }
                                        }}
                                      >
                                        <Check size={13} />
                                      </button>
                                      <button
                                        className="fk-icon-btn"
                                        title="Annulla"
                                        onClick={() => setEditingId(null)}
                                      >
                                        <X size={13} />
                                      </button>
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <span>{g.nome}</span>
                                    <span className="fk-player-right">
                                      {g.crediti}
                                      <button
                                        className="fk-icon-btn"
                                        title="Modifica crediti"
                                        onClick={() => {
                                          setEditingId(g.id);
                                          setEditValue(String(g.crediti));
                                        }}
                                      >
                                        <Pencil size={13} />
                                      </button>
                                      <button
                                        className="fk-remove"
                                        onClick={() => rimuoviGiocatore(s.id, g.id)}
                                        title="Rimuovi"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </span>
                                  </>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}

                  <div className="fk-quickadd">
                    <h4>Aggiungi giocatore</h4>
                    <div className="fk-quickadd-row">
                      <GiocatoreInput
                        value={(quickAdd[s.id] || {}).nome || ""}
                        placeholder="Nome"
                        listone={listone}
                        onChangeValue={(v) => setQuick(s.id, { nome: v })}
                        onPick={(g) => setQuick(s.id, { nome: g.nome, ruolo: g.ruolo })}
                      />
                      <select
                        value={(quickAdd[s.id] || {}).ruolo || "P"}
                        onChange={(e) => setQuick(s.id, { ruolo: e.target.value })}
                      >
                        {RUOLI.map((r) => (
                          <option key={r.key} value={r.key}>
                            {r.key}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        placeholder="Crediti"
                        value={(quickAdd[s.id] || {}).crediti || ""}
                        onChange={(e) => setQuick(s.id, { crediti: e.target.value })}
                      />
                      <button
                        className="fk-icon-btn fk-add-btn"
                        title="Aggiungi"
                        onClick={() => handleQuickAdd(s.id)}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    {quickErr[s.id] && (
                      <p className="fk-error fk-error-small">
                        <AlertTriangle size={12} /> {quickErr[s.id]}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {tab === "disponibili" && asta_iniziata && (
          <section className="fk-card">
            {listone.length === 0 ? (
              <div className="fk-empty">
                <span className="fk-empty-emoji">📋</span>
                Nessun elenco caricato. Vai in "Impostazioni" e carica il file Excel delle
                quotazioni per vedere qui chi è ancora libero.
              </div>
            ) : (
              <>
                <span className="fk-section-label">Ancora liberi · dal più caro</span>
                <div className="fk-disp-toolbar">
                  <input
                    type="text"
                    placeholder="Cerca nome o cognome…"
                    value={dispQuery}
                    onChange={(e) => setDispQuery(e.target.value)}
                  />
                  <span className="fk-disp-count">{giocatoriDisponibili.length} giocatori</span>
                </div>
                <div className="fk-choice-grid" style={{ marginBottom: 16 }}>
                  <button
                    className={dispRuolo === "TUTTI" ? "fk-choice fk-choice-active" : "fk-choice"}
                    onClick={() => setDispRuolo("TUTTI")}
                  >
                    Tutti
                  </button>
                  {RUOLI.map((r) => {
                    const attivo = dispRuolo === r.key;
                    return (
                      <button
                        key={r.key}
                        className={attivo ? "fk-choice fk-choice-active" : "fk-choice"}
                        style={attivo ? { background: r.colore, borderColor: r.colore, color: "#231A12" } : undefined}
                        onClick={() => setDispRuolo(r.key)}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
                {giocatoriDisponibili.length === 0 ? (
                  <div className="fk-empty">
                    <span className="fk-empty-emoji">🔍</span>
                    Nessun giocatore libero con questi filtri.
                  </div>
                ) : (
                  <ul className="fk-disp-list">
                    {giocatoriDisponibili.map((g, i) => {
                      const r = RUOLI.find((x) => x.key === g.ruolo);
                      const occupata = !!astaLive?.attiva;
                      return (
                        <li
                          key={`${g.nome}-${i}`}
                          className="fk-disp-clickable"
                          title={
                            occupata
                              ? "C'è già un'asta in corso: si precompila per dopo"
                              : "Mettilo all'asta"
                          }
                          onClick={() => {
                            setLiveForm((f) => ({ ...f, nome: g.nome, ruolo: g.ruolo }));
                            setTab("live");
                          }}
                        >
                          <span className="fk-chip" style={{ background: r?.colore }}>
                            {g.ruolo}
                          </span>
                          <span className="fk-disp-nome">{g.nome}</span>
                          <span className="fk-disp-club">{g.squadra}</span>
                          <span className="fk-disp-qt">{g.quotazione}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
