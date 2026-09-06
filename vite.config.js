import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Identificativo della compilazione: finisce sia dentro il codice (__BUILD_ID__)
// sia in un file version.json pubblicato accanto all'app. L'app confronta i due
// e si accorge da sola quando è online una versione più nuova di quella che sta
// girando nel browser (vedi components/ControlloVersione.jsx).
const buildId = new Date().toISOString();

export default defineConfig({
  base: "/fantacalcio-asta/",
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  plugins: [
    react(),
    {
      name: "scrivi-version-json",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "version.json",
          source: JSON.stringify({ build: buildId }),
        });
      },
    },
  ],
});
