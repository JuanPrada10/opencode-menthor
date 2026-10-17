/* =============================================================================
   test/helpers/dom-env.js
   -----------------------------------------------------------------------------
   Arranque del entorno DOM para los tests del dashboard.

   Se instala como EFECTO SECUNDARIO del import (no hace falta llamar a nada):
   los imports ESM se evalúan en orden de aparición, así que mientras este módulo
   se importe ANTES que `../src/client/js/dashboard.js`, `globalThis.window` y
   `globalThis.document` ya existen cuando se evalúa el módulo de producción
   (importante porque algunos módulos del cliente tocan `document` en su nivel
   superior, p. ej. `state.js`).

   Se usa happy-dom in-process (sin navegador real).
   ============================================================================= */

import { Window } from "happy-dom";

/* Una única ventana happy-dom por proceso de test (node --test aísla por archivo). */
const win = new Window({ url: "http://localhost/" });

export const window = win;
export const document = win.document;

/* Instala los globales que el cliente espera encontrar (window/document y compañía).
   Se usa defineProperty porque algunos (p. ej. `navigator`) son accesores de solo
   lectura en el runtime de Node y una asignación directa lanzaría en modo estricto. */
const GLOBALS = {
  window: win,
  document: win.document,
  navigator: win.navigator,
  localStorage: win.localStorage,
  HTMLElement: win.HTMLElement,
  Element: win.Element,
  Node: win.Node,
  Event: win.Event,
  CustomEvent: win.CustomEvent,
  MouseEvent: win.MouseEvent,
  KeyboardEvent: win.KeyboardEvent,
  requestAnimationFrame: win.requestAnimationFrame.bind(win),
  cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
  getComputedStyle: win.getComputedStyle.bind(win),
};

for (const [name, value] of Object.entries(GLOBALS)) {
  try {
    Object.defineProperty(globalThis, name, {
      value,
      writable: true,
      configurable: true,
    });
  } catch {
    /* Global bloqueado por el runtime: se ignora. */
  }
}

/* -----------------------------------------------------------------------------
   Fixture del DOM.

   Contiene EXACTAMENTE los ids/clases que el dashboard manipula, copiados de
   `src/views/dashboard.eta`. Mantenerlo sincronizado con ese template.
   ----------------------------------------------------------------------------- */
