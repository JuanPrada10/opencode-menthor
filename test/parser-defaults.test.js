/* =============================================================================
   test/parser-defaults.test.js
   -----------------------------------------------------------------------------
   Especificación ejecutable de la separación parseo/defaults (tarea "B", R5).

   Contrato verificado:
     1. `parseLearningMarkdown` es PURO: sólo devuelve lo que hay en el archivo,
        sin inventar snippet, pistas ni stack.
     2. `applyPedagogicalDefaults` concentra la fabricación de contenido por
        defecto, que debe ser genérico, agnóstico y honesto (etiquetado).
     3. `parseLearningFile` conserva su contrato: devuelve el estado CON los
        defaults aplicados.

   Importa desde `dist/`, por lo que `npm run build` debe ejecutarse antes.
   ============================================================================= */

import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseLearningMarkdown, parseLearningFile } from "../dist/parser.js";
import {
  applyPedagogicalDefaults,
  UNDECLARED_STACK_LABEL,
  GENERIC_CONTENT_NOTICE,
} from "../dist/defaults.js";

/* --- Cadenas PROHIBIDAS en cualquier texto por defecto (punto 3) -----------
   `LEARNING.md` se incluye a propósito: los defaults ni siquiera lo nombran
   (usan "tu archivo de entrada"), así que la prueba puede ser estricta. */
const FORBIDDEN = /renderUI|setInterval|poll|mentor|dashboard|LEARNING\.md/i;

/** Tecnologías concretas que el parser antiguo fabricaba: no deben reaparecer. */
const OLD_FABRICATED_TECHS = [
  "TypeScript",
  "Node.js",
  "OpenCode",
  "OpenCode API",
  "ESM",
  "HTML5",
  "CSS3",
];

/** LEARNING.md mínimo: no declara stack, ni snippet, ni pistas. */
const MINIMAL_MD = [
  "# Objetivo",
  "- **Proyecto**: Demo",
  "",
  "## Tarea Activa",
  "### Implementar saludo",
  "",
  '- **Tu Trabajo**: Escribe una función que devuelva "hola".',
  "",
  "## Estado",
  "- En progreso",
  "",
].join("\n");

/** LEARNING.md completo: stack, snippet y 3 pistas propios del alumno. */
const FULL_MD = [
  "# Objetivo",
  "- **Proyecto**: Demo",
  "- **Stack**: Kotlin, PostgreSQL",
  "",
  "## Tarea Activa",
  "### Implementar saludo",
  "",
  "- **Tu Trabajo**: Escribe una función.",
  "",
  "```kotlin",
  'fun hola(): String = "hola"',
  "```",
  "",
  "### Criterios de Aceptación",
  '- [ ] Devuelve "hola"',
  "",
  "### Pistas",
  "- Revisa la firma de la función.",
  "- Mira los tests existentes.",
  "- Considera los casos límite.",
  "",
].join("\n");

const FULL_HINTS = [
  "Revisa la firma de la función.",
  "Mira los tests existentes.",
  "Considera los casos límite.",
];

/** Reúne TODO el texto que un default puede exponer al alumno. */
function collectTexts(state) {
  const texts = [];
  for (const tech of state.techStack ?? []) texts.push(tech);
  const task = state.activeTask;
  if (task) {
    if (task.referenceSnippet) texts.push(task.referenceSnippet);
    for (const note of task.referenceNotes ?? []) texts.push(note);
    for (const hint of task.hints ?? []) {
      texts.push(hint.label);
      texts.push(hint.content);
    }
  }
  return texts;
}

/* --- Carpetas temporales, limpiadas en el `after` -------------------------- */
const tempDirs = [];
function makeTempDir(prefix, withLearningMd) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  if (withLearningMd !== undefined) {
    writeFileSync(join(dir, "LEARNING.md"), withLearningMd);
  }
  return dir;
}

after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("parser · parseo puro (sin defaults)", () => {
  it("no inventa snippet, pistas ni stack para un LEARNING.md mínimo", () => {
    const state = parseLearningMarkdown(MINIMAL_MD, "LEARNING.md");

    assert.ok(state.activeTask, "hay tarea activa");
    assert.ok(
      !state.activeTask.referenceSnippet,
      "el parseo puro NO inventa snippet"
    );
    assert.equal(
      (state.activeTask.hints ?? []).length,
      0,
      "el parseo puro NO inventa pistas"
    );
    assert.equal(
      (state.techStack ?? []).length,
      0,
      "el parseo puro NO inventa stack"
    );
    assert.equal(
      state.activeTask.referenceNotes,
      undefined,
      "sin snippet real no hay notas de referencia"
    );
  });

  it("conserva lo propio del archivo sin envolverlo", () => {
    const state = parseLearningMarkdown(FULL_MD, "LEARNING.md");

    assert.deepEqual(state.techStack, ["Kotlin", "PostgreSQL"]);
    assert.equal(state.activeTask.referenceSnippet, 'fun hola(): String = "hola"');
    assert.equal(state.activeTask.hints.length, 3);
  });
});

