/* =============================================================================
   test/parser-managed-block.test.js
   -----------------------------------------------------------------------------
   Especificación ejecutable de la integración del bloque gestionado en el
   parser, más los arreglos heurísticos (a–g).

   Importa desde `dist/`, por lo que `npx tsc` debe ejecutarse antes.
   ============================================================================= */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseLearningMarkdown } from "../dist/parser.js";
import { renderTaskBlock } from "../dist/task-writer.js";

/* --- Fixture: bloque gestionado completo ----------------------------------- */

function managedBlock() {
  return renderTaskBlock({
    evaluationCriteria: ["Devuelve hola", "Maneja el caso vacío"],
    checkedCriteria: ["El proyecto compila"],
    hints: [
      { level: 1, label: "Concepto", type: "concept", content: "Piensa entrada y salida." },
      { level: 2, label: "Estrategia", type: "algorithm", content: "Divide el problema." },
    ],
    referenceSnippet: 'function hola(): string {\n  return "hola";\n}',
    referenceLanguage: "ts",
    referenceNotes: ["Mantén la función pequeña.", "Escribe un test primero."],
  });
}

/* ============================================================================= */

describe("parser · bloque gestionado (autoritativo)", () => {
  const MD = [
    "# Objetivo",
    "- **Proyecto**: Demo",
    "",
    "## Tarea Activa",
    "### Implementar saludo",
    "",
    "Escribe una función que devuelva hola.",
    "",
    managedBlock(),
    "",
    "## Estado",
    "- En progreso",
    "",
  ].join("\n");

  const state = parseLearningMarkdown(MD, "LEARNING.md");
  const task = state.activeTask;

  it("crea la tarea activa y conserva el título y el rawContent completo", () => {
    assert.ok(task, "hay tarea activa");
    assert.equal(task.title, "Implementar saludo");
    assert.equal(state.rawContent, MD);
  });

  it("usa las pistas reales del bloque (nivel/etiqueta/contenido/tipo)", () => {
    assert.equal(task.hints.length, 2);
    assert.deepEqual(
      task.hints.map((h) => ({ level: h.level, label: h.label, type: h.type })),
      [
        { level: 1, label: "Concepto", type: "concept" },
        { level: 2, label: "Estrategia", type: "algorithm" },
      ]
    );
    assert.deepEqual(
      task.hints.map((h) => h.content),
      ["Piensa entrada y salida.", "Divide el problema."]
    );
    for (const hint of task.hints) {
      assert.doesNotMatch(hint.content, /\*\*/, "sin `**` crudos");
      assert.doesNotMatch(hint.label, /\*\*/, "sin `**` crudos en la etiqueta");
    }
  });

  it("usa el snippet y el lenguaje del bloque", () => {
    assert.equal(task.referenceSnippet, 'function hola(): string {\n  return "hola";\n}');
    assert.equal(task.referenceLanguage, "ts");
  });

  it("usa las notas de anatomía del bloque", () => {
    assert.deepEqual(task.referenceNotes, [
      "Mantén la función pequeña.",
      "Escribe un test primero.",
    ]);
  });

  it("usa los criterios del bloque (marcados y no marcados, en orden)", () => {
    assert.deepEqual(task.evaluationCriteria, [
      "Devuelve hola",
      "Maneja el caso vacío",
      "El proyecto compila",
    ]);
  });

  it("la descripción NO contiene el código ni los marcadores del bloque", () => {
    assert.ok(task.description, "hay descripción");
    assert.doesNotMatch(task.description, /function hola/);
    assert.doesNotMatch(task.description, /```/);
    assert.doesNotMatch(task.description, /menthor:task/);
    assert.doesNotMatch(task.description, /### /);
  });
});

/* ============================================================================= */

describe("parser · heurístico sin bloque (arreglos b, c, d, f)", () => {
  const MD = [
    "# Objetivo",
    "- **Proyecto**: Demo",
    "",
    "## Tarea Activa",
    "### Calcular el total",
    "",
    "Implementa el cálculo.",
    "",
    "- Definir tipos.",
    "-",
    "- **Restricciones**:",
    "- Prohibido usar any.",
    "",
    "- **Pistas**:",
    "- Revisa los tipos.",
    "- Divide el problema.",
    "- Comprueba los casos límite.",
    "",
    "**Referencia y sintaxis**:",
    "```ts",
    "const total = items.reduce((a, b) => a + b, 0);",
    "```",
    "",
    "### Anatomía y buenas prácticas",
    "- Mantén las funciones puras.",
    "- Nombra bien las variables.",
    "",
  ].join("\n");

  const state = parseLearningMarkdown(MD, "LEARNING.md");
  const task = state.activeTask;

  it("produce exactamente 3 pistas, sin la falsa «Referencia y sintaxis»", () => {
    assert.ok(task);
    assert.equal(task.hints.length, 3);
    assert.deepEqual(
      task.hints.map((h) => h.label),
      ["Pista 1", "Pista 2", "Pista 3"]
    );
    assert.deepEqual(
      task.hints.map((h) => h.content),
      ["Revisa los tipos.", "Divide el problema.", "Comprueba los casos límite."]
    );
    for (const hint of task.hints) {
      assert.doesNotMatch(hint.content, /Referencia/i);
    }
  });

  it("no filtra el código del fence a la descripción", () => {
    assert.ok(task.description);
    assert.doesNotMatch(task.description, /const total/);
    assert.doesNotMatch(task.description, /```/);
  });

  it("llena referenceNotes con la anatomía", () => {
    assert.deepEqual(task.referenceNotes, [
      "Mantén las funciones puras.",
      "Nombra bien las variables.",
    ]);
  });

  it("higiene de requirements: sin entradas vacías ni etiquetas sin valor", () => {
    assert.deepEqual(task.requirements, ["Definir tipos.", "Prohibido usar any."]);
  });

  it("extrae el snippet del fence (comportamiento previo intacto)", () => {
    assert.equal(
      task.referenceSnippet,
      "const total = items.reduce((a, b) => a + b, 0);"
    );
  });
});

/* ============================================================================= */

describe("parser · `### Anatomía y buenas prácticas` no es título", () => {
  it("conserva el título real y no se cuela la subsección de anatomía", () => {
    const MD = [
      "## Tarea Activa",
      "### Hacer algo",
      "",
      "- **Tu Trabajo**: resuélvelo.",
      "",
      "### Anatomía y buenas prácticas",
      "- Una nota.",
      "",
    ].join("\n");

    const task = parseLearningMarkdown(MD, "LEARNING.md").activeTask;
    assert.ok(task);
    assert.equal(task.title, "Hacer algo");
    assert.doesNotMatch(task.title, /anatom/i);
    assert.deepEqual(task.referenceNotes, ["Una nota."]);
  });
});

/* ============================================================================= */

describe("parser · el submodo `criteria` termina ante heading/etiqueta", () => {
  it("un heading posterior cambia de submodo (criterios → pistas)", () => {
    const MD = [
      "## Tarea Activa",
      "### Hacer X",
      "### Criterios de aceptación",
      "- [ ] primero",
      "- segundo",
      "### Pistas",
      "- pista única",
      "",
    ].join("\n");

    const task = parseLearningMarkdown(MD, "LEARNING.md").activeTask;
    assert.ok(task);
    assert.deepEqual(task.evaluationCriteria, ["primero", "segundo"]);
    assert.equal(task.hints.length, 1);
    assert.equal(task.hints[0].content, "pista única");
  });

  it("una etiqueta en negrita no-pista termina `criteria`", () => {
    const MD = [
      "## Tarea Activa",
      "### Hacer Y",
      "### Criterios de aceptación",
      "- [ ] uno",
      "**Anatomía y buenas prácticas**:",
      "- nota de anatomía",
      "",
    ].join("\n");

    const task = parseLearningMarkdown(MD, "LEARNING.md").activeTask;
    assert.ok(task);
    assert.deepEqual(task.evaluationCriteria, ["uno"]);
    assert.deepEqual(task.referenceNotes, ["nota de anatomía"]);
  });
});

/* ============================================================================= */

describe("parser · retrocompatibilidad sin bloque", () => {
  it("sigue produciendo tarea activa, título y criterios", () => {
    const MD = [
      "# Objetivo",
      "- **Proyecto**: Demo",
      "",
      "## Tarea Activa",
      "### Implementar saludo",
      "",
      '- **Tu Trabajo**: Escribe una función que devuelva "hola".',
      "",
      "### Criterios de Aceptación",
      '- [ ] Devuelve "hola"',
      "",
      "### Pistas",
      "- Revisa la firma.",
      "- Mira los tests.",
      "- Casos límite.",
      "",
    ].join("\n");

    const task = parseLearningMarkdown(MD, "LEARNING.md").activeTask;
    assert.ok(task, "hay tarea activa");
    assert.equal(task.title, "Implementar saludo");
    assert.deepEqual(task.evaluationCriteria, ['Devuelve "hola"']);
    assert.equal(task.hints.length, 3);
    assert.deepEqual(
      task.hints.map((h) => h.label),
      ["Pista 1", "Pista 2", "Pista 3"]
    );
  });

  it("sin sección de tarea activa no fabrica tarea", () => {
    const MD = ["# Objetivo", "- **Proyecto**: Demo", "", "## Estado", "- listo", ""].join(
      "\n"
    );
    const state = parseLearningMarkdown(MD, "LEARNING.md");
    assert.equal(state.activeTask, null);
  });
});
