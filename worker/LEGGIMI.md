# Il centralino del Consigliere (Cloudflare Worker)

Il sito è statico: non ha nessun posto dove tenere una chiave segreta. Qualsiasi
chiave messa nel frontend finirebbe **in chiaro dentro il JavaScript** che
scarica ogni visitatore, e nel repository pubblico.

Questo piccolo servizio risolve il problema: tiene la chiave OpenAI dalla sua
parte e gira le domande. Il sito resta dov'è, su GitHub Pages: cambia solo che
chiama un indirizzo in più.

Costo: il piano gratuito di Cloudflare copre 100.000 richieste al giorno. Si
paga solo il consumo OpenAI, che con i limiti impostati è di frazioni di
centesimo a domanda.

---

## Installazione (una volta sola, ~5 minuti)

### 1. Prima di tutto: la chiave

Se hai incollato una chiave in una chat, in una mail o ovunque non sia il posto
giusto, **revocala** su [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
e creane una nuova. Vale anche se pensi che nessuno l'abbia vista: i bot che
setacciano internet in cerca di chiavi le trovano in pochi minuti.

### 2. Metti un tetto di spesa su OpenAI

[platform.openai.com/settings/organization/limits](https://platform.openai.com/settings/organization/limits)
→ imposta un **budget mensile** (es. 5 €).

Questa è l'unica protezione che non dipende dal codice: se tutto il resto
fallisse, la spesa si ferma comunque lì. Non saltare questo passo.

### 3. Crea il Worker

1. Vai su [dash.cloudflare.com](https://dash.cloudflare.com) (registrazione gratuita)
2. Menu di sinistra → **Compute** → **Workers** → **Create**

   (Cloudflare rinomina spesso questa sezione: se non trovi "Compute" cerca
   "Workers" nella ricerca rapida in alto a sinistra.)
3. Parti dal template base (**Hello World**), dai un nome — per esempio
   `consigliere-asta` — e fai **Deploy**
4. Apri **Edit code**, cancella tutto e incolla il contenuto di
   [`consigliere.js`](./consigliere.js)
5. **Deploy**

### 4. Dai la chiave al Worker (senza metterla nel codice)

Nella pagina del Worker: **Settings** → **Variables and Secrets** → **Add**

- Tipo: **Secret** (non "Text": il segreto non è più visibile dopo il salvataggio)
- Nome: `OPENAI_API_KEY`
- Valore: la chiave nuova

Salva e ridistribuisci.

### 5. Collega il sito

Copia l'indirizzo del Worker (tipo
`https://consigliere-asta.tuonome.workers.dev`) e mettilo nel file `.env` del
progetto:

```
VITE_CONSIGLIERE_URL=https://consigliere-asta.tuonome.workers.dev
```

Poi `npm run deploy`.

Senza questa riga il consigliere semplicemente non compare, e il resto
dell'app funziona identico.

---

## Cosa limita la spesa

Tutto quello che conta è applicato **dentro il Worker**, non nell'app: quello
che sta nel browser lo può cambiare chiunque, quindi non protegge niente.

| Limite | Valore | Dove |
|---|---|---|
| Modello | `gpt-4o-mini` | Worker |
| Token per risposta | 220 | Worker |
| Lunghezza domanda | 300 caratteri | Worker |
| Lunghezza contesto | 2000 caratteri | Worker |
| Chi può chiamare | solo il dominio del sito | Worker (CORS) |
| Domande per squadra | 20 | app (vedi sotto) |
| **Spesa mensile** | **quella che imposti tu** | **OpenAI** |

### Il limite per squadra è diverso dagli altri

Le 20 domande a squadra sono contate sul documento dell'asta, cioè lato app.
Serve a tenere il conto e a mostrare quante ne restano, **non** è una
protezione: chi sa smanettare può azzerarlo, esattamente come può già
riscrivere qualsiasi altro dato dell'asta (l'app è aperta di proposito, è
pensata per giocare tra amici).

Contro l'abuso vero valgono le due righe in grassetto della tabella: il
filtro sull'origine e il tetto di spesa su OpenAI.

## Se qualcosa non va

- **Il consigliere non compare**: manca `VITE_CONSIGLIERE_URL` nel `.env`,
  oppure il sito non è stato ricostruito dopo averla aggiunta.
- **"Il consigliere non risponde"**: apri il Worker su Cloudflare → **Logs**.
  Il motivo vero è lì; al browser non viene mai mandato, per non far trapelare
  informazioni sull'account.
- **Errore 403**: stai chiamando da un indirizzo non previsto. Aggiungilo in
  `ORIGINI_AMMESSE` dentro `consigliere.js`.
