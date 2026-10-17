/* =============================================================================
   test/dashboard-isolation.test.js
   -----------------------------------------------------------------------------
   Verifica el CONTRATO DE `root` de `src/client/js/dashboard.js`: la factory
   debe funcionar montada en CUALQUIER contenedor que contenga el shell del
   dashboard, no sólo en `document.body`.

   Por eso todos los tests construyen a mano un contenedor PROPIO y DESMONTADO
   (nunca se hace appendChild a `document.body`): así `document.getElementById`
   y `document.querySelectorAll` no pueden "ver" el shell y cualquier dependencia
   del documento global se manifestaría como un fallo.

   El shell se escribe a mano con lo mínimo que el dashboard necesita: la barra
   de pestañas + sus paneles y los contenedores del pintado.
   ============================================================================= */

/* El helper DEBE importarse antes que el módulo de producción: instala
   globalThis.window / globalThis.document como efecto secundario del import. */
import { document, emptyState, taskState } from "./helpers/dom-env.js";

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createDashboard } from "../src/client/js/dashboard.js";

/* -----------------------------------------------------------------------------
   Shell mínimo del dashboard (tabs + paneles + contenedores).
   Se inyecta DENTRO de un contenedor propio; nada de esto entra en document.body.
   ----------------------------------------------------------------------------- */
const SHELL = /* html */ `
  <div class="welcome-banner" id="welcomeBanner" style="display: none;">
    <input type="text" id="welcomeProjectInput">
    <button type="button" id="chipPruebaAgente" data-path="C:\\proyectos\\demo">pruebaAgente</button>
  </div>

  <article class="active-task-hero">
    <span id="taskStatusBadge" data-state="active"><span id="taskStatusText"></span></span>
    <h1 id="taskTitle"></h1>
    <div id="taskDesc"></div>
    <div id="nextStepPanel" data-state="idle"></div>

    <div class="tabs-nav" role="tablist" aria-label="Detalle de la tarea activa">
      <button type="button" class="tab-btn active" id="tabBtnCriteria" data-tab="tab-criteria" role="tab" aria-selected="true" aria-controls="tab-criteria" tabindex="0">
        Criterios de aceptación <span class="tab-count" id="criteriaTabCount">0</span>
      </button>
      <button type="button" class="tab-btn" id="tabBtnReference" data-tab="tab-reference" role="tab" aria-selected="false" aria-controls="tab-reference" tabindex="-1">
        Referencia y sintaxis
      </button>
      <button type="button" class="tab-btn" id="tabBtnHints" data-tab="tab-hints" role="tab" aria-selected="false" aria-controls="tab-hints" tabindex="-1">
        Pistas escalonadas <span class="tab-count" id="hintsTabCount">0</span>
      </button>
    </div>

    <div class="tab-panel active" id="tab-criteria" role="tabpanel" tabindex="0">
      <span id="criteriaProgressLabel">0 de 0 cumplidos</span>
      <div class="criteria-checklist" id="criteriaChecklist"></div>
    </div>
    <div class="tab-panel" id="tab-reference" role="tabpanel" tabindex="0">
      <pre id="codeSnippetBox"><code></code></pre>
      <div id="anatomyList"></div>
    </div>
    <div class="tab-panel" id="tab-hints" role="tabpanel" tabindex="0">
      <div class="hints-stack" id="hintsContainer"></div>
    </div>
  </article>

  <aside class="radar-column">
    <span id="projectStatus"></span>
    <div id="projectObjective"></div>
    <div id="techStackContainer"></div>
    <div id="projectStatusBlock" hidden><div id="projectStatusDetail"></div></div>
    <span id="competencyPct"></span>
    <div id="competencyTrack" role="progressbar" aria-valuenow="0"><span id="progressFill"></span></div>
    <p id="progressHint"></p>
    <span id="compCount"></span>
    <ul id="compSummary" hidden></ul>
    <ul id="competenciesList"></ul>
    <span id="conceptsCount"></span>
    <ul id="conceptsList"></ul>
  </aside>

  <span id="projectPillPathText"></span>
  <input type="text" id="projectModalInput">
  <pre id="rawMarkdownContent"></pre>
`;

