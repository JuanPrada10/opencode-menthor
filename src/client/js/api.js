/* =============================================================================
   api.js — adapter de transporte (/api/state y /api/events).
   Recibe el sink de pintado por parámetro: NO importa dashboard.js, render.js
   ni state.js. Mantiene su propio ref de chrome (connectionText) porque es
   quien conoce el estado real de la conexión.
   El proyecto activo (clave + normalización) lo posee projectStore.js.
   ============================================================================= */

import { read as readProjectDir, write as writeProjectDir, fromFilePath } from "./projectStore.js";

/* Último estado observado (para decidir si repintar sin depender del módulo). */
var lastSource = null;

/* Ref local del indicador de conexión (chrome del topbar). */
var connectionTextEl = null;
function setConnection(text) {
  if (connectionTextEl === null) {
    try { connectionTextEl = document.getElementById("connectionText"); } catch (err) { connectionTextEl = null; }
  }
  if (connectionTextEl) connectionTextEl.textContent = text;
}

function noop() {}

/* Resuelve la carpeta de proyecto: override -> ?dir= -> proyecto guardado.
   Persiste la ruta resuelta (ya normalizada) y la devuelve normalizada. */
function resolveProjectDir(overrideDir) {
  var queryDir = overrideDir;
  if (!queryDir) {
    queryDir = new URLSearchParams(window.location.search).get("dir");
  }
  if (!queryDir) queryDir = readProjectDir();
  if (!queryDir) return null;
  return writeProjectDir(queryDir);
}

/* Trae el estado más reciente del servidor y repinta si cambió.
   opts: { apply?: (state, o?) => void, dir?: string, force?: boolean } */
export async function fetchLatestState(opts) {
  var cfg = opts || {};
  var apply = (typeof cfg.apply === "function") ? cfg.apply : noop;
  try {
    var queryDir = resolveProjectDir(cfg.dir);
    var fetchUrl = queryDir ? "/api/state?dir=" + encodeURIComponent(queryDir) : "/api/state";
    var res = await fetch(fetchUrl, { cache: "no-store" });
    if (res.ok) {
      var freshState = await res.json();
      // Si el estado vino con filePath y no teníamos dir guardado, guardarlo de inmediato
      if (freshState && freshState.filePath) {
        writeProjectDir(fromFilePath(freshState.filePath));
      }
      var rawAfter = freshState ? freshState.rawContent : "";
      var existsAfter = freshState ? freshState.exists : null;
      var changed = !lastSource || lastSource.raw !== rawAfter || lastSource.exists !== existsAfter || !!cfg.dir;
      lastSource = { raw: rawAfter, exists: existsAfter };
      if (changed) apply(freshState, { force: !!cfg.force });
      setConnection("En vivo");
    }
  } catch (err) {
    setConnection("Reconectando…");
  }
}

/* Arranca la sincronización: SSE con respaldo de sondeo continuo.
   opts: { apply?: (state, o?) => void } */
export function startSync(opts) {
  var cfg = opts || {};
  var apply = (typeof cfg.apply === "function") ? cfg.apply : noop;

  /* Server-Sent Events si están disponibles */
  try {
    var sse = new EventSource("/api/events");
    sse.onmessage = function (event) {
      try {
        var state = JSON.parse(event.data);
        if (state) {
          lastSource = { raw: state.rawContent, exists: state.exists };
          apply(state);
        }
      } catch (err) {}
    };
    sse.onopen = function () {
      setConnection("En vivo");
    };
    sse.onerror = function () {
      setConnection("Sondeo continuo");
    };
  } catch (err) {
    /* Sin SSE: el sondeo se encarga */
  }

  /* Sondeo de seguridad */
  setInterval(function () { fetchLatestState({ apply: apply }); }, 1500);
}
