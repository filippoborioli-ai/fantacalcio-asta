// Tema chiaro/scuro. Senza una scelta esplicita si segue il sistema
// operativo: chi tiene il PC in chiaro trova l'app in chiaro, chi gioca la
// sera con il telefono in scuro la trova scura. La scelta manuale, se c'è,
// vince sempre e resta su questo dispositivo.
const CHIAVE = "fantacalcio-tema";

export function temaDiSistema() {
  try {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  } catch (e) {
    return "dark";
  }
}

export function temaSalvato() {
  try {
    const v = localStorage.getItem(CHIAVE);
    return v === "light" || v === "dark" ? v : null;
  } catch (e) {
    return null;
  }
}

export function temaIniziale() {
  return temaSalvato() || temaDiSistema();
}

// L'attributo sta su <html> così copre anche il fondo della pagina, non solo
// il contenuto React.
export function applicaTema(tema) {
  document.documentElement.setAttribute("data-theme", tema);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", tema === "light" ? "#F1EAE2" : "#221B2E");
}

export function salvaTema(tema) {
  try {
    localStorage.setItem(CHIAVE, tema);
  } catch (e) {
    // se non si può salvare, il tema vale per questa sessione: nessun problema
  }
}
