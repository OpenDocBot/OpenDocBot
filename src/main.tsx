import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initManagedConfig } from "./lib/managedConfigBootstrap";

async function start() {
  // Resolve the managed config before first paint so the first render already
  // uses the effective config. Never blocks on a failure (loadManagedConfig
  // resolves to `unavailable`).
  await initManagedConfig();
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

void start();