describe("defaults · aplicación sobre un LEARNING.md mínimo", () => {
  const state = applyPedagogicalDefaults(
    parseLearningMarkdown(MINIMAL_MD, "LEARNING.md")
  );

  it("aplica stack honesto (agnóstico, sin tecnologías concretas)", () => {
    assert.deepEqual(state.techStack, [UNDECLARED_STACK_LABEL]);
    for (const tech of state.techStack) {
      assert.ok(
        !OLD_FABRICATED_TECHS.includes(tech),
        `no debe fabricar tecnología concreta: ${tech}`
      );
    }
  });

  it("aplica snippet y notas genéricas etiquetadas", () => {
    assert.ok(state.activeTask.referenceSnippet);
    assert.match(state.activeTask.referenceSnippet, /gen[eé]rico/i);
    assert.ok(
      state.activeTask.referenceNotes && state.activeTask.referenceNotes.length > 0,
      "hay notas honestas que acompañan al snippet genérico"
    );
  });

  it("aplica 3 pistas genéricas coherentes (niveles 1..3)", () => {
    const hints = state.activeTask.hints;
    assert.equal(hints.length, 3);
    assert.deepEqual(
      hints.map((h) => h.level),
      [1, 2, 3]
    );
    for (const hint of hints) {
      assert.match(hint.label, /gen[eé]rico/i, `pista etiquetada: ${hint.label}`);
    }
  });

  it("ningún texto por defecto contiene las cadenas prohibidas", () => {
    for (const text of collectTexts(state)) {
      assert.ok(
        !FORBIDDEN.test(text),
        `texto prohibido en default: ${JSON.stringify(text)}`
      );
    }
  });

  it("mantiene la estructura de la tarea y el estado coherentes", () => {
    assert.equal(state.exists, true);
    assert.equal(state.activeTask.status, "active");
    assert.ok(state.activeTask.title, "hay título de tarea");
    assert.equal(state.activeTask.hints.length, 3);
    assert.match(state.activeTask.referenceSnippet, /gen[eé]rico/i);
  });
});

describe("defaults · un LEARNING.md completo pasa intacto", () => {
  const state = applyPedagogicalDefaults(
    parseLearningMarkdown(FULL_MD, "LEARNING.md")
  );

  it("respeta el stack declarado", () => {
    assert.deepEqual(state.techStack, ["Kotlin", "PostgreSQL"]);
  });

  it("respeta el snippet del archivo (literal, sin envolver)", () => {
    assert.equal(state.activeTask.referenceSnippet, 'fun hola(): String = "hola"');
    assert.doesNotMatch(state.activeTask.referenceSnippet, /gen[eé]rico/i);
  });

  it("respeta las 3 pistas del archivo (literal, sin marcarlas como genéricas)", () => {
    const hints = state.activeTask.hints;
    assert.equal(hints.length, 3);
    assert.deepEqual(
      hints.map((h) => h.content),
      FULL_HINTS
    );
    assert.deepEqual(
      hints.map((h) => h.label),
      ["Pista 1", "Pista 2", "Pista 3"]
    );
    for (const hint of hints) {
      assert.doesNotMatch(hint.content, /gen[eé]rico/i);
    }
  });
});

describe("parseLearningFile · contrato público con defaults aplicados", () => {
  it("un LEARNING.md mínimo en disco recibe los defaults", () => {
    const dir = makeTempDir("parser-defaults-min-", MINIMAL_MD);
    const state = parseLearningFile(dir);

    assert.equal(state.exists, true);
    assert.deepEqual(state.techStack, [UNDECLARED_STACK_LABEL]);
    assert.ok(state.activeTask);
    assert.match(state.activeTask.referenceSnippet, /gen[eé]rico/i);
    assert.equal(state.activeTask.hints.length, 3);
    assert.equal(state.activeTask.status, "active");
    for (const text of collectTexts(state)) {
      assert.ok(!FORBIDDEN.test(text), `texto prohibido: ${JSON.stringify(text)}`);
    }
  });

  it("un LEARNING.md completo en disco conserva su contenido", () => {
    const dir = makeTempDir("parser-defaults-full-", FULL_MD);
    const state = parseLearningFile(dir);

    assert.deepEqual(state.techStack, ["Kotlin", "PostgreSQL"]);
    assert.equal(state.activeTask.referenceSnippet, 'fun hola(): String = "hola"');
    assert.deepEqual(
      state.activeTask.hints.map((h) => h.content),
      FULL_HINTS
    );
  });

  it("sin LEARNING.md conserva el contrato de 'no existe'", () => {
    const dir = makeTempDir("parser-defaults-none-");
    const state = parseLearningFile(dir);

    assert.equal(state.exists, false);
    assert.equal(state.activeTask, null);
    assert.deepEqual(state.competencies, []);
    assert.deepEqual(state.concepts, []);
  });
});

// `GENERIC_CONTENT_NOTICE` se exporta y se usa en el snippet; se referencia aquí
// para dejar explícita la etiqueta honesta esperada.
it("la etiqueta honesta genérica es la esperada", () => {
  assert.match(GENERIC_CONTENT_NOTICE, /no proviene de tu archivo/i);
});
