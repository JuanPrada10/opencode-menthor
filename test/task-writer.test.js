/* =============================================================================
   test/task-writer.test.js
   -----------------------------------------------------------------------------
   Especificación ejecutable del bloque gestionado de tarea en LEARNING.md.

   Importa desde `dist/`, por lo que `npx tsc` debe ejecutarse antes.
   ============================================================================= */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  TASK_BLOCK_START,
  TASK_BLOCK_END,
  renderTaskBlock,
  splitTaskBlock,
  parseTaskBlock,
  upsertTaskBlock,
} from "../dist/task-writer.js";

/* --- Fixtures -------------------------------------------------------------- */

function fullPayload() {
  return {
    evaluationCriteria: ["La función devuelve hola", "Maneja el caso vacío"],
    checkedCriteria: ["El proyecto compila"],
    hints: [
      { level: 1, label: "Concepto", type: "concept", content: "Piensa entrada y salida." },
      { level: 2, label: "Estrategia", type: "algorithm", content: "Divide el problema." },
      { level: 3, label: "Plantilla", type: "snippet", content: "Empieza por la firma." },
    ],
    referenceSnippet: 'function hola(): string {\n  return "hola";\n}',
    referenceLanguage: "ts",
    referenceNotes: ["Mantén la función pequeña.", "Escribe un test primero."],
  };
}

/* ============================================================================= */

