/* =============================================================================
   main.js — composition root del cliente de Menthor Studio.
   Referenciado como: <script type="module" src="/js/main.js"></script>

   Responsabilidades:
     1. Crear el dashboard (module profundo) y cablear onRequestTab.
     2. Leer el estado inicial desde <script id="initial-state" type="application/json">.
        Si falta o está vacío -> fetchLatestState().
     3. Enganchar los listeners de chrome (initUi) con el sink `apply`.
     4. Arrancar la sincronización (SSE + sondeo) con el sink `apply`.
   ============================================================================= */

import { createDashboard } from "./dashboard.js";
import { fetchLatestState, startSync } from "./api.js";
import { initUi, activateTab } from "./ui.js";

/* Estado inicial embebido por el servidor (JSON inline). */
function readInitialState() {
  var node = document.getElementById("initial-state");
  if (!node) return null;
  var text = (node.textContent || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
}

function boot() {
  /* El dashboard posee el pintado y las interacciones de criterios/pistas.
     "Ver todos los criterios" pide el cambio de pestaña vía onRequestTab. */
  var dashboard = createDashboard(document.body, {
    onRequestTab: function (tabId) { activateTab(tabId, true); }
  });
  var apply = dashboard.apply;

  var initial = readInitialState();

  initUi({ apply: apply });
  startSync({ apply: apply });

  if (initial) {
    apply(initial);
  } else {
    fetchLatestState({ apply: apply, force: true });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

export {};
