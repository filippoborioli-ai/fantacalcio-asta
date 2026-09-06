/**
 * Centralino del Consigliere d'asta — Cloudflare Worker.
 *
 * Sta in mezzo tra il sito (statico, quindi senza posto dove nascondere un
 * segreto) e OpenAI. La chiave vive QUI, come segreto di Cloudflare: non è
 * mai nel repository e non arriva mai al browser.
 *
 * Non fidarsi di quello che arriva dal browser è il punto: chiunque può
 * chiamare questo indirizzo a mano, quindi ogni limite che conta per la
 * spesa è applicato qui dentro, non nell'app.
 *
 * Vedi worker/LEGGIMI.md per i cinque passi di installazione.
 */

// Limiti di spesa, tutti applicati lato server.
const MODELLO = "gpt-4o-mini"; // il più economico adatto allo scopo
const MAX_TOKEN_RISPOSTA = 220; // risposte brevi: due o tre frasi
const MAX_CARATTERI_DOMANDA = 300;
const MAX_CARATTERI_CONTESTO = 2000;

// Da dove si accettano chiamate. Tutto il resto viene rifiutato: senza questo,
// il centralino sarebbe un distributore di risposte gratis per chiunque.
const ORIGINI_AMMESSE = [
  "https://filippoborioli-ai.github.io",
  "http://localhost:5183",
  "http://localhost:5173",
];

const ISTRUZIONI = `Sei il consigliere di un'asta del fantacalcio tra amici, in italiano.
Rispondi in modo diretto e breve: due o tre frasi, niente elenchi lunghi, niente premesse.

Ti vengono forniti i dati REALI dell'asta in corso: usali come base del ragionamento
(crediti residui, posti liberi nel reparto, offerta massima sostenibile, quanto è stato
pagato stasera). Su quei numeri puoi essere preciso.

Sulla forma attuale dei giocatori, infortuni e trasferimenti recenti NON sei aggiornato:
se la domanda dipende da quelli, dillo in mezza riga invece di inventare.

Dai un consiglio pratico, con una cifra quando ha senso ("io non andrei oltre 30").`;

function intestazioniCors(origine) {
  const ammessa = ORIGINI_AMMESSE.includes(origine) ? origine : ORIGINI_AMMESSE[0];
  return {
    "Access-Control-Allow-Origin": ammessa,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function risposta(dati, stato, origine) {
  return new Response(JSON.stringify(dati), {
    status: stato,
    headers: { "Content-Type": "application/json", ...intestazioniCors(origine) },
  });
}

export default {
  async fetch(richiesta, env) {
    const origine = richiesta.headers.get("Origin") || "";

    if (richiesta.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: intestazioniCors(origine) });
    }
    if (richiesta.method !== "POST") {
      return risposta({ errore: "Metodo non ammesso." }, 405, origine);
    }
    if (!ORIGINI_AMMESSE.includes(origine)) {
      return risposta({ errore: "Origine non ammessa." }, 403, origine);
    }
    if (!env.OPENAI_API_KEY) {
      return risposta({ errore: "Centralino non configurato: manca la chiave." }, 500, origine);
    }

    let corpo;
    try {
      corpo = await richiesta.json();
    } catch (e) {
      return risposta({ errore: "Richiesta non leggibile." }, 400, origine);
    }

    const domanda = String(corpo?.domanda || "").trim().slice(0, MAX_CARATTERI_DOMANDA);
    const contesto = String(corpo?.contesto || "").trim().slice(0, MAX_CARATTERI_CONTESTO);
    if (!domanda) {
      return risposta({ errore: "Domanda vuota." }, 400, origine);
    }

    try {
      const chiamata = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: MODELLO,
          max_tokens: MAX_TOKEN_RISPOSTA,
          temperature: 0.6,
          messages: [
            { role: "system", content: ISTRUZIONI },
            {
              role: "user",
              content: contesto ? `Situazione dell'asta:\n${contesto}\n\nDomanda: ${domanda}` : domanda,
            },
          ],
        }),
      });

      if (!chiamata.ok) {
        const dettaglio = await chiamata.text();
        console.log("OpenAI ha risposto male:", chiamata.status, dettaglio.slice(0, 300));
        // Il dettaglio resta nei log del Worker: al browser non si manda mai
        // nulla che riguardi la chiave o l'account.
        return risposta({ errore: "Il consigliere non risponde in questo momento." }, 502, origine);
      }

      const dati = await chiamata.json();
      const testo = dati?.choices?.[0]?.message?.content?.trim();
      if (!testo) {
        return risposta({ errore: "Risposta vuota dal modello." }, 502, origine);
      }
      return risposta({ testo }, 200, origine);
    } catch (e) {
      console.log("Errore nel centralino:", e?.message);
      return risposta({ errore: "Il consigliere non risponde in questo momento." }, 502, origine);
    }
  },
};