describe("renderTaskBlock", () => {
  it("pinta marcadores y las 4 subsecciones con payload completo", () => {
    const out = renderTaskBlock(fullPayload());

    assert.ok(out.startsWith(TASK_BLOCK_START), "empieza con el marcador de inicio");
    assert.ok(out.endsWith(TASK_BLOCK_END), "termina con el marcador de fin");
    assert.match(out, /### Criterios de aceptación/);
    assert.match(out, /### Pistas escalonadas/);
    assert.match(out, /### Referencia y sintaxis/);
    assert.match(out, /### Anatomía y buenas prácticas/);

    assert.match(out, /- \[ \] La función devuelve hola/);
    assert.match(out, /- \[x\] El proyecto compila/);
    assert.match(out, /- \*\*Nivel 1 — Concepto\*\*: Piensa entrada y salida\./);
    assert.match(out, /```ts/);
    assert.match(out, /- Mantén la función pequeña\./);
  });

  it("omite subsecciones vacías", () => {
    const out = renderTaskBlock({ referenceSnippet: "x" });
    assert.match(out, /### Referencia y sintaxis/);
    assert.doesNotMatch(out, /### Criterios de aceptación/);
    assert.doesNotMatch(out, /### Pistas escalonadas/);
    assert.doesNotMatch(out, /### Anatomía y buenas prácticas/);
  });

  it("devuelve cadena vacía con payload vacío o sin nada que pintar", () => {
    assert.equal(renderTaskBlock({}), "");
    assert.equal(
      renderTaskBlock({
        evaluationCriteria: [],
        checkedCriteria: [],
        hints: [],
        referenceNotes: [],
      }),
      ""
    );
  });

  it("usa una cerca de cuatro backticks si el snippet contiene tres", () => {
    const out = renderTaskBlock({
      referenceSnippet: "```\nnested\n```",
    });
    assert.match(out, /````ts/);
    assert.match(out, /````/);
  });

  it("colapsa saltos de línea internos de pistas y notas a una sola línea", () => {
    const out = renderTaskBlock({
      hints: [{ level: 1, type: "concept", content: "linea uno\nlinea dos" }],
      referenceNotes: ["nota a\nnota b"],
    });
    assert.match(out, /- \*\*Nivel 1 — Concepto\*\*: linea uno linea dos/);
    assert.match(out, /- nota a nota b/);
  });
});

/* ============================================================================= */

describe("splitTaskBlock", () => {
  it("devuelve null sin marcadores", () => {
    assert.equal(splitTaskBlock("solo texto, sin bloque\n"), null);
    assert.equal(splitTaskBlock(`${TASK_BLOCK_START}\nsin fin\n`), null);
  });

  it("devuelve before/block/after correctos con marcadores", () => {
    const before = "# Título\ncontenido\n";
    const block = `${TASK_BLOCK_START}\n### Criterios de aceptación\n- [ ] x\n${TASK_BLOCK_END}`;
    const after = "\ncola\n";
    const content = before + block + after;

    const split = splitTaskBlock(content);
    assert.ok(split, "hay split");
    assert.equal(split.before, before);
    assert.equal(split.block, block);
    assert.equal(split.after, after);
  });
});

/* ============================================================================= */

describe("upsertTaskBlock · reemplazo", () => {
  it("reemplaza el bloque y preserva intacto el texto de antes y de después", () => {
    const before = "# Título\n\n## Tarea Activa\ncontexto previo\n";
    const oldBlock = `${TASK_BLOCK_START}\n### Criterios de aceptación\n- [ ] viejo\n${TASK_BLOCK_END}`;
    const after = "\n\n## Notas finales\n- fin\n";
    const content = before + oldBlock + after;

    const { content: out, changed } = upsertTaskBlock(content, fullPayload());
    assert.equal(changed, true);
    assert.ok(out.startsWith(before), "el prefijo queda intacto");
    assert.ok(out.endsWith(after), "el sufijo queda intacto");

    const split = splitTaskBlock(out);
    assert.ok(split);
    assert.equal(split.before, before);
    assert.equal(split.after, after);
    assert.match(split.block, /La función devuelve hola/);
    assert.doesNotMatch(out, /- \[ \] viejo/);
  });
});

/* ============================================================================= */

describe("upsertTaskBlock · inserción", () => {
  it("inserta dentro de una sección '## 5. Tarea en Curso' antes del siguiente ##", () => {
    const content =
      "# Objetivo\n\n## 5. Tarea en Curso\n### Hacer algo\n- paso uno\n\n## Estado\n- en progreso\n\n## Notas\n- n\n";

    const { content: out, changed } = upsertTaskBlock(content, fullPayload());
    assert.equal(changed, true);

    const idxBlock = out.indexOf(TASK_BLOCK_START);
    const idxEstado = out.indexOf("## Estado");
    const idxNotas = out.indexOf("## Notas");
    const idxTarea = out.indexOf("## 5. Tarea en Curso");

    assert.ok(idxBlock > -1, "el bloque está");
    assert.ok(idxTarea > -1 && idxTarea < idxBlock, "se inserta tras el heading activo");
    assert.ok(idxBlock < idxEstado, "el bloque queda antes de ## Estado");
    assert.ok(idxBlock < idxNotas, "el bloque queda antes de ## Notas");
    assert.match(out, /## Estado\n- en progreso/);
    assert.match(out, /## Notas\n- n/);
  });

  it("inserta al final del archivo si la sección activa es la última", () => {
    const content = "# Objetivo\n\n## Tarea Activa\n### Hacer\n- paso\n";
    const { content: out } = upsertTaskBlock(content, { referenceSnippet: "x" });
    assert.match(out, /## Tarea Activa\n### Hacer\n- paso\n/);
    assert.ok(out.includes(TASK_BLOCK_START));
    assert.ok(out.endsWith(`${TASK_BLOCK_END}\n`));
  });

  it("crea '## Tarea Activa: X' cuando no existe la sección", () => {
    const content = "# Objetivo\n- algo\n";
    const { content: out, changed } = upsertTaskBlock(content, {
      ...fullPayload(),
      title: "Implementar saludo",
    });
    assert.equal(changed, true);
    assert.match(out, /## Tarea Activa: Implementar saludo/);
    assert.ok(out.includes(TASK_BLOCK_START));
    assert.ok(out.indexOf("## Tarea Activa: Implementar saludo") < out.indexOf(TASK_BLOCK_START));
  });

  it("conserva el estilo de fin de línea (CRLF)", () => {
    const content = "# Objetivo\r\n- algo\r\n\r\n## Tarea Activa\r\n- paso\r\n";
    const { content: out } = upsertTaskBlock(content, { referenceSnippet: "x" });
    assert.ok(out.includes("\r\n"), "mantiene CRLF");
    assert.ok(
      out.includes(`${TASK_BLOCK_START}\r\n`),
      "los saltos insertados usan CRLF"
    );
  });
});

/* ============================================================================= */

describe("upsertTaskBlock · idempotencia y robustez", () => {
  it("el segundo upsert es no-op (changed false y contenido igual)", () => {
    const content = "# Objetivo\n- algo\n";
    const payload = { ...fullPayload(), title: "Implementar saludo" };

    const first = upsertTaskBlock(content, payload);
    assert.equal(first.changed, true);

    const second = upsertTaskBlock(first.content, payload);
    assert.equal(second.changed, false);
    assert.equal(second.content, first.content);
  });

  it("no lanza y deja intacto con payload vacío", () => {
    const content = "# Objetivo\n- algo\n";
    const { content: out, changed } = upsertTaskBlock(content, {});
    assert.equal(changed, false);
    assert.equal(out, content);
  });
});

/* ============================================================================= */

describe("parseTaskBlock", () => {
  it("round-trip: recupera criterios, pistas, snippet, lenguaje y notas", () => {
    const payload = fullPayload();
    const parsed = parseTaskBlock(renderTaskBlock(payload));

    assert.deepEqual(parsed.evaluationCriteria, [
      "La función devuelve hola",
      "Maneja el caso vacío",
      "El proyecto compila",
    ]);
    assert.equal(parsed.hints.length, 3);
    assert.deepEqual(
      parsed.hints.map((h) => ({ level: h.level, label: h.label, type: h.type })),
      [
        { level: 1, label: "Concepto", type: "concept" },
        { level: 2, label: "Estrategia", type: "algorithm" },
        { level: 3, label: "Plantilla", type: "snippet" },
      ]
    );
    assert.deepEqual(
      parsed.hints.map((h) => h.content),
      ["Piensa entrada y salida.", "Divide el problema.", "Empieza por la firma."]
    );
    assert.equal(parsed.referenceSnippet, 'function hola(): string {\n  return "hola";\n}');
    assert.equal(parsed.referenceLanguage, "ts");
    assert.deepEqual(parsed.referenceNotes, [
      "Mantén la función pequeña.",
      "Escribe un test primero.",
    ]);
  });

  it("tolera otro orden y títulos con acentos/mayúsculas raras", () => {
    const block = [
      TASK_BLOCK_START,
      "### PISTAS ESCALONADAS",
      "- **Nivel 1 – Concepto**: primera",
      "- Segunda pista sin formato",
      "### ANATOMÍA Y BUENAS PRÁCTICAS",
      "- nota con acento",
      "### CRITERIOS DE ACEPTACIÓN",
      "- [ ] criterio libre",
      "### REFERENCIA Y SINTAXIS",
      "```js",
      "const a = 1;",
      "```",
      TASK_BLOCK_END,
    ].join("\n");

    const parsed = parseTaskBlock(block);
    assert.deepEqual(parsed.evaluationCriteria, ["criterio libre"]);
    assert.equal(parsed.hints.length, 2);
    assert.equal(parsed.hints[0].level, 1);
    assert.equal(parsed.hints[0].label, "Concepto");
    assert.equal(parsed.hints[0].type, "concept");
    assert.equal(parsed.hints[0].content, "primera");
    // La pista sin patrón `**…**:` usa el índice y "Pista" por defecto.
    assert.equal(parsed.hints[1].level, 2);
    assert.equal(parsed.hints[1].content, "Segunda pista sin formato");
    assert.equal(parsed.referenceSnippet, "const a = 1;");
    assert.equal(parsed.referenceLanguage, "js");
    assert.deepEqual(parsed.referenceNotes, ["nota con acento"]);
  });

  it("nunca lanza y devuelve arrays vacíos ante basura", () => {
    assert.deepEqual(parseTaskBlock(""), {
      evaluationCriteria: [],
      hints: [],
      referenceNotes: [],
    });
    assert.doesNotThrow(() => parseTaskBlock("~~~\nbasura\n~~~"));
    const junk = parseTaskBlock("### algo raro\nhola\n");
    assert.deepEqual(junk.evaluationCriteria, []);
    assert.deepEqual(junk.hints, []);
    assert.deepEqual(junk.referenceNotes, []);
  });
});
