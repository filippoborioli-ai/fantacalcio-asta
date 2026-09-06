import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./style.css";
import { applicaTema, temaIniziale } from "./lib/tema.js";

// Prima del render, così non si vede il lampo del tema sbagliato.
applicaTema(temaIniziale());

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
