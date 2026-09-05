# Asta del Fanta

App per gestire l'asta del fantacalcio dal vivo: chi crea l'asta ottiene un
codice univoco, gli amici entrano con quel codice e vedono in tempo reale
squadre, crediti e rilanci.

Stack: **React + Vite** (frontend) e **Firebase Firestore** (database
condiviso in tempo reale, gratuito). Nessun server da gestire: è un sito
statico + un database cloud.

---

## 0. Cosa ti serve

- [Node.js](https://nodejs.org/) (versione 18 o successiva) installato sul PC
- Un account Google gratuito, per creare un progetto Firebase
- Un account [GitHub](https://github.com) gratuito
- Un account [Vercel](https://vercel.com) gratuito (per mettere il sito online) — puoi accedere direttamente con GitHub

> Nota: questi passaggi (creare il progetto Firebase, collegare Vercel) li devi
> fare tu dal browser: io non ho accesso ai tuoi account. Ti scrivo qui ogni
> singolo passaggio.

---

## 1. Crea il progetto Firebase (il database condiviso)

1. Vai su [console.firebase.google.com](https://console.firebase.google.com/) e clicca **"Aggiungi progetto"**.
2. Dagli un nome (es. `asta-fanta`), continua con le impostazioni di default, crea il progetto.
3. Nel menu a sinistra vai su **Build > Firestore Database** → **Crea database**.
   - Scegli una località vicina (es. `eur3 (europe-west)`).
   - Parti in **modalità di test** (poi sostituiamo le regole al punto 3).
4. Sempre nel progetto, vai su **Impostazioni progetto** (icona ingranaggio) → scheda **Generale** → in fondo, sezione **Le tue app** → clicca l'icona **`</>`** (Web) per registrare una nuova app web.
   - Dalle un nome qualsiasi, NON serve Firebase Hosting.
   - Ti mostrerà un blocco `firebaseConfig = {...}`: tieni questa pagina aperta, ti servono questi valori al punto 4.

## 2. Scarica ed estrai il progetto

Estrai lo zip che ti ho dato dentro:

```
C:\Users\borio\Desktop\Cartelle\00_github progetti\
```

Dovresti ritrovarti con una cartella tipo:

```
00_github progetti\fantacalcio-asta\
```

Apri un terminale (PowerShell) dentro quella cartella e lancia:

```bash
npm install
```

## 3. Applica le regole di Firestore

Nella console Firebase, vai su **Firestore Database > Regole**, cancella
il contenuto e incolla quello del file `firestore.rules` che trovi nel
progetto. Clicca **Pubblica**.

## 4. Configura le chiavi Firebase

Nella cartella del progetto, copia `.env.example` in un nuovo file chiamato
**`.env`** (stesso posto, solo senza `.example`), e incolla i valori presi
dal blocco `firebaseConfig` di Firebase:

```
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=asta-fanta-xxxxx.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=asta-fanta-xxxxx
VITE_FIREBASE_STORAGE_BUCKET=asta-fanta-xxxxx.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```

Il file `.env` non va mai caricato su GitHub (è già escluso nel
`.gitignore`).

## 5. Prova in locale

```bash
npm run dev
```

Apri l'indirizzo che ti stampa (di solito `http://localhost:5173`).
Prova a creare un'asta, aprine una seconda scheda del browser con lo stesso
codice e verifica che i dati si aggiornino su entrambe. Solo dopo aver
verificato che funziona conviene passare al punto successivo.

*(Questa parte non ho potuto testarla io: il mio ambiente non ha accesso a
Firebase. Il codice segue le API ufficiali di Firestore, ma è il tuo test in
locale la vera prova del nove.)*

## 6. Pubblica il codice su GitHub

Nella cartella del progetto:

```bash
git init
git add .
git commit -m "Prima versione dell'asta del fanta"
```

Su [github.com/new](https://github.com/new) crea un nuovo repository (es.
`fantacalcio-asta`), pubblico, **senza** spuntare "Add a README" (ce l'hai
già). Poi:

```bash
git remote add origin https://github.com/TUO-UTENTE/fantacalcio-asta.git
git branch -M main
git push -u origin main
```

## 7. Mettilo online con Vercel (gratis)

1. Vai su [vercel.com](https://vercel.com), accedi con GitHub.
2. **Add New… > Project**, seleziona il repository `fantacalcio-asta`.
3. In **Environment Variables**, aggiungi le stesse 6 variabili del tuo
   file `.env` (stessi nomi, stessi valori).
4. Clicca **Deploy**.

Dopo un minuto avrai un link pubblico tipo `fantacalcio-asta.vercel.app` —
quello lo puoi mandare direttamente ai tuoi amici. Ogni volta che fai `git
push`, Vercel aggiorna automaticamente il sito online.

---

## Come funziona per chi la usa

- Chi crea l'asta clicca **"Crea asta"**: riceve un codice (es. `7K3PLQ`),
  visibile in alto nella pagina, e configura squadre/crediti/ruoli.
- Gli amici vanno sullo stesso link, cliccano **"Unisciti con un codice"** e
  inseriscono quel codice.
- Nel tab **Asta Live**, ognuno sceglie chi è (admin o una squadra) sul
  proprio dispositivo, e da lì può rilanciare in tempo reale.

## Limiti da conoscere

- **Nessun login**: chi ha il codice può fare tutto (anche "diventare"
  admin). Va bene tra amici fidati; non è un sistema con permessi veri.
- Le regole di Firestore incluse sono aperte (chiunque abbia il codice legge
  e scrive). Il piano gratuito di Firebase è ampiamente sufficiente per
  quest'uso (poche aste, poche scritture).
- Se vuoi in futuro account veri con permessi (solo l'admin può assegnare,
  ecc.), si può aggiungere Firebase Authentication — è un passo in più che
  possiamo fare quando vuoi.
