import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./tokens.css";
import { applyTheme, loadTheme } from "./theme";

// Apply persisted theme before first paint so there's no flash of wrong theme.
applyTheme(loadTheme());

// `?mock` in dev swaps the Tauri backend for canned data (see dev/mockTauri.ts). It must be in
// place before App's first invoke, hence the wait. A release build drops the branch entirely.
const backend =
  import.meta.env.DEV && new URLSearchParams(location.search).has("mock")
    ? import("./dev/mockTauri")
    : Promise.resolve();

backend.then(() =>
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  ),
);
