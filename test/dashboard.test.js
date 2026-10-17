/* =============================================================================
   test/dashboard.test.js
   -----------------------------------------------------------------------------
   Especificación ejecutable del módulo `src/client/js/dashboard.js`.

   IMPORTANTE: este archivo es la ESPECIFICACIÓN. Si algún test falla porque el
   refactor de `dashboard.js` aún no ha terminado o no respeta la interface, NO
   se debe tocar el código de producción: el test marca el contrato esperado.

   Interface esperada (ver brief):
     createDashboard(root, options) -> { apply(state, opts?) }
     getDashboard(options)          -> singleton perezoso
     deriveProjectStatusLabel(state) -> string
     criteriaInfo(criteria, localCriteriaState) -> { total, checked, firstPending }
     critKey(index, text)           -> string
     getCriteria(task)              -> string[]
   ============================================================================= */

/* El helper DEBE importarse antes que el módulo de producción: instala
   globalThis.window / globalThis.document como efecto secundario del import. */
import { createRoot, emptyState, taskState } from "./helpers/dom-env.js";

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createDashboard,
  deriveProjectStatusLabel,
  criteriaInfo,
  critKey,
} from "../src/client/js/dashboard.js";

/** Helper: crea un root nuevo + una instancia de dashboard aislada. */
function mount(options = {}) {
  const root = createRoot();
  const dashboard = createDashboard(root, { onRequestTab: () => {}, ...options });
  return { root, dashboard };
}

/** Helper: genera N pistas escalonadas válidas. */
function makeHints(n) {
  return Array.from({ length: n }, (_, i) => ({
    level: i + 1,
    type: "concept",
    label: `Pista nivel ${i + 1}`,
    content: `Contenido de la pista ${i + 1}.`,
  }));
}

