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
} from "../lib/model.js";
import { subscribeListone, salvaListone, estraiGiocatoriDaFile, normalizza } from "../lib/listone.js";
import GiocatoreInput from "../components/GiocatoreInput.jsx";
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
  Lock,
  LogOut,
} from "lucide-react";
import * as XLSX from "xlsx";

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
  const [liveForm, setLiveForm] = useState({ nome: "", ruolo: "P", offertaBase: "1", countdownSec: "20" });
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

  // Inizializzo le bozze di configurazione (solo se l'asta non è ancora iniziata) una sola volta
  useEffect(() => {
    if (stato && !draftInitRef.current) {
      setConfigDraft(stato.config || defaultConfig());
      draftInitRef.current = true;
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
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [listone, squadre, dispRuolo, dispQuery]);

  const iniziaAsta = async () => {
    // Nessuna squadra all'inizio: chi entra con il codice si registra da
    // solo con il nome della propria squadra, dalla scheda "Asta Live".
    await updateDoc(ref, {
      config: configDraft,
      squadre: [],
    });
    setTab("live");
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
          tx.update(ref, { squadre: nuoveSquadre });
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
          tx.update(ref, { squadre: nuoveSquadre });
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
    const durata = Math.max(5, Math.min(300, parseInt(liveForm.countdownSec, 10) || 20));
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
  }, [liveForm, ref, squadre]);

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
          if (live.squadraOfferenteId === squadra.id)
            throw new Error("Stai già facendo l'offerta più alta.");
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
          tx.update(ref, { astaLive: nuovoLive });
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
      <div className="fk-root">
        <header className="fk-header">
          <div className="fk-masthead">
            <h1>{stato.nome || "Asta del Fanta"}</h1>
            <p className="fk-sub">Prima di entrare, dicci chi sei su questo dispositivo.</p>
          </div>
          <div className="fk-rule" />
        </header>
        <main className="fk-main">
          <div className="fk-card">
            <h3 className="fk-h3">Chi sei su questo dispositivo?</h3>
            <p className="fk-hint">La scelta resta salvata solo su questo dispositivo/browser.</p>
            {squadre.length > 0 && (
              <div className="fk-choice-grid" style={{ marginTop: 14 }}>
                {squadre.map((s) => (
                  <button key={s.id} className="fk-choice" onClick={() => impostaRuoloDispositivo(s.id)}>
                    {s.nome}
                  </button>
                ))}
              </div>
            )}

            <h3 className="fk-h3" style={{ marginTop: 20 }}>
              Non vedi la tua squadra?
            </h3>
            <div className="fk-join-slot" style={{ maxWidth: 320 }}>
              <input
                type="text"
                placeholder="Nome della tua squadra"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && aggiungiSquadra()}
              />
              <button className="fk-choice" onClick={aggiungiSquadra}>
                + Crea la mia squadra
              </button>
              {newTeamErr && (
                <p className="fk-error fk-error-small">
                  <AlertTriangle size={12} /> {newTeamErr}
                </p>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="fk-root">
      <header className="fk-header">
        <div className="fk-masthead">
          <h1>{stato.nome || "Asta del Fanta"}</h1>
          <p className="fk-sub">
            {asta_iniziata
              ? `${squadre.length} squadre iscritte · ${config.budget} crediti a testa · P ${config.slot.P} · D ${config.slot.D} · C ${config.slot.C} · A ${config.slot.A}`
              : "Configura l'asta qui sotto"}
          </p>
          <div className="fk-masthead-actions">
            <button className="fk-code-badge" onClick={copiaCodice} title="Copia il codice">
              Codice: <strong>{codice}</strong> <Copy size={13} /> {copiato ? "copiato!" : ""}
            </button>
            <Link to="/" className="fk-link-btn">
              <LogOut size={13} /> Esci dall'asta
            </Link>
          </div>
        </div>
        <div className="fk-rule" />
      </header>

      <nav className="fk-tabs">
        <button
          className={tab === "setup" ? "fk-tab fk-tab-active" : "fk-tab"}
          onClick={() => setTab("setup")}
        >
          Impostazioni
        </button>
        <button
          className={tab === "live" ? "fk-tab fk-tab-active" : "fk-tab"}
          onClick={() => asta_iniziata && setTab("live")}
          disabled={!asta_iniziata}
        >
          Asta Live
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
        {asta_iniziata && (
          <button className="fk-secondary fk-export-nav" onClick={esportaExcel}>
            <Download size={14} /> Esporta in Excel
          </button>
        )}
      </nav>

      <main className="fk-main">
        {tab === "setup" && (
          <section className="fk-card fk-setup">
            {asta_iniziata && (
              <div className="fk-notice">
                <ShieldCheck size={16} />
                L'asta è già iniziata: le impostazioni sono bloccate. Usa "nuova asta" per
                modificarle.
              </div>
            )}
            <h3 className="fk-h3">Elenco giocatori Serie A</h3>
            <p className="fk-hint">
              Carica il file Excel delle quotazioni fantacalcio (foglio "Tutti", colonne Id/R/Nome/
              Squadra): abilita l'autocompletamento nome→ruolo+squadra ovunque scrivi un giocatore.
              È condiviso tra tutte le aste: lo ricarichi una volta a stagione, non serve rifarlo qui
              ogni volta.
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

            <h3 className="fk-h3">Impostazioni asta</h3>
            <div className="fk-field-row">
              <label>
                Crediti iniziali
                <input
                  type="number"
                  min={1}
                  disabled={asta_iniziata}
                  value={configDraft.budget}
                  onChange={(e) =>
                    setConfigDraft((c) => ({ ...c, budget: parseInt(e.target.value || "0", 10) || 0 }))
                  }
                />
              </label>
            </div>

            <h3 className="fk-h3">Composizione rosa per ruolo</h3>
            <div className="fk-field-row">
              {RUOLI.map((r) => (
                <label key={r.key}>
                  {r.label}
                  <input
                    type="number"
                    min={0}
                    disabled={asta_iniziata}
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

            <p className="fk-hint">
              Le squadre non si impostano qui: chi entra con il codice va nella scheda "Asta
              Live" e crea la propria squadra con il nome che preferisce.
            </p>

            {!asta_iniziata && (
              <button className="fk-primary" onClick={iniziaAsta}>
                Inizia l'asta
              </button>
            )}
          </section>
        )}

        {tab === "live" && asta_iniziata && (
          <section className="fk-live-wrap">
            <>
                <div className="fk-live-you">
                  <span>
                    Tu sei:{" "}
                    <strong>
                      {squadre.find((s) => s.id === deviceRole)?.nome || "Squadra non trovata"}
                    </strong>
                  </span>
                </div>

                <div className="fk-card">
                  {(() => {
                    const miaSquadra = squadre.find((s) => s.id === deviceRole);
                    if (!miaSquadra) {
                      return (
                        <p className="fk-error">
                          <AlertTriangle size={14} /> Squadra non trovata su questo dispositivo,
                          scegli di nuovo.
                        </p>
                      );
                    }

                    if (!astaLive || !astaLive.attiva) {
                      return (
                        <>
                          <h3 className="fk-h3">Metti all'asta un giocatore</h3>
                          <p className="fk-hint">
                            Chiunque può avviarla: scrivi il giocatore, il ruolo e l'offerta di
                            partenza, poi tutti rilanciano da qui. Il countdown si resetta a ogni
                            rilancio: quando scade, il giocatore si assegna da solo a chi è in
                            testa (o l'asta si annulla se nessuno ha offerto).
                          </p>
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
                                onChange={(e) =>
                                  setLiveForm((f) => ({ ...f, offertaBase: e.target.value }))
                                }
                              />
                            </label>
                            <label>
                              Countdown (secondi)
                              <input
                                type="number"
                                min={5}
                                max={300}
                                value={liveForm.countdownSec}
                                onChange={(e) =>
                                  setLiveForm((f) => ({ ...f, countdownSec: e.target.value }))
                                }
                              />
                            </label>
                          </div>
                          <div className="fk-block">
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
                                        ? { background: r.colore, borderColor: r.colore, color: "#fff" }
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
                          <p className="fk-hint" style={{ marginTop: 14 }}>
                            Crediti residui di {miaSquadra.nome}:{" "}
                            <strong>{creditiResidui(miaSquadra, config.budget)}</strong>
                          </p>
                        </>
                      );
                    }

                    const residui = creditiResidui(miaSquadra, config.budget);
                    const postiLiberiMia = postiLiberiTotali(miaSquadra, config.slot);
                    const maxOffertaMia = residui - Math.max(0, postiLiberiMia - 1);
                    const sonoIoInTesta = astaLive.squadraOfferenteId === miaSquadra.id;
                    const ruoloPienoLive =
                      occupati(miaSquadra, astaLive.ruolo) >= config.slot[astaLive.ruolo];
                    const oltreTetto = astaLive.offertaCorrente + 1 > maxOffertaMia;
                    const disabilitato = sonoIoInTesta || ruoloPienoLive || oltreTetto;
                    return (
                      <>
                        <h3 className="fk-h3">Asta in corso</h3>
                        <p className="fk-live-player">
                          <span
                            className="fk-chip"
                            style={{ background: RUOLI.find((r) => r.key === astaLive.ruolo).colore }}
                          >
                            {astaLive.ruolo}
                          </span>
                          <strong>{astaLive.giocatore}</strong>
                        </p>
                        <p className="fk-bid-value">{astaLive.offertaCorrente} crediti</p>
                        {secondiRimanenti !== null && (
                          <p className={secondiRimanenti <= 5 ? "fk-warn" : "fk-hint"}>
                            Chiude tra {secondiRimanenti}s se nessuno rilancia
                          </p>
                        )}
                        <p className="fk-hint">
                          {sonoIoInTesta ? (
                            <span className="fk-leading">
                              <Crown size={14} /> Stai offrendo tu ({miaSquadra.nome})
                            </span>
                          ) : astaLive.squadraOfferenteNome ? (
                            <>
                              Offerta più alta: <strong>{astaLive.squadraOfferenteNome}</strong>
                            </>
                          ) : (
                            "Nessuna offerta ancora"
                          )}
                          {" · "}Tuoi crediti residui: <strong>{residui}</strong>
                        </p>
                        {postiLiberiMia > 1 && (
                          <p className="fk-hint">
                            Ti restano {postiLiberiMia} posti da riempire in rosa (questo incluso): puoi
                            offrire al massimo <strong>{maxOffertaMia}</strong>, per lasciare almeno 1
                            credito agli altri {postiLiberiMia - 1}.
                          </p>
                        )}
                        {ruoloPienoLive && (
                          <p className="fk-warn">Hai già completato questo reparto, non puoi offrire.</p>
                        )}
                        {!ruoloPienoLive && !sonoIoInTesta && oltreTetto && (
                          <p className="fk-warn">
                            Non puoi rilanciare: supereresti il massimo di {maxOffertaMia} crediti.
                          </p>
                        )}
                        {liveErr && (
                          <p className="fk-error">
                            <AlertTriangle size={14} /> {liveErr}
                          </p>
                        )}
                        <div className="fk-live-actions">
                          <button
                            className="fk-primary fk-bid-btn"
                            disabled={disabilitato}
                            onClick={() => faiOfferta(astaLive.offertaCorrente + 1)}
                          >
                            Rilancia a {astaLive.offertaCorrente + 1}
                          </button>
                        </div>
                        <div className="fk-field-row" style={{ marginTop: 12 }}>
                          <label>
                            Offerta personalizzata
                            <input
                              type="number"
                              min={astaLive.offertaCorrente + 1}
                              max={maxOffertaMia}
                              value={bidValue}
                              placeholder={`> ${astaLive.offertaCorrente}`}
                              onChange={(e) => setBidValue(e.target.value)}
                            />
                          </label>
                          <button
                            className="fk-secondary"
                            disabled={disabilitato}
                            onClick={() => faiOfferta(bidValue)}
                          >
                            Invia offerta
                          </button>
                        </div>

                        <h3 className="fk-h3" style={{ marginTop: 20 }}>
                          Chiudi l'asta
                        </h3>
                        <p className="fk-hint">
                          Quando nessuno rilancia più, chi vuole può assegnare il giocatore
                          all'offerta più alta.
                        </p>
                        <div className="fk-live-actions">
                          <button
                            className="fk-primary"
                            disabled={!astaLive.squadraOfferenteId}
                            onClick={assegnaEChiudiAstaLive}
                          >
                            Assegna a {astaLive.squadraOfferenteNome || "…"}
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
                            Annulla asta
                          </button>
                        </div>

                        {astaLive.storico && astaLive.storico.length > 0 && (
                          <div className="fk-history">
                            <h4>Rilanci recenti</h4>
                            <ul className="fk-history-list">
                              {astaLive.storico
                                .slice()
                                .reverse()
                                .slice(0, 8)
                                .map((o, i) => (
                                  <li key={i}>
                                    <span>{o.squadraNome}</span>
                                    <span>{o.valore}</span>
                                  </li>
                                ))}
                            </ul>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
            </>
          </section>
        )}

        {tab === "squadre" && asta_iniziata && squadre.length === 0 && (
          <p className="fk-hint">
            Nessuna squadra ancora: fai entrare i tuoi amici con il codice, si registrano da soli
            dalla scheda "Asta Live".
          </p>
        )}

        {tab === "squadre" && asta_iniziata && squadre.length > 0 && (
          <section className="fk-teams-grid">
            {squadre.map((s) => {
              const spesi = creditiSpesi(s);
              const residui = config.budget - spesi;
              const totaleSlot = Object.values(config.slot).reduce((a, b) => a + b, 0);
              const totaleOccupati = s.giocatori.length;
              const mia = s.id === deviceRole;
              return (
                <div className="fk-card fk-team-card" key={s.id}>
                  <div className="fk-team-head">
                    <h3>{s.nome}</h3>
                    {mia ? (
                      <span className="fk-credits">
                        <Coins size={14} /> {residui} / {config.budget}
                      </span>
                    ) : (
                      <span className="fk-credits fk-credits-hidden" title="Solo il proprietario vede i suoi crediti residui">
                        <Lock size={13} /> nascosti
                      </span>
                    )}
                  </div>
                  {mia && (
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
            <h3 className="fk-h3">Giocatori disponibili</h3>
            {listone.length === 0 ? (
              <p className="fk-hint">
                Nessun elenco caricato: vai in "Impostazioni" e carica il file Excel delle
                quotazioni per usare questa scheda.
              </p>
            ) : (
              <>
                <p className="fk-hint">
                  Giocatori del listone non ancora assegnati a nessuna squadra.
                </p>
                <div className="fk-field-row" style={{ marginTop: 10 }}>
                  <label>
                    Cerca
                    <input
                      type="text"
                      placeholder="Nome o cognome"
                      value={dispQuery}
                      onChange={(e) => setDispQuery(e.target.value)}
                    />
                  </label>
                </div>
                <div className="fk-choice-grid" style={{ marginTop: 10, marginBottom: 14 }}>
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
                        style={attivo ? { background: r.colore, borderColor: r.colore, color: "#fff" } : undefined}
                        onClick={() => setDispRuolo(r.key)}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
                <p className="fk-hint">{giocatoriDisponibili.length} giocatori trovati.</p>
                <ul className="fk-player-list" style={{ marginTop: 8 }}>
                  {giocatoriDisponibili.map((g, i) => {
                    const r = RUOLI.find((x) => x.key === g.ruolo);
                    return (
                      <li key={`${g.nome}-${i}`}>
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="fk-chip" style={{ background: r?.colore }}>
                            {g.ruolo}
                          </span>
                          {g.nome}
                        </span>
                        <span className="fk-hint" style={{ margin: 0 }}>
                          {g.squadra}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
