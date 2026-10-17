/* =============================================================================
   src/task-writer.ts
   -----------------------------------------------------------------------------
   Bloque gestionado de tarea dentro de `LEARNING.md`.

   El agente pintaba las pistas / snippet en el chat pero nunca llegaban al
   archivo, así que el dashboard sólo mostraba relleno genérico. Solución: un
   bloque delimitado por marcadores que el plugin puede escribir y el parser
   puede leer.

   Contrato (congelado):
     - `renderTaskBlock`  dibuja el bloque (marcadores incluidos). "" si vacío.
     - `splitTaskBlock`   separa en [antes, bloque, después].
     - `parseTaskBlock`   lee el bloque (tolerante a acentos/mayúsculas).
     - `upsertTaskBlock`  reemplaza o inserta el bloque, idempotente.

   Nunca lanzamos: ante entradas raras devolvemos algo conservador.
   ============================================================================= */

export const TASK_BLOCK_START = "<!-- menthor:task:start v1 -->";
export const TASK_BLOCK_END = "<!-- menthor:task:end -->";

export interface TaskBlockHint {
  level?: number;
  label?: string;
  content: string;
  type?: "concept" | "algorithm" | "snippet";
}

export interface TaskBlockPayload {
  evaluationCriteria?: string[]; // se pintan como "- [ ] …"
  checkedCriteria?: string[]; // se pintan como "- [x] …"
  hints?: TaskBlockHint[];
  referenceSnippet?: string;
  referenceLanguage?: string;
  referenceNotes?: string[];
  /** Sólo para el alta de sección (punto 3). NO se pinta dentro del bloque. */
  title?: string;
}

export interface ParsedTaskBlock {
  /** En orden de documento (marcados y no marcados). */
  evaluationCriteria: string[];
  hints: Array<{
    level: number;
    label: string;
    content: string;
    type?: "concept" | "algorithm" | "snippet";
  }>;
  referenceSnippet?: string;
  referenceLanguage?: string;
  referenceNotes: string[];
}

/* --- Utilidades de texto --------------------------------------------------- */

/** Minúsculas + sin acentos, para comparar títulos de forma tolerante. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Colapsa saltos de línea internos (y espacios redundantes) a una sola línea. */
function collapse(value: string): string {
  return value.replace(/\r?\n+/g, " ").replace(/\s+/g, " ").trim();
}

const DEFAULT_LABEL_BY_TYPE: Record<
  NonNullable<TaskBlockHint["type"]>,
  string
> = {
  concept: "Concepto",
  algorithm: "Estrategia",
  snippet: "Plantilla",
};

/** Deriva el `type` a partir de un texto de etiqueta. */
function deriveType(text: string): TaskBlockHint["type"] | undefined {
  const f = fold(text);
  if (f.includes("concepto")) return "concept";
  if (f.includes("estrategia")) return "algorithm";
  if (f.includes("plantilla")) return "snippet";
  return undefined;
}

function labelForType(type: TaskBlockHint["type"]): string | undefined {
  if (!type) return undefined;
  return DEFAULT_LABEL_BY_TYPE[type];
}

/** Etiqueta de una pista sin `label`: según `type` o "Pista". */
function defaultHintLabel(hint: TaskBlockHint): string {
  return hint.label || labelForType(hint.type) || "Pista";
}

/* --- Render ---------------------------------------------------------------- */