describe("dashboard.js · contrato público", () => {
  /* --------------------------------------------------------------------- */
  it("1. apply(stateVacio) muestra bienvenida, título en espera y empty-states", async () => {
    const { root, dashboard } = mount();

    await dashboard.apply(emptyState());

    const banner = root.querySelector("#welcomeBanner");
    assert.ok(banner, "existe el banner de bienvenida");
    assert.notEqual(
      banner.style.display,
      "none",
      "el banner de bienvenida debe quedar visible sin proyecto",
    );

    const title = root.querySelector("#taskTitle");
    assert.ok(title, "existe #taskTitle");
    assert.match(title.textContent, /esperando/i, "#taskTitle indica que espera un proyecto");

    assert.ok(
      root.querySelector("#competenciesList .empty-state"),
      "empty-state en competencias",
    );
    assert.ok(
      root.querySelector("#conceptsList .empty-state"),
      "empty-state en conceptos",
    );
    assert.ok(
      root.querySelector("#hintsContainer .empty-state"),
      "empty-state en pistas",
    );
    assert.ok(
      root.querySelector("#criteriaChecklist .empty-state"),
      "empty-state en criterios",
    );
  });

  /* --------------------------------------------------------------------- */
  it("2. apply(stateConTarea) fija contadores y pinta M hint-cards", async () => {
    const criteria = ["Criterio A", "Criterio B", "Criterio C"];
    const hints = makeHints(4);
    const { root, dashboard } = mount();

    await dashboard.apply(taskState({ criteria, hints }));

    assert.equal(
      root.querySelector("#criteriaTabCount").textContent.trim(),
      String(criteria.length),
      "criteriaTabCount refleja N criterios",
    );
    assert.equal(
      root.querySelector("#hintsTabCount").textContent.trim(),
      String(hints.length),
      "hintsTabCount refleja M pistas",
    );
    assert.equal(
      root.querySelectorAll(".hint-card").length,
      hints.length,
      "exactamente M elementos .hint-card",
    );
  });

  /* --------------------------------------------------------------------- */
  it("3. click en .criterion-item la marca (.checked + aria-checked) y avanza el progreso", async () => {
    const { root, dashboard } = mount();
    // Con un único criterio, marcarlo deja la tarea completa y cambia el
    // `data-state` de #nextStepPanel (pending -> done).
    await dashboard.apply(taskState({ criteria: ["Criterio único"], hints: [] }));

    const nextPanel = root.querySelector("#nextStepPanel");
    const stateBefore = nextPanel.getAttribute("data-state");
    const progressBefore = root.querySelector("#criteriaProgressLabel").textContent;

    const item = root.querySelector(".criterion-item");
    assert.ok(item, "se renderiza el .criterion-item");
    item.click();

    const after = root.querySelector(".criterion-item");
    assert.ok(after.classList.contains("checked"), "el criterio queda .checked");
    assert.equal(after.getAttribute("aria-checked"), "true", "aria-checked pasa a true");

    const progressAfter = root.querySelector("#criteriaProgressLabel").textContent;
    assert.notEqual(progressAfter, progressBefore, "criteriaProgressLabel sube");
    assert.match(progressAfter, /1\s*de\s*1/, "progreso refleja 1 de 1");

    assert.notEqual(
      root.querySelector("#nextStepPanel").getAttribute("data-state"),
      stateBefore,
      "#nextStepPanel cambia su data-state",
    );
  });

  /* --------------------------------------------------------------------- */
  it("4. click en el botón complete-next marca el primer criterio pendiente", async () => {
    const criteria = ["Primero", "Segundo", "Tercero"];
    const { root, dashboard } = mount();

    await dashboard.apply(taskState({ criteria, hints: [] }));

    const btn = root.querySelector('#nextStepPanel [data-action="complete-next"]');
    assert.ok(btn, "existe el botón [data-action=complete-next] en #nextStepPanel");

    btn.click();

    assert.equal(
      root.querySelector("#criteriaProgressLabel").textContent.trim(),
      "1 de 3 cumplidos",
      "el progreso sube tras completar el siguiente",
    );
    const first = root.querySelectorAll(".criterion-item")[0];
    assert.ok(first.classList.contains("checked"), "el primer criterio queda marcado");
    assert.equal(first.getAttribute("aria-checked"), "true");
  });

  /* --------------------------------------------------------------------- */
  it("5. click en .hint-header abre la tarjeta (open + aria-expanded)", async () => {
    const { root, dashboard } = mount();

    await dashboard.apply(taskState({ criteria: [], hints: makeHints(2) }));

    const header = root.querySelector(".hint-card .hint-header");
    assert.ok(header, "existe el .hint-header");
    header.click();

    const card = root.querySelector(".hint-card");
    assert.equal(card.classList.contains("open"), true, "la .hint-card queda abierta");
    assert.equal(
      root.querySelector(".hint-card .hint-header").getAttribute("aria-expanded"),
      "true",
      "aria-expanded pasa a true",
    );
  });

  /* --------------------------------------------------------------------- */
  it("6. apply(s) dos veces con el mismo estado reutiliza el nodo (dedupe)", async () => {
    const { root, dashboard } = mount();
    const s = taskState({ criteria: ["Uno", "Dos"], hints: [] });

    await dashboard.apply(s);
    const firstNode = root.querySelector(".criterion-item");
    assert.ok(firstNode, "el criterio se renderiza en el primer apply");

    await dashboard.apply(s);
    const secondNode = root.querySelector(".criterion-item");
    assert.ok(secondNode, "el criterio sigue presente en el segundo apply");

    // Se compara como booleano a propósito: comparar los nodos directamente
    // haría que node:assert intente serializar (util.inspect) dos elementos
    // happy-dom y agote la memoria al construir el mensaje de fallo.
    assert.equal(
      secondNode === firstNode,
      true,
      "aplicar el mismo estado no debe recrear los nodos del checklist (dedupe)",
    );
  });

  /* --------------------------------------------------------------------- */
  it("7. deriveProjectStatusLabel(state) deriva etiquetas cortas y estables", () => {
    assert.equal(deriveProjectStatusLabel({ exists: false }), "Sin proyecto activo");
    assert.equal(deriveProjectStatusLabel(null), "Sin proyecto activo");

    assert.equal(
      deriveProjectStatusLabel({ exists: true, status: "Proyecto completado con éxito" }),
      "Completado",
    );
    assert.equal(
      deriveProjectStatusLabel({ exists: true, status: "Trabajo en pausa por revisión" }),
      "En pausa",
    );
    assert.equal(
      deriveProjectStatusLabel({ exists: true, status: "Avanzando en el módulo de auth" }),
      "En desarrollo activo",
    );
    assert.equal(
      deriveProjectStatusLabel({ exists: true, status: "Fase 1: setup inicial" }),
      "En inicio",
    );

    // Sin texto de estado: se infiere de la tarea activa.
    assert.equal(
      deriveProjectStatusLabel({ exists: true, activeTask: { status: "completed" } }),
      "Tarea completada",
    );
    assert.equal(
      deriveProjectStatusLabel({ exists: true, activeTask: { status: "active" } }),
      "En desarrollo activo",
    );
    assert.equal(deriveProjectStatusLabel({ exists: true }), "En curso");
  });

  /* --------------------------------------------------------------------- */
  it("8. criteriaInfo(criteria, localCriteriaState) cuenta con estado controlado", () => {
    const criteria = ["Primero", "Segundo", "Tercero"];

    const empty = criteriaInfo([], {});
    assert.deepEqual(empty, { total: 0, checked: 0, firstPending: -1 });

    const none = criteriaInfo(criteria, {});
    assert.deepEqual(none, { total: 3, checked: 0, firstPending: 0 });

    const local = {
      [critKey(0, "Primero")]: true,
      [critKey(2, "Tercero")]: true,
    };
    const partial = criteriaInfo(criteria, local);
    assert.deepEqual(
      partial,
      { total: 3, checked: 2, firstPending: 1 },
      "el primer pendiente es el índice 1",
    );

    const all = {
      [critKey(0, "Primero")]: true,
      [critKey(1, "Segundo")]: true,
      [critKey(2, "Tercero")]: true,
    };
    assert.deepEqual(criteriaInfo(criteria, all), {
      total: 3,
      checked: 3,
      firstPending: -1,
    });
  });

  /* --------------------------------------------------------------------- */
  it("9. no fabrica stack: sin tecnologías declaradas no pinta chips inventados", async () => {
    const { root, dashboard } = mount();
    const chips = () =>
      [...root.querySelector("#techStackContainer").querySelectorAll(".tech-chip")].map(
        (c) => c.textContent,
      );

    /* Tarea real pero sin stack declarado: antes el cliente inventaba
       "TypeScript", "Node.js" y "OpenCode" como si fueran del alumno. */
    await dashboard.apply({ ...taskState(), techStack: [] });
    assert.deepEqual(chips(), [], "no debe inventarse el stack del alumno");

    /* Con stack declarado en el archivo, se pinta tal cual. */
    await dashboard.apply({ ...taskState(), techStack: ["Kotlin"] });
    assert.deepEqual(chips(), ["Kotlin"]);
  });
});
