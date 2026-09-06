// Effetti sonori dell'asta, sintetizzati al volo con WebAudio: nessun file da
// scaricare, nessuna licenza da inseguire, e restano leggeri anche su telefono.
// Se il browser non concede l'audio, ogni funzione fallisce in silenzio: un
// suono mancato non deve mai diventare un errore in faccia a chi sta giocando.

let audioCtx = null;

// I browser creano il contesto audio "sospeso" finché l'utente non tocca la
// pagina, e resume() senza un gesto vero non lo sveglia. Chi guarda l'asta
// senza mai cliccare restava quindi muto per tutta la serata: qui lo
// sblocchiamo al primo tocco/tasto, una volta sola.
export function sbloccaAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch (e) {
    // niente audio su questo dispositivo: l'app funziona lo stesso
  }
}

let audioSpento = false;
export function impostaAudioSpento(spento) {
  audioSpento = spento;
}

export function suona(tipo) {
  if (audioSpento) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const ora = audioCtx.currentTime;
    const note = (freq, inizio, durata, volume = 0.09, forma = "sine", freqFine = null) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = forma;
      osc.frequency.setValueAtTime(freq, ora + inizio);
      // Con freqFine la nota scivola: serve per il "wah wah" e per la martellata.
      if (freqFine) osc.frequency.exponentialRampToValueAtTime(freqFine, ora + inizio + durata);
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
    } else if (tipo === "record") {
      // Fanfara: l'acquisto più caro della serata merita più di un dlin.
      note(523, 0, 0.12, 0.1);
      note(659, 0.11, 0.12, 0.1);
      note(784, 0.22, 0.14, 0.1);
      note(1046, 0.36, 0.42, 0.11);
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
    } else if (tipo === "tic") {
      // Battito degli ultimi secondi: secco e leggero, non deve stancare.
      note(1200, 0, 0.05, 0.05, "square");
    } else if (tipo === "martelletto") {
      // Colpo di martelletto: tonfo grave con lo schiocco sopra.
      note(160, 0, 0.18, 0.13, "sine", 60);
      note(2200, 0, 0.04, 0.05, "square");
    } else if (tipo === "razzo") {
      // Decollo: sirena che sale, l'asta è partita per la stratosfera.
      note(220, 0, 0.7, 0.08, "sawtooth", 1400);
      note(330, 0.05, 0.65, 0.05, "square", 1800);
    } else if (tipo === "scippo") {
      // Fulmine: rilancio all'ultimo respiro, secco e cattivo.
      note(1800, 0, 0.12, 0.09, "square", 400);
      note(900, 0.1, 0.2, 0.08, "sawtooth", 160);
    } else if (tipo === "dino") {
      // Ruggito: crediti agli sgoccioli.
      note(90, 0, 0.55, 0.13, "sawtooth", 55);
      note(140, 0.08, 0.42, 0.08, "square", 70);
    } else if (tipo === "affare") {
      // Scintillio: preso per due lire.
      note(1046, 0, 0.08, 0.07);
      note(1318, 0.07, 0.08, 0.07);
      note(1568, 0.14, 0.08, 0.07);
      note(2093, 0.21, 0.2, 0.06);
    } else if (tipo === "completa") {
      // Rosa completa: trombe, hai finito la serata.
      note(392, 0, 0.14, 0.1);
      note(523, 0.13, 0.14, 0.1);
      note(659, 0.26, 0.14, 0.1);
      note(784, 0.39, 0.16, 0.11);
      note(1046, 0.55, 0.5, 0.11);
    } else if (tipo === "fischio") {
      // Fischio d'inizio: acuto e secco, come un arbitro vero.
      note(1600, 0, 0.28, 0.08, "square");
      note(1600, 0.34, 0.16, 0.07, "square");
    } else if (tipo === "duello") {
      // Cozzo di spade: due colpi metallici che si rincorrono.
      note(1200, 0, 0.06, 0.08, "square");
      note(700, 0.08, 0.06, 0.08, "square");
      note(1200, 0.16, 0.06, 0.08, "square");
      note(700, 0.24, 0.09, 0.08, "square");
    } else if (tipo === "vuota") {
      // Portafoglio a zero: due note tristi e basse, senza scivolata.
      note(220, 0, 0.14, 0.08);
      note(165, 0.13, 0.28, 0.08);
    } else if (tipo === "sportello") {
      // Ruolo esaurito: uno sportello che sbatte.
      note(140, 0, 0.09, 0.11, "square");
      note(90, 0.08, 0.12, 0.09, "square");
    } else if (tipo === "finale") {
      // Gran finale: la fanfara più grande di tutte, l'asta è chiusa.
      note(392, 0, 0.16, 0.11);
      note(523, 0.15, 0.16, 0.11);
      note(659, 0.3, 0.16, 0.11);
      note(784, 0.45, 0.18, 0.12);
      note(1046, 0.62, 0.2, 0.12);
      note(1318, 0.8, 0.6, 0.13);
    } else if (tipo === "slot") {
      // Rullo della slot: clack che rallentano, come una ruota che si ferma.
      // Sono programmati tutti insieme in anticipo: WebAudio li fa partire ai
      // tempi giusti da solo, senza timer JS che sbandano.
      let t = 0;
      let passo = 0.055;
      while (t < 2.35) {
        note(820 + Math.random() * 240, t, 0.03, 0.045, "square");
        t += passo;
        passo *= 1.09; // ogni giro un po' più lento
      }
    } else if (tipo === "slotFerma") {
      // Il colpo secco dell'incastro finale, con il campanello.
      note(200, 0, 0.1, 0.12, "square");
      note(1046, 0.06, 0.12, 0.08);
      note(1568, 0.16, 0.3, 0.08);
    } else if (tipo === "vuoto") {
      // Nessuno lo ha voluto: trombetta triste.
      note(330, 0, 0.16, 0.07, "sawtooth", 300);
      note(294, 0.15, 0.16, 0.07, "sawtooth", 262);
      note(247, 0.3, 0.3, 0.07, "sawtooth", 208);
    }
  } catch (e) {
    // audio non disponibile: nessun problema, l'app funziona lo stesso
  }
}