/**
 * Crea un contenedor PROPIO con el shell, DESMONTADO del documento.
 * Nunca se hace `document.body.appendChild`: el contenedor queda huérfano.
 */
function detachedRoot(shell = SHELL) {
  const root = document.createElement("div");
  root.innerHTML = shell;
  return root;
}

/** Monta el dashboard en un contenedor desmontado. */
function mountDetached(options = {}) {
  const root = detachedRoot();
  const dashboard = createDashboard(root, { onRequestTab: () => {}, ...options });
  return { root, dashboard };
}

/** Genera N pistas escalonadas válidas. */
function makeHints(n) {
  return Array.from({ length: n }, (_, i) => ({
    level: i + 1,
    type: "concept",
    label: `Pista nivel ${i + 1}`,
    content: `Contenido de la pista ${i + 1}.`,
  }));
}

/** Captura las llamadas a console.warn durante `fn` y las devuelve. */
function captureWarnings(fn) {
  const original = console.warn;
  const calls = [];
  console.warn = (...args) => { calls.push(args.join(" ")); };
  try {
    fn();
  } finally {
    console.warn = original;
  }
  return calls;
}

describe("dashboard.js · aislamiento del contrato de root", () => {
  /* --------------------------------------------------------------------- */
  it("1. apply(state) pinta dentro de un contenedor desmontado", async () => {
    const { root, dashboard } = mountDetached();

    // El shell NO está en el documento: document.getElementById no lo ve.
    assert.equal(document.getElementById("taskTitle"), null, "el shell no vive en el documento");
    assert.ok(root.querySelector("#taskTitle"), "pero sí dentro del root propio");

    await dashboard.apply(taskState({ criteria: ["A", "B"], hints: makeHints(2) }));

    assert.match(root.querySelector("#taskTitle").textContent, /validador/i, "#taskTitle pintado");
    assert.equal(root.querySelector("#criteriaTabCount").textContent.trim(), "2", "contador de criterios");
    assert.equal(root.querySelector("#hintsTabCount").textContent.trim(), "2", "contador de pistas");
    assert.equal(root.querySelectorAll(".criterion-item").length, 2, "2 criterios en el checklist");
    assert.equal(root.querySelectorAll(".hint-card").length, 2, "2 pistas renderizadas");
  });

  /* --------------------------------------------------------------------- */
  it("2. cambiar de pestaña activa el panel correcto con el contenedor desmontado", async () => {
    const { root, dashboard } = mountDetached();
    await dashboard.apply(taskState({ criteria: ["A"], hints: makeHints(2) }));

    const btnHints = root.querySelector('[data-tab="tab-hints"]');
    const panelHints = root.querySelector("#tab-hints");
    const panelCriteria = root.querySelector("#tab-criteria");

    assert.equal(panelHints.classList.contains("active"), false, "#tab-hints arranca inactivo");
    btnHints.click();

    assert.equal(panelHints.classList.contains("active"), true, "#tab-hints queda activo");
    assert.equal(panelCriteria.classList.contains("active"), false, "#tab-criteria se desactiva");
    assert.equal(btnHints.classList.contains("active"), true, "el botón queda activo");
    assert.equal(btnHints.getAttribute("aria-selected"), "true", "aria-selected del tab sube");

    // Volver a criterios: alternativa simétrica.
    root.querySelector('[data-tab="tab-criteria"]').click();
    assert.equal(panelCriteria.classList.contains("active"), true, "#tab-criteria vuelve a activo");
    assert.equal(panelHints.classList.contains("active"), false, "#tab-hints se desactiva");
  });

  /* --------------------------------------------------------------------- */
  it("3. el acordeón de pistas responde al click (toggle .open) desmontado", async () => {
    const { root, dashboard } = mountDetached();
    await dashboard.apply(taskState({ criteria: [], hints: makeHints(2) }));

    const header = root.querySelector(".hint-card .hint-header");
    assert.ok(header, "existe el .hint-header");
    const card = root.querySelector(".hint-card");

    header.click();
    assert.equal(card.classList.contains("open"), true, "la tarjeta se abre");
    assert.equal(header.getAttribute("aria-expanded"), "true", "aria-expanded true");

    header.click();
    assert.equal(card.classList.contains("open"), false, "la tarjeta se cierra");
    assert.equal(header.getAttribute("aria-expanded"), "false", "aria-expanded false");
  });

  /* --------------------------------------------------------------------- */
  it("4. marcar un criterio funciona con el contenedor desmontado", async () => {
    const { root, dashboard } = mountDetached();
    await dashboard.apply(taskState({ criteria: ["Criterio único"], hints: [] }));

    const item = root.querySelector(".criterion-item");
    assert.ok(item, "se renderiza el .criterion-item");
    item.click();

    const after = root.querySelector(".criterion-item");
    assert.ok(after.classList.contains("checked"), "el criterio queda .checked");
    assert.equal(after.getAttribute("aria-checked"), "true", "aria-checked pasa a true");
    assert.match(
      root.querySelector("#criteriaProgressLabel").textContent,
      /1\s*de\s*1/,
      "el progreso refleja 1 de 1",
    );
  });

  /* --------------------------------------------------------------------- */
  it("5. si falta un nodo requerido: avisa UNA vez, no lanza y el resto sigue", async () => {
    const root = detachedRoot();
    // Falta un nodo REQUERIDO del shell: el panel #tab-criteria.
    root.querySelector("#tab-criteria").remove();

    let dashboard;
    const warnings = captureWarnings(() => {
      dashboard = createDashboard(root, { onRequestTab: () => {} });
    });

    assert.equal(warnings.length, 1, "avisa exactamente una vez al construir");
    assert.match(warnings[0], /#tab-criteria/, "el aviso nombra el nodo que falta");

    // No lanza y el resto del dashboard sigue operando.
    const hints = makeHints(2);
    await dashboard.apply(taskState({ criteria: ["A"], hints }));

    assert.match(root.querySelector("#taskTitle").textContent, /validador/i, "el título se pinta igual");
    assert.equal(root.querySelectorAll(".hint-card").length, 2, "las pistas se pintan igual");

    // El cambio de pestaña (botones + paneles presentes) sigue funcionando.
    const btnHints = root.querySelector('[data-tab="tab-hints"]');
    btnHints.click();
    assert.equal(root.querySelector("#tab-hints").classList.contains("active"), true, "las pestañas siguen operando");

    // Interactuar no vuelve a avisar (el aviso es único).
    root.querySelector(".hint-card .hint-header").click();
    assert.equal(warnings.length, 1, "las interacciones posteriores no repiten el aviso");
  });

  /* --------------------------------------------------------------------- */
  it("6. no toca nodos fuera del root (dos contenedores aislados)", async () => {
    const a = detachedRoot();
    const b = detachedRoot();

    const dashboard = createDashboard(a, { onRequestTab: () => {} });
    await dashboard.apply(taskState({ criteria: ["Solo en A"], hints: makeHints(1) }));

    assert.equal(a.querySelectorAll(".criterion-item").length, 1, "A recibe el pintado");
    assert.equal(b.querySelectorAll(".criterion-item").length, 0, "B queda intacto");
    assert.equal(b.querySelectorAll(".hint-card").length, 0, "B no recibe pistas");
    assert.equal(b.querySelector("#criteriaTabCount").textContent.trim(), "0", "los contadores de B no cambian");
    assert.equal(b.querySelector("#taskTitle").textContent, "", "el título de B no se toca");
  });

  /* --------------------------------------------------------------------- */
  it("7. apply(emptyState) pinta los empty-states dentro del contenedor desmontado", async () => {
    const { root, dashboard } = mountDetached();
    await dashboard.apply(emptyState());

    assert.notEqual(root.querySelector("#welcomeBanner").style.display, "none", "banner visible sin proyecto");
    assert.ok(root.querySelector("#criteriaChecklist .empty-state"), "empty-state en criterios");
    assert.ok(root.querySelector("#hintsContainer .empty-state"), "empty-state en pistas");
    assert.ok(root.querySelector("#competenciesList .empty-state"), "empty-state en competencias");
  });
});