export const FIXTURE_HTML = /* html */ `
  <a class="skip-link" href="#main-content">Saltar al contenido principal</a>

  <header class="topbar">
    <span class="project-pill-path" id="projectPillPath"><span id="projectPillPathText">Cargando proyecto…</span></span>
    <span class="live-badge" role="status" aria-live="polite">
      <span id="connectionText">Sincronizado</span>
    </span>
  </header>

  <main class="studio-container" id="main-content">

    <section class="task-column" aria-label="Tarea activa">

      <div class="welcome-banner" id="welcomeBanner" style="display: none;">
        <div class="welcome-banner-header">
          <h2 class="welcome-banner-title">Conecta tu proyecto</h2>
          <p class="welcome-banner-desc">No encontramos <code class="inline-code">LEARNING.md</code>.</p>
        </div>
        <div class="welcome-input-group">
          <label class="sr-only" for="welcomeProjectInput">Ruta del proyecto</label>
          <input type="text" class="text-input" id="welcomeProjectInput" spellcheck="false" autocomplete="off">
          <button type="button" class="btn-primary" id="btnWelcomeLoad">Cargar proyecto</button>
        </div>
        <div class="quick-folder-chips">
          <button type="button" class="quick-folder-btn" id="chipPruebaAgente" data-path="C:\\Users\\Juan\\Desktop\\pruebaAgente">pruebaAgente</button>
        </div>
      </div>

      <article class="card active-task-hero" aria-labelledby="taskTitle">
        <div class="task-hero-top">
          <span class="task-badge-active" id="taskStatusBadge" data-state="active">
            <span id="taskStatusText">Tarea activa</span>
          </span>
        </div>

        <h1 class="task-title" id="taskTitle">Sin tarea asignada</h1>
        <div class="task-desc prose" id="taskDesc">Solicita una misión a Menthor para empezar.</div>

        <div class="next-step" id="nextStepPanel" data-state="idle"></div>

        <div class="tabs-nav" role="tablist" aria-label="Detalle de la tarea activa">
          <button type="button" class="tab-btn active" id="tabBtnCriteria" data-tab="tab-criteria" role="tab" aria-selected="true" aria-controls="tab-criteria" tabindex="0">
            Criterios de aceptación
            <span class="tab-count" id="criteriaTabCount">0</span>
          </button>
          <button type="button" class="tab-btn" id="tabBtnReference" data-tab="tab-reference" role="tab" aria-selected="false" aria-controls="tab-reference" tabindex="-1">
            Referencia y sintaxis
          </button>
          <button type="button" class="tab-btn" id="tabBtnHints" data-tab="tab-hints" role="tab" aria-selected="false" aria-controls="tab-hints" tabindex="-1">
            Pistas escalonadas
            <span class="tab-count" id="hintsTabCount">0</span>
          </button>
        </div>

        <div class="tab-panel active" id="tab-criteria" role="tabpanel" aria-labelledby="tabBtnCriteria" tabindex="0">
          <div class="panel-head">
            <p class="panel-hint">Marca cada criterio cuando lo hayas cumplido.</p>
            <span class="panel-count" id="criteriaProgressLabel">0 de 0 cumplidos</span>
          </div>
          <div class="criteria-checklist" id="criteriaChecklist" role="group" aria-label="Criterios de aceptación de la tarea"></div>
        </div>

        <div class="tab-panel" id="tab-reference" role="tabpanel" aria-labelledby="tabBtnReference" tabindex="0">
          <pre class="code-pre" id="codeSnippetBox"><code>// Cargando patrón de referencia…</code></pre>
          <div class="anatomy-notes">
            <div class="anatomy-list" id="anatomyList"></div>
          </div>
        </div>

        <div class="tab-panel" id="tab-hints" role="tabpanel" aria-labelledby="tabBtnHints" tabindex="0">
          <div class="hints-stack" id="hintsContainer"></div>
        </div>
      </article>
    </section>

    <aside class="radar-column" aria-label="Radar pedagógico">
      <section class="card project-hero-card">
        <span class="status-pill" id="projectStatus">En curso</span>
        <div class="objective-content" id="projectObjective">Cargando objetivo…</div>
        <div class="meta-row" id="techStackContainer"></div>
        <div class="status-block" id="projectStatusBlock" hidden>
          <div class="status-text prose" id="projectStatusDetail"></div>
        </div>
        <span class="progress-pct" id="competencyPct">0%</span>
        <div class="progress-track" id="competencyTrack" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <span class="progress-fill" id="progressFill"></span>
        </div>
        <p class="progress-hint" id="progressHint">0 de 0 competencias dominadas</p>
      </section>

      <section class="card">
        <span class="count-chip" id="compCount">0/0</span>
        <ul class="status-summary" id="compSummary" hidden></ul>
        <ul class="items-list" id="competenciesList"></ul>
      </section>

      <section class="card">
        <span class="count-chip" id="conceptsCount">0/0</span>
        <ul class="items-list" id="conceptsList"></ul>
      </section>
    </aside>
  </main>

  <div class="modal-backdrop" id="rawModalBackdrop" role="dialog" aria-modal="true">
    <pre id="rawMarkdownContent">Cargando…</pre>
  </div>

  <div class="modal-backdrop" id="projectDirModal" role="dialog" aria-modal="true">
    <input type="text" class="text-input" id="projectModalInput">
    <button type="button" id="btnCloseProjectModal">Cerrar</button>
    <button type="button" id="btnCancelProjectModal">Cancelar</button>
    <button type="button" id="btnConfirmProjectModal">Cargar proyecto</button>
  </div>

  <div class="toast" id="toastBox" role="status" aria-live="polite">
    <span id="toastMessage">Acción completada</span>
  </div>
`;

/**
 * Reconstruye el DOM del dashboard y devuelve el `root` listo para
 * `createDashboard(root, { onRequestTab })`.
 *
 * Se limpia también el `localStorage` para aislar cada test.
 */
export function createRoot() {
  try {
    win.localStorage.clear();
  } catch {
    /* happy-dom siempre expone localStorage; se ignora si no. */
  }
  document.body.innerHTML = FIXTURE_HTML;
  return document.body;
}

/** Estado vacío: sin proyecto / sin LEARNING.md. */
export function emptyState() {
  return {
    exists: false,
    filePath: null,
    projectName: "",
    status: "",
    objective: "",
    learningGoals: [],
    techStack: [],
    competencies: [],
    concepts: [],
    activeTask: null,
    rawContent: "",
  };
}

/**
 * Estado con proyecto y (opcionalmente) tarea activa.
 *
 * @param {{ criteria?: string[], hints?: any[], title?: string, taskStatus?: string }} [opts]
 */
export function taskState(opts = {}) {
  const {
    title = "Implementa el validador de correo",
    criteria = [],
    hints = [],
    taskStatus = "active",
  } = opts;

  return {
    exists: true,
    filePath: "C:\\proyectos\\demo\\LEARNING.md",
    projectName: "Proyecto Demo",
    status: "En desarrollo activo",
    objective: "Aprender a validar entradas del usuario.",
    learningGoals: ["Comprender expresiones regulares"],
    techStack: ["TypeScript", "Node.js"],
    competencies: [],
    concepts: [],
    activeTask: {
      title,
      description: "Describe e implementa la solución paso a paso.",
      status: taskStatus,
      evaluationCriteria: criteria,
      hints,
      referenceSnippet: "const re = /^[^@]+@[^@]+$/;",
      referenceNotes: ["Ancla y prueba el patrón con casos límite."],
    },
    rawContent: "# LEARNING.md\n",
  };
}