/** Cerca de código suficientemente larga para no chocar con el snippet. */
function fenceFor(snippet: string): string {
  let longest = 0;
  for (const run of snippet.matchAll(/`+/g)) {
    longest = Math.max(longest, run[0].length);
  }
  return "`".repeat(Math.max(3, longest + 1));
}

function renderCriteria(payload: TaskBlockPayload): string {
  const lines: string[] = [];
  for (const item of payload.evaluationCriteria ?? []) {
    const text = collapse(String(item));
    if (text) lines.push(`- [ ] ${text}`);
  }
  for (const item of payload.checkedCriteria ?? []) {
    const text = collapse(String(item));
    if (text) lines.push(`- [x] ${text}`);
  }
  if (lines.length === 0) return "";
  return ["### Criterios de aceptación", ...lines].join("\n");
}

function renderHints(payload: TaskBlockPayload): string {
  const lines: string[] = [];
  (payload.hints ?? []).forEach((hint, index) => {
    if (!hint) return;
    const content = collapse(String(hint.content ?? ""));
    if (!content) return;
    const level = hint.level ?? index + 1;
    const label = defaultHintLabel(hint);
    lines.push(`- **Nivel ${level} — ${label}**: ${content}`);
  });
  if (lines.length === 0) return "";
  return ["### Pistas escalonadas", ...lines].join("\n");
}

function renderReference(payload: TaskBlockPayload): string {
  const snippet = payload.referenceSnippet;
  if (typeof snippet !== "string" || snippet.trim().length === 0) return "";
  const rawLang = payload.referenceLanguage;
  const language =
    typeof rawLang === "string" && rawLang.trim() ? rawLang.trim() : "ts";
  const fence = fenceFor(snippet);
  return [
    "### Referencia y sintaxis",
    `${fence}${language}`,
    snippet.replace(/\r\n/g, "\n"),
    fence,
  ].join("\n");
}

function renderNotes(payload: TaskBlockPayload): string {
  const lines: string[] = [];
  for (const note of payload.referenceNotes ?? []) {
    const text = collapse(String(note));
    if (text) lines.push(`- ${text}`);
  }
  if (lines.length === 0) return "";
  return ["### Anatomía y buenas prácticas", ...lines].join("\n");
}

/** Dibuja el bloque completo (marcadores incluidos). "" si no hay nada. */
export function renderTaskBlock(payload: TaskBlockPayload): string {
  if (!payload) return "";
  const sections = [
    renderCriteria(payload),
    renderHints(payload),
    renderReference(payload),
    renderNotes(payload),
  ].filter((section) => section.length > 0);

  if (sections.length === 0) return "";

  return [
    TASK_BLOCK_START,
    sections.join("\n\n"),
    TASK_BLOCK_END,
  ].join("\n");
}

/* --- Split ----------------------------------------------------------------- */

/** Separa el contenido en [antes, bloque, después]. `null` si no hay marcadores. */
export function splitTaskBlock(
  content: string
): { before: string; block: string; after: string } | null {
  if (typeof content !== "string") return null;
  const start = content.indexOf(TASK_BLOCK_START);
  if (start === -1) return null;
  const end = content.indexOf(TASK_BLOCK_END, start + TASK_BLOCK_START.length);
  if (end === -1) return null;
  const blockEnd = end + TASK_BLOCK_END.length;
  return {
    before: content.slice(0, start),
    block: content.slice(start, blockEnd),
    after: content.slice(blockEnd),
  };
}

/* --- Parse ----------------------------------------------------------------- */

type SectionKind = "criteria" | "hints" | "reference" | "notes";

function classifyHeading(text: string): SectionKind | null {
  const f = fold(text);
  if (f.includes("criterios")) return "criteria";
  if (f.includes("pistas")) return "hints";
  if (f.includes("referencia")) return "reference";
  if (
    f.includes("anatom") ||
    f.includes("buenas practicas") ||
    f.includes("notas")
  ) {
    return "notes";
  }
  return null;
}

const HEADING_RE = /^(#{1,6})\s+(.*?)\s*$/;

interface RawHint {
  level?: number;
  label?: string;
  content: string;
  type?: TaskBlockHint["type"];
}

/**
 * Lee un bloque (tolerante a mayúsculas/acentos en los títulos de subsección).
 * Nunca lanza.
 */
export function parseTaskBlock(blockText: string): ParsedTaskBlock {
  const result: ParsedTaskBlock = {
    evaluationCriteria: [],
    hints: [],
    referenceNotes: [],
  };
  if (typeof blockText !== "string" || blockText.length === 0) return result;

  const lines = blockText.split(/\r?\n/);
  let section: SectionKind | null = null;
  const rawHints: RawHint[] = [];
  let snippet: string | undefined;
  let language: string | undefined;
  let inFence = false;
  let fenceChar = "";
  let fenceLen = 0;
  const snippetLines: string[] = [];

  for (const line of lines) {
    // Fence abierto: capturamos el snippet literalmente (sin mirar headings).
    if (inFence) {
      const closeRe = new RegExp(`^\\s*\\${fenceChar}{${fenceLen},}\\s*$`);
      if (closeRe.test(line)) {
        inFence = false;
        if (snippet === undefined) snippet = snippetLines.join("\n");
        continue;
      }
      snippetLines.push(line);
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      section = classifyHeading(heading[2]);
      continue;
    }

    if (section === null) continue;

    switch (section) {
      case "criteria": {
        const checked = /^\s*[-*+]\s*\[([ xX])\]\s*(.*)$/.exec(line);
        if (checked) {
          const text = collapse(checked[2]);
          if (text) result.evaluationCriteria.push(text);
          break;
        }
        const plain = /^\s*[-*+]\s+(.*)$/.exec(line);
        if (plain) {
          const text = collapse(plain[1]);
          if (text) result.evaluationCriteria.push(text);
        }
        break;
      }
      case "hints": {
        const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
        if (!bullet) break;
        const rest = bullet[1].trim();
        if (!rest) break;
        const bold = /^\*\*(.+?)\*\*\s*[-–—:]?\s*(.*)$/.exec(rest);
        if (bold) {
          const inside = bold[1].trim();
          const content = collapse(bold[2]);
          const levelMatch = /nivel\s*(\d+)/i.exec(inside);
          const level = levelMatch ? Number(levelMatch[1]) : undefined;
          const labelText = inside
            .replace(/nivel\s*\d+/i, "")
            .replace(/^[\s—–:-]+/, "")
            .replace(/[\s—–:-]+$/, "")
            .trim();
          const label = labelText || "Pista";
          rawHints.push({
            level,
            label,
            content,
            type: deriveType(label),
          });
          break;
        }
        // Sin patrón `**…**:` → el texto completo es el contenido.
        const type = deriveType(rest);
        rawHints.push({
          content: collapse(rest),
          label: labelForType(type) || "Pista",
          type,
        });
        break;
      }
      case "reference": {
        const open = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
        if (open) {
          inFence = true;
          fenceChar = open[1][0];
          fenceLen = open[1].length;
          if (language === undefined) {
            const info = open[2].trim();
            language = info ? info : undefined;
          }
          snippetLines.length = 0;
        }
        break;
      }
      case "notes": {
        const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
        if (bullet) {
          const text = collapse(bullet[1]);
          if (text) result.referenceNotes.push(text);
        }
        break;
      }
    }
  }

  // Cierra un fence que quedó abierto al final del bloque.
  if (inFence && snippet === undefined) {
    snippet = snippetLines.join("\n");
  }

  rawHints.forEach((hint, index) => {
    result.hints.push({
      level: hint.level ?? index + 1,
      label: hint.label ?? "Pista",
      content: hint.content,
      ...(hint.type ? { type: hint.type } : {}),
    });
  });

  if (snippet !== undefined) result.referenceSnippet = snippet;
  if (language !== undefined) result.referenceLanguage = language;

  return result;
}

/* --- Upsert ---------------------------------------------------------------- */

const ACTIVE_TASK_RE = /\btarea\s+(activa|actual|en curso|pendiente)\b/;
const LINE_HEADING_RE = /^(#{1,6})\s+(.*?)\s*$/;

function endsWithNewline(value: string): boolean {
  return value.endsWith("\n");
}

function appendAtEnd(content: string, payload: TaskBlockPayload, block: string, eol: string): string {
  const title = payload.title ? collapse(payload.title) : "";
  const trimmedEmpty = content.trim() === "";
  let addition = "";
  if (!trimmedEmpty) {
    addition += endsWithNewline(content) ? eol : eol + eol;
  }
  if (title) addition += `## Tarea Activa: ${title}${eol}`;
  addition += block + eol;
  return content + addition;
}

/** Reemplaza o inserta el bloque. Devuelve el contenido nuevo y si cambió. */
export function upsertTaskBlock(
  content: string,
  payload: TaskBlockPayload
): { content: string; changed: boolean } {
  if (typeof content !== "string") {
    return { content: "", changed: false };
  }

  const rendered = renderTaskBlock(payload);
  if (rendered === "") {
    // Nada que escribir: dejamos el archivo intacto.
    return { content, changed: false };
  }

  // Respeta los finales de línea del archivo (punto 7).
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const block = eol === "\n" ? rendered : rendered.split("\n").join(eol);

  // 1) Ya hay marcadores → sustituye SOLO lo que hay entre ellos.
  const split = splitTaskBlock(content);
  if (split) {
    const next = split.before + block + split.after;
    return { content: next, changed: next !== content };
  }

  // Localiza líneas y sus offsets para insertar con precisión.
  const lines = content.split("\n");
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }

  let activeIndex = -1;
  let activeLevel = 0;
  for (let i = 0; i < lines.length; i++) {
    const clean = lines[i].endsWith("\r") ? lines[i].slice(0, -1) : lines[i];
    const heading = LINE_HEADING_RE.exec(clean);
    if (!heading) continue;
    if (ACTIVE_TASK_RE.test(fold(heading[2]))) {
      activeIndex = i;
      activeLevel = heading[1].length;
      break;
    }
  }

  // 3) No existe la sección → alta al final del archivo.
  if (activeIndex === -1) {
    const next = appendAtEnd(content, payload, block, eol);
    return { content: next, changed: next !== content };
  }

  // 2) Inserta al final de la sección activa.
  let nextHeadingIndex = -1;
  for (let i = activeIndex + 1; i < lines.length; i++) {
    const clean = lines[i].endsWith("\r") ? lines[i].slice(0, -1) : lines[i];
    const heading = LINE_HEADING_RE.exec(clean);
    if (!heading) continue;
    if (heading[1].length <= activeLevel) {
      nextHeadingIndex = i;
      break;
    }
  }

  let next: string;
  if (nextHeadingIndex >= 0) {
    const at = starts[nextHeadingIndex];
    next = content.slice(0, at) + block + eol + eol + content.slice(at);
  } else {
    // Al final del archivo.
    next =
      content +
      (endsWithNewline(content) ? "" : eol) +
      block +
      eol;
  }
  return { content: next, changed: next !== content };
}
