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
} from "../lib/model.js";
import {
  Trash2,
  RotateCcw,
  AlertTriangle,
  Coins,
  ShieldCheck,
  Pencil,
  Check,
  X,
  Plus,
  Download,
  Crown,
  Copy,
} from "lucide-react";
import * as XLSX from "xlsx";

export default function AstaRoom() {
  const { codice } = useParams();
  const ref = useMemo(() => doc(db, "aste", codice), [codice]);

  const [stato, setStato] = useState(null);
  const [notFound, setNotFound] = useState(false);

  const [tab, setTab] = useState("setup");
  const [configDraft, setConfigDraft] = useState(defaultConfig());
  const [teamNamesDraft, setTeamNamesDraft] = useState(Array.from({ length: 8 }, () => ""));
  const draftInitRef = useRef(false);

  const [deviceRole, setDeviceRoleState] = useState(() => {
    try {
      const raw = localStorage.getItem(`fantacalcio-ruolo-${codice}`);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  });

  const [form, setForm] = useState({ nome: "", ruolo: "P", squadraId: "", crediti: "" });
  const [errore, setErrore] = useState("");
  const [ultimaAggiunta, setUltimaAggiunta] = useState(null);
  const [quickAdd, setQuickAdd] = useState({});
  const [quickErr, setQuickErr] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [liveForm, setLiveForm] = useState({ nome: "", ruolo: "P", offertaBase: "1" });
  const [bidValue, setBidValue] = useState("");
  const [liveErr, setLiveErr] = useState("");
  const [copiato, setCopiato] = useState(false);

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

  // Inizializzo le bozze di configurazione (solo se l'asta non è ancora iniziata) una sola volta
  useEffect(() => {
    if (stato && !draftInitRef.current) {
      setConfigDraft(stato.config || defaultConfig());
      const n = stato.config?.numSquadre || 8;
      setTeamNamesDraft(
        stato.teamNames && stato.teamNames.length ? stato.teamNames : Array.from({ length: n }, () => "")
      );
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

  const aggiornaNumSquadre = (n) => {
    const num = Math.max(2, Math.min(20, n));
    setConfigDraft((c) => ({ ...c, numSquadre: num }));
    setTeamNamesDraft((old) => {
      const arr = [...old];
      while (arr.length < num) arr.push("");
      return arr.slice(0, num);
    });
  };

  const iniziaAsta = async () => {
    const nuoveSquadre = teamNamesDraft.map((nome, i) => ({
      id: uid(),
      nome: nome.trim() || `Squadra ${i + 1}`,
      giocatori: [],
    }));
    await updateDoc(ref, {
      config: configDraft,
      teamNames: teamNamesDraft,
      squadre: nuoveSquadre,
    });
    setForm((f) => ({ ...f, squadraId: nuoveSquadre[0]?.id || "" }));
    setTab("asta");
  };

  const resetTutto = async () => {
    if (!window.confirm("Ricominciare da capo? Tutti i dati dell'asta andranno persi.")) return;
    const nuovoConfig = defaultConfig();
    const nuoviNomi = Array.from({ length: nuovoConfig.numSquadre }, () => "");
    await updateDoc(ref, {
      config: nuovoConfig,
      teamNames: nuoviNomi,
      squadre: null,
      astaLive: null,
    });
    setConfigDraft(nuovoConfig);
    setTeamNamesDraft(nuoviNomi);
    setErrore("");
    setUltimaAggiunta(null);
    setForm({ nome: "", ruolo: "P", squadraId: "", crediti: "" });
    setTab("setup");
    impostaRuoloDispositivo(null);
  };

  const squadraSelezionata = useMemo(
    () => squadre?.find((s) => s.id === form.squadraId) || null,
    [squadre, form.squadraId]
  );
  const ruoloPieno =
    squadraSelezionata && occupati(squadraSelezionata, form.ruolo) >= config.slot[form.ruolo];

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
      let risultato = null;
      try {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          const dati = snap.data();
          const squadra = dati.squadre.find((s) => s.id === squadraId);
          if (!squadra) throw new Error("Squadra non trovata.");
          if (occupati(squadra, ruolo) >= dati.config.slot[ruolo]) {
            throw new Error(
              `${squadra.nome} ha già completato il reparto ${RUOLI.find((r) => r.key === ruolo).label.toLowerCase()}.`
            );
          }
          const residui = creditiResidui(squadra, dati.config.budget);
          if (crediti > residui) {
            throw new Error(`Crediti insufficienti: ${squadra.nome} ha solo ${residui} crediti residui.`);
          }
          const nuovoGiocatore = { id: uid(), nome, ruolo, crediti };
          const nuoveSquadre = dati.squadre.map((s) =>
            s.id === squadra.id ? { ...s, giocatori: [...s.giocatori, nuovoGiocatore] } : s
          );
          tx.update(ref, { squadre: nuoveSquadre });
          risultato = { squadraNome: squadra.nome, giocatore: nuovoGiocatore };
        });
        if (risultato) setUltimaAggiunta(risultato);
        return null;
      } catch (e) {
        return e.message || "Errore nell'assegnazione.";
      }
    },
    [ref]
  );

  const handleAssegna = useCallback(async () => {
    const err = await assegnaGiocatore(form.squadraId, form.ruolo, form.nome, form.crediti);
    if (err) return setErrore(err);
    setErrore("");
    setForm((f) => ({ ...f, nome: "", crediti: "" }));
  }, [form, assegnaGiocatore]);

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
          const maxAmmesso = dati.config.budget - spesiAltri;
          if (nuoviCrediti > maxAmmesso) {
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
    if (!nome) return setLiveErr("Inserisci il nome del giocatore.");
    if (!Number.isFinite(base) || base < 1) return setLiveErr("Offerta di partenza non valida.");
    await updateDoc(ref, {
      astaLive: {
        attiva: true,
        giocatore: nome,
        ruolo: liveForm.ruolo,
        offertaCorrente: base,
        squadraOfferenteId: null,
        squadraOfferenteNome: null,
        storico: [],
      },
    });
    setLiveForm((f) => ({ ...f, nome: "" }));
  }, [liveForm, ref]);

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
          if (valore > residui) throw new Error(`Non hai abbastanza crediti (residui: ${residui}).`);
          if (live.squadraOfferenteId === squadra.id)
            throw new Error("Stai già facendo l'offerta più alta.");
          if (valore <= live.offertaCorrente)
            throw new Error(`Qualcuno ha già offerto ${live.offertaCorrente}: rilancia più alto.`);
          const nuovoLive = {
            ...live,
            offertaCorrente: valore,
            squadraOfferenteId: squadra.id,
            squadraOfferenteNome: squadra.nome,
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

  return (
    <div className="fk-root">
      <header className="fk-header">
        <div className="fk-masthead">
          <h1>{stato.nome || "Asta del Fanta"}</h1>
          <p className="fk-sub">
            {asta_iniziata
              ? `${config.numSquadre} squadre · ${config.budget} crediti a testa · P ${config.slot.P} · D ${config.slot.D} · C ${config.slot.C} · A ${config.slot.A}`
              : "Configura l'asta qui sotto"}
          </p>
          <button className="fk-code-badge" onClick={copiaCodice} title="Copia il codice">
            Codice: <strong>{codice}</strong> <Copy size={13} /> {copiato ? "copiato!" : ""}
          </button>
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
          className={tab === "asta" ? "fk-tab fk-tab-active" : "fk-tab"}
          onClick={() => asta_iniziata && setTab("asta")}
          disabled={!asta_iniziata}
        >
          Asta
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
        {asta_iniziata && (
          <button className="fk-secondary fk-export-nav" onClick={esportaExcel}>
            <Download size={14} /> Esporta in Excel
          </button>
        )}
        {asta_iniziata && (
          <button className="fk-reset" onClick={resetTutto} title="Ricomincia">
            <RotateCcw size={15} /> nuova asta
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
            <div className="fk-field-row">
              <label>
                Numero squadre
                <input
                  type="number"
                  min={2}
                  max={20}
                  disabled={asta_iniziata}
                  value={configDraft.numSquadre}
                  onChange={(e) => aggiornaNumSquadre(parseInt(e.target.value || "0", 10))}
                />
              </label>
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

            <h3 className="fk-h3">Nomi delle squadre</h3>
            <div className="fk-team-names">
              {teamNamesDraft.map((n, i) => (
                <input
                  key={i}
                  type="text"
                  disabled={asta_iniziata}
                  value={n}
                  placeholder={`Squadra ${i + 1}`}
                  onChange={(e) =>
                    setTeamNamesDraft((old) => {
                      const arr = [...old];
                      arr[i] = e.target.value;
                      return arr;
                    })
                  }
                />
              ))}
            </div>

            {!asta_iniziata && (
              <button className="fk-primary" onClick={iniziaAsta}>
                Inizia l'asta
              </button>
            )}
          </section>
        )}

        {tab === "asta" && asta_iniziata && (
          <section className="fk-asta-grid">
            <div className="fk-card">
              <h3 className="fk-h3">Assegna giocatore</h3>

              <div className="fk-field-row">
                <label>
                  Nome giocatore
                  <input
                    type="text"
                    value={form.nome}
                    placeholder="es. Lautaro Martinez"
                    onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                  />
                </label>
                <label>
                  Crediti pagati
                  <input
                    type="number"
                    min={1}
                    value={form.crediti}
                    onChange={(e) => setForm((f) => ({ ...f, crediti: e.target.value }))}
                  />
                </label>
              </div>

              <div className="fk-block">
                <span className="fk-label">Ruolo</span>
                <div className="fk-choice-grid">
                  {RUOLI.map((r) => {
                    const attivo = form.ruolo === r.key;
                    return (
                      <button
                        key={r.key}
                        type="button"
                        className={attivo ? "fk-choice fk-choice-active" : "fk-choice"}
                        style={attivo ? { background: r.colore, borderColor: r.colore, color: "#fff" } : undefined}
                        onClick={() => setForm((f) => ({ ...f, ruolo: r.key }))}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="fk-block">
                <span className="fk-label">Squadra aggiudicataria</span>
                <div className="fk-choice-grid">
                  {squadre.map((s) => {
                    const piena = postiLiberiTotali(s, config.slot) === 0;
                    const attivo = form.squadraId === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={piena}
                        className={attivo ? "fk-choice fk-choice-active" : "fk-choice"}
                        onClick={() => setForm((f) => ({ ...f, squadraId: s.id }))}
                        title={piena ? "Rosa completa" : undefined}
                      >
                        {s.nome}
                      </button>
                    );
                  })}
                </div>
              </div>

              {squadraSelezionata && (
                <p className="fk-hint">
                  <strong>{squadraSelezionata.nome}</strong> ·{" "}
                  {creditiResidui(squadraSelezionata, config.budget)} crediti residui
                  {ruoloPieno && (
                    <span className="fk-warn">
                      {" "}
                      — reparto {RUOLI.find((r) => r.key === form.ruolo).label.toLowerCase()} già al
                      completo
                    </span>
                  )}
                </p>
              )}

              {errore && (
                <p className="fk-error">
                  <AlertTriangle size={14} /> {errore}
                </p>
              )}

              <button className="fk-primary" onClick={handleAssegna}>
                Assegna
              </button>
            </div>

            <div className="fk-card fk-last">
              <h3 className="fk-h3">Ultima assegnazione</h3>
              {ultimaAggiunta ? (
                <p className="fk-last-line">
                  <span
                    className="fk-chip"
                    style={{
                      background: RUOLI.find((r) => r.key === ultimaAggiunta.giocatore.ruolo).colore,
                    }}
                  >
                    {ultimaAggiunta.giocatore.ruolo}
                  </span>
                  <strong>{ultimaAggiunta.giocatore.nome}</strong> a {ultimaAggiunta.squadraNome} per{" "}
                  {ultimaAggiunta.giocatore.crediti} crediti
                </p>
              ) : (
                <p className="fk-hint">Nessuna assegnazione ancora effettuata.</p>
              )}
            </div>
          </section>
        )}

        {tab === "live" && asta_iniziata && (
          <section className="fk-live-wrap">
            {deviceRole === null && (
              <div className="fk-card">
                <h3 className="fk-h3">Chi sei su questo dispositivo?</h3>
                <p className="fk-hint">La scelta resta salvata solo su questo dispositivo/browser.</p>
                <div className="fk-choice-grid" style={{ marginTop: 14 }}>
                  <button className="fk-choice" onClick={() => impostaRuoloDispositivo("admin")}>
                    Admin (banditore)
                  </button>
                  {squadre.map((s) => (
                    <button
                      key={s.id}
                      className="fk-choice"
                      onClick={() => impostaRuoloDispositivo(s.id)}
                    >
                      {s.nome}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {deviceRole !== null && (
              <>
                <div className="fk-live-you">
                  <span>
                    Tu sei:{" "}
                    <strong>
                      {deviceRole === "admin"
                        ? "Admin"
                        : squadre.find((s) => s.id === deviceRole)?.nome || "Squadra non trovata"}
                    </strong>
                  </span>
                  <button className="fk-link-btn" onClick={() => impostaRuoloDispositivo(null)}>
                    cambia
                  </button>
                </div>

                {deviceRole === "admin" ? (
                  <div className="fk-card">
                    {!astaLive || !astaLive.attiva ? (
                      <>
                        <h3 className="fk-h3">Avvia una nuova asta</h3>
                        <div className="fk-field-row">
                          <label>
                            Nome giocatore
                            <input
                              type="text"
                              value={liveForm.nome}
                              placeholder="es. Lautaro Martinez"
                              onChange={(e) => setLiveForm((f) => ({ ...f, nome: e.target.value }))}
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
                      </>
                    ) : (
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
                        <p className="fk-hint">
                          {astaLive.squadraOfferenteNome ? (
                            <>
                              Offerta più alta: <strong>{astaLive.squadraOfferenteNome}</strong>
                            </>
                          ) : (
                            "Nessuna offerta ancora"
                          )}
                        </p>
                        {liveErr && (
                          <p className="fk-error">
                            <AlertTriangle size={14} /> {liveErr}
                          </p>
                        )}
                        <div className="fk-live-actions">
                          <button
                            className="fk-primary"
                            disabled={!astaLive.squadraOfferenteId}
                            onClick={assegnaEChiudiAstaLive}
                          >
                            Assegna a {astaLive.squadraOfferenteNome || "…"}
                          </button>
                          <button className="fk-secondary" onClick={annullaAstaLive}>
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
                    )}
                  </div>
                ) : (
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
                            <h3 className="fk-h3">In attesa…</h3>
                            <p className="fk-hint">L'admin non ha ancora avviato un'asta.</p>
                            <p className="fk-hint">
                              Crediti residui: <strong>{creditiResidui(miaSquadra, config.budget)}</strong>
                            </p>
                          </>
                        );
                      }
                      const residui = creditiResidui(miaSquadra, config.budget);
                      const sonoIoInTesta = astaLive.squadraOfferenteId === miaSquadra.id;
                      const ruoloPienoLive =
                        occupati(miaSquadra, astaLive.ruolo) >= config.slot[astaLive.ruolo];
                      const disabilitato = sonoIoInTesta || ruoloPienoLive;
                      return (
                        <>
                          <h3 className="fk-h3">{miaSquadra.nome}</h3>
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
                          <p className="fk-hint">
                            {sonoIoInTesta ? (
                              <span className="fk-leading">
                                <Crown size={14} /> Stai offrendo tu
                              </span>
                            ) : astaLive.squadraOfferenteNome ? (
                              <>
                                In testa: <strong>{astaLive.squadraOfferenteNome}</strong>
                              </>
                            ) : (
                              "Nessuna offerta ancora"
                            )}
                            {" · "}Tuoi crediti residui: <strong>{residui}</strong>
                          </p>
                          {ruoloPienoLive && (
                            <p className="fk-warn">
                              Hai già completato questo reparto, non puoi offrire.
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
                        </>
                      );
                    })()}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {tab === "squadre" && asta_iniziata && (
          <section className="fk-teams-grid">
            {squadre.map((s) => {
              const spesi = creditiSpesi(s);
              const residui = config.budget - spesi;
              const totaleSlot = Object.values(config.slot).reduce((a, b) => a + b, 0);
              const totaleOccupati = s.giocatori.length;
              return (
                <div className="fk-card fk-team-card" key={s.id}>
                  <div className="fk-team-head">
                    <h3>{s.nome}</h3>
                    <span className="fk-credits">
                      <Coins size={14} /> {residui} / {config.budget}
                    </span>
                  </div>
                  <div className="fk-progress">
                    <div
                      className="fk-progress-bar"
                      style={{ width: `${Math.min(100, (spesi / config.budget) * 100)}%` }}
                    />
                  </div>
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
                      <input
                        type="text"
                        placeholder="Nome"
                        value={(quickAdd[s.id] || {}).nome || ""}
                        onChange={(e) => setQuick(s.id, { nome: e.target.value })}
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
      </main>
    </div>
  );
}
