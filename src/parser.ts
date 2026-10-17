import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyPedagogicalDefaults } from "./defaults.js";
import { splitTaskBlock, parseTaskBlock } from "./task-writer.js";
import type { LearningState, LearningCompetency, LearningConcept, LearningTask, LearningHint } from "./types.js";

/**
 * Limpia prefijos comunes de markdown como "**Objetivo**:", "**Tu Trabajo**:", etc.
 * sin dañar el formateo interno del resto del texto.
 *
 * Incluye los prefijos de pista escalonada (`**Pista N (tipo)**:`,
 * `**Nivel N — Etiqueta**:`) para que no sobrevivan los `**` crudos.
 *
 * IMPORTANTE: `src/client/js/markdown.js` replica esta lógica; si cambia aquí,
 * cambia allí también (paridad).
 */
export function cleanMarkdownPrefix(str: string): string {
  if (!str) return "";
  let clean = str.trim();
  // Quita viñetas residuales si quedaron
  clean = clean.replace(/^[-*]\s+/, "");
  // Remueve prefijos redundantes tipo: **Objetivo**: , **Contexto**: , etc.
  clean = clean.replace(/^\*{1,2}(?:objetivo|objective|contexto|context|instrucciones|instructions|tu trabajo|your task|requisitos|requirements|criterios|criteria|pistas|hints|meta)\*{1,2}[:\-–]\s*/i, "");
  // Remueve prefijos de pista/nivel: **Pista 1 (concepto)**: , **Nivel 2 — Estrategia**: , ...
  clean = clean.replace(/^\*{1,2}\s*(?:pista|nivel)\b[^*]*?\*{1,2}\s*[:\-–—]\s*/i, "");
  // Si la línea entera empieza y termina con asteriscos que cubren todo el texto innecesariamente
  // sólo lo normalizamos si no hay marcadores internos
  return clean.trim();
}

/** Minúsculas sin acentos para comparar etiquetas. */
function foldLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Deduce el `type` de pista a partir del texto de su etiqueta. */
function hintTypeFromLabel(label: string): LearningHint["type"] | undefined {
  const f = foldLabel(label);
  if (f.includes("concepto")) return "concept";
  if (f.includes("estrategia")) return "algorithm";
  if (f.includes("plantilla")) return "snippet";
  return undefined;
}

/**
 * Lee un prefijo de pista (`**Pista N (tipo)**:` / `**Nivel N — Etiqueta**:`) y
 * deriva nivel/etiqueta/tipo. Devuelve `null` si no hay prefijo reconocible.
 */
function parseHintPrefix(
  raw: string
): { level?: number; label: string; type?: LearningHint["type"] } | null {
  const bold = raw.match(/^\*\*(.+?)\*\*\s*(.*)$/);
  if (!bold) return null;
  const inside = bold[1].trim();
  if (!/^(pista|nivel)\b/i.test(inside)) return null;
  const levelMatch = inside.match(/\d+/);
  const level = levelMatch ? Number(levelMatch[0]) : undefined;
  const label = inside
    .replace(/^(pista|nivel)\s*\d*/i, "")
    .replace(/^[\s—–:\-()]+/, "")
    .replace(/[\s—–:\-()]+$/, "")
    .trim();
  const type = hintTypeFromLabel(label);
  return { level, label: label || "Pista", ...(type ? { type } : {}) };
}

/** `true` para una etiqueta en negrita sin valor (p. ej. `**Restricciones**:`). */
function isLabelWithoutValue(text: string): boolean {
  return /^\*\*[^*]+\*\*\s*:?\s*$/.test(text);
}

/**
 * Searches for LEARNING.md in the target directory (or current working directory by default)
 * and parses its structured content.
 *
 * Contrato público: devuelve el estado CON la política de defaults aplicada.
 * El parseo en sí vive en `parseLearningMarkdown` (puro); la fabricación de
 * contenido por defecto vive en `applyPedagogicalDefaults`.
 */
export function parseLearningFile(targetDir: string = process.cwd()): LearningState {
  const filePath = resolve(targetDir, "LEARNING.md");

  if (!existsSync(filePath)) {
    return {
      exists: false,
      competencies: [],
      concepts: [],
      activeTask: null,
    };
  }

  try {
    const rawContent = readFileSync(filePath, "utf-8");
    return applyPedagogicalDefaults(parseLearningMarkdown(rawContent, filePath));
  } catch (error) {
    return {
      exists: true,
      filePath,
      competencies: [],
      concepts: [],
      activeTask: null,
      rawContent: "",
    };
  }
}

/**
 * Parses markdown text into structured LearningState
 */
export function parseLearningMarkdown(content: string, filePath?: string): LearningState {
  const state: LearningState = {
    exists: true,
    filePath,
    competencies: [],
    concepts: [],
    techStack: [],
    activeTask: null,
    rawContent: content,
  };

  // Bloque gestionado (autoritativo): lo separamos ANTES del bucle heurístico
  // para que sus marcadores y subsecciones no contaminen `description` ni
  // dupliquen criterios. `rawContent` sigue siendo el contenido completo.
  const blockSplit = splitTaskBlock(content);
  const parsedBlock = blockSplit ? parseTaskBlock(blockSplit.block) : null;
  const heuristicContent = blockSplit
    ? blockSplit.before + blockSplit.after
    : content;

  const lines = heuristicContent.split(/\r?\n/);
  let currentSection = "";
  let activeTaskLines: string[] = [];
  let inActiveTask = false;
  // Sub-modo dentro de la sección "objective": cuando estamos leyendo la
  // lista anidada de "Objetivos de aprendizaje".
  let objectiveSubMode: "goals" | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track top-level or second-level headings
    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      const headingText = headingMatch[1].trim().toLowerCase();

      if (headingText.includes("objetivo") || headingText.includes("objective")) {
        currentSection = "objective";
        inActiveTask = false;
      } else if (headingText.includes("stack") || headingText.includes("tecnolog")) {
        currentSection = "tech_stack";
        inActiveTask = false;
      } else if (headingText.includes("estado") || headingText.includes("status")) {
        currentSection = "status";
        inActiveTask = false;
      } else if (headingText.includes("competencia") || headingText.includes("competencies")) {
        currentSection = "competencies";
        inActiveTask = false;
      } else if (headingText.includes("concepto") || headingText.includes("concepts")) {
        currentSection = "concepts";
        inActiveTask = false;
      } else if (
        headingText.includes("tarea activa") ||
        headingText.includes("active task") ||
        headingText.includes("tarea actual") ||
        headingText.includes("current task") ||
        headingText.includes("tarea en curso") ||
        headingText.includes("tarea pendiente")
      ) {
        currentSection = "active_task";
        inActiveTask = true;
        activeTaskLines = [];
        // Check if heading has a title after colon, e.g. "## Tarea Activa: Fase 1"
        const colonMatch = headingMatch[1].match(/(?:tarea activa|active task|tarea actual|current task|tarea en curso|tarea pendiente)[:\-–]\s*(.+)$/i);
        if (colonMatch) {
          activeTaskLines.push(colonMatch[1].trim());
        }
      } else if (inActiveTask && /^#{3,}\s+(.+)$/.test(line)) {
        // Sub-heading inside active task. Conservamos la línea CRUDA: el bucle
        // de la tarea decide si es el título o una línea de sección (y si es
        // una subsección de anatomía alimenta `referenceNotes`).
        activeTaskLines.push(line);
      } else {
        if (inActiveTask && /^##\s+/.test(line)) {
          inActiveTask = false;
        }
        currentSection = "other";
      }
      continue;
    }

    if (!trimmed) {
      if (inActiveTask) {
        activeTaskLines.push(line);
      }
      continue;
    }

    // Parse sections
    if (currentSection === "objective") {
      const bulletText = trimmed.replace(/^[-*]\s*/, "");
      const cleanVal = cleanMarkdownPrefix(bulletText);
      // Compatibilidad: el texto agregado de `objective` no cambia de formato.
      if (!state.objective) {
        state.objective = cleanVal;
      } else {
        state.objective += " " + cleanVal;
      }
      // Extracción estructurada ADITIVA: nombre del proyecto, objetivos de
      // aprendizaje y stack. No altera `objective` ni el resto de campos.
      const indent = (line.match(/^[ \t]*/) || [""])[0].replace(/\t/g, "    ").length;
      const labelMatch = bulletText.match(/^\*\*([^*]+)\*\*\s*[:\-–]?\s*(.*)$/);
      if (labelMatch) {
        const label = labelMatch[1].trim().toLowerCase();
        const value = labelMatch[2].trim();
        if (/^(proyecto|project|nombre)\b/.test(label)) {
          objectiveSubMode = null;
          if (value) state.projectName = value;
        } else if (/^objetivos?\b|aprendizaje|learning\s*goals?|^metas?\b/.test(label)) {
          objectiveSubMode = "goals";
          if (value) {
            if (!state.learningGoals) state.learningGoals = [];
            state.learningGoals.push(value);
          }
        } else if (/^(stack|tecnolog|tech)\b/.test(label)) {
          objectiveSubMode = null;
          if (!state.techStack) state.techStack = [];
          for (const piece of value.split(/,\s*/)) {
            const cleanPiece = piece.trim().replace(/^\*\*|\*\*$/g, "").trim();
            if (cleanPiece) state.techStack.push(cleanPiece);
          }
        } else {
          objectiveSubMode = null;
        }
      } else if (objectiveSubMode === "goals" && indent >= 2 && cleanVal) {
        // Sub-viñeta anidada dentro de "Objetivos de aprendizaje".
        if (!state.learningGoals) state.learningGoals = [];
        state.learningGoals.push(cleanVal);
      } else {
        objectiveSubMode = null;
      }
    } else if (currentSection === "tech_stack") {
      const stackItem = trimmed.replace(/^[-*]\s*/, "").replace(/^[*`_~]+|[*`_~]+$/g, "");
      if (stackItem) {
        if (!state.techStack) state.techStack = [];
        // Handle comma-separated list or bullets
        const items = stackItem.split(/,\s*/);
        for (const item of items) {
          const cleanItem = item.trim().replace(/^\*\*|\*\*$/g, "").trim();
          if (cleanItem) state.techStack.push(cleanItem);
        }
      }
    } else if (currentSection === "status") {
      const cleanVal = cleanMarkdownPrefix(trimmed.replace(/^[-*]\s*/, ""));
      if (!state.status) {
        state.status = cleanVal;
      } else {
        state.status += " " + cleanVal;
      }
    } else if (currentSection === "competencies") {
      // Look for list items like "- [x] React Hooks" or "- TypeScript (Intermedio)"
      const compMatch = trimmed.match(/^[-*]\s*(?:\[([ xX])\])?\s*(.+)$/);
      if (compMatch) {
        const checked = compMatch[1] ? compMatch[1].toLowerCase() === "x" : undefined;
        const text = cleanMarkdownPrefix(compMatch[2].trim());
        const competency: LearningCompetency = {
          name: text,
          status: checked === true ? "mastered" : checked === false ? "pending" : "in_progress",
        };
        state.competencies.push(competency);
      }
    } else if (currentSection === "concepts") {
      // Checkbox or bullet item
      const conceptMatch = trimmed.match(/^[-*]\s*(?:\[([ xX])\])?\s*(.+)$/);
      if (conceptMatch) {
        const mastered = conceptMatch[1] ? conceptMatch[1].toLowerCase() === "x" : false;
        const name = cleanMarkdownPrefix(conceptMatch[2].trim());
        state.concepts.push({
          name,
          mastered,
        });
      }
    } else if (currentSection === "active_task" && inActiveTask) {
      activeTaskLines.push(line);
    }
  }

  // El parseo es puro: no fabricamos techStack aquí. La política de
  // defaults vive en `applyPedagogicalDefaults` (src/defaults.ts).

  // Parse active task details if captured
  if (activeTaskLines.length > 0) {
    const rawActiveTask = activeTaskLines.join("\n").trim();
    let taskTitle = "Tarea Actual";
    let description = "";
    // Líneas de descripción con su sangría original para reconstruir
    // listas numeradas y párrafos sin aplanarlos en un texto corrido.
    const descriptionLines: { indent: number; text: string }[] = [];
    const reqs: string[] = [];
    const evaluationCriteria: string[] = [];
    const hints: LearningHint[] = [];
    let referenceSnippet = "";
    const referenceNotes: string[] = [];

    // Extract code blocks if any
    const codeBlockMatch = rawActiveTask.match(/```(?:[a-z0-9_-]*\n)?([\s\S]*?)```/);
    if (codeBlockMatch) {
      referenceSnippet = codeBlockMatch[1].trim();
    }

    // Process line by line
    let submode: "general" | "criteria" | "hints" | "anatomy" = "general";
    let inFence = false;
    for (const l of activeTaskLines) {
      const tr = l.trim();
      if (!tr) continue;

      // (e) Ignora comentarios HTML (marcadores de bloque, etc.).
      if (/^\s*<!--/.test(l)) continue;

      // (d) Seguimiento de cercas: nada dentro del fence entra en description,
      // requirements, evaluationCriteria ni hints (el snippet se extrae aparte).
      if (/^(`{3,}|~{3,})/.test(tr)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;

      // Viñeta/residuo sin contenido (p. ej. "-"): se descarta.
      if (/^[-*+]+$/.test(tr)) continue;

      // --- Headings ----------------------------------------------------------
      if (/^#{1,6}\s+/.test(tr)) {
        const headingText = tr.replace(/^#{1,6}\s+/, "").trim();
        // (b) Cualquier heading reinicia el submodo de colección.
        if (/^criterios?/i.test(headingText)) {
          submode = "criteria";
          continue;
        }
        if (/^pistas?/i.test(headingText)) {
          submode = "hints";
          continue;
        }
        if (/^referencia/i.test(headingText)) {
          submode = "general";
          continue;
        }
        if (/^anatom|^buenas\s+pr|^notas/i.test(headingText)) {
          submode = "anatomy";
          continue;
        }
        // (a) Sólo es título si el placeholder sigue en pie. Si no, la línea se
        // conserva como línea de la sección.
        submode = "general";
        if (taskTitle === "Tarea Actual") {
          taskTitle = headingText.replace(/^[:\-–]\s*/, "");
        } else {
          const leading = (l.match(/^[ \t]*/) || [""])[0].replace(/\t/g, "    ");
          descriptionLines.push({ indent: leading.length, text: headingText });
        }
        continue;
      }

      // --- Etiquetas en negrita (sección o pista) ----------------------------
      const boldMatch = tr.match(/^(?:[-*+]\s+)?\*\*([^*]+)\*\*\s*[:\-–—]?\s*(.*)$/);
      const boldLabel = boldMatch ? boldMatch[1].trim() : "";
      const isHintLabel = !!boldLabel && /^(pista|nivel)\b/i.test(boldLabel);

      if (boldLabel) {
        if (/^criterios?/i.test(boldLabel)) {
          submode = "criteria";
          continue;
        }
        if (/^pistas?/i.test(boldLabel)) {
          submode = "hints";
          continue;
        }
        if (/^referencia/i.test(boldLabel)) {
          submode = "general";
          continue;
        }
        if (/^anatom|^buenas\s+pr|^notas/i.test(boldLabel)) {
          submode = "anatomy";
          const inlineNote = boldMatch ? cleanMarkdownPrefix(boldMatch[2].trim()) : "";
          if (inlineNote) referenceNotes.push(inlineNote);
          continue;
        }
        // (b) Etiqueta distinta de Pista/Nivel: termina criteria/hints/anatomía.
        if (!isHintLabel) submode = "general";
      }

      // --- Viñetas -----------------------------------------------------------
      const bulletMatch = tr.match(/^[-*+]\s*(?:\[([ xX])\])?\s*(.+)$/);

      // (c) Subsección de anatomía: sus viñetas alimentan `referenceNotes`.
      if (submode === "anatomy") {
        const source = bulletMatch ? bulletMatch[2].trim() : tr;
        const noteText = cleanMarkdownPrefix(source);
        if (noteText) referenceNotes.push(noteText);
        continue;
      }

      if (bulletMatch) {
        const rawItem = bulletMatch[2].trim();
        const itemText = cleanMarkdownPrefix(rawItem);
        // If it was a checkbox `- [ ] ...`, prioritize as evaluation criteria
        const hasCheckbox = bulletMatch[1] !== undefined;
        if (submode === "criteria" || hasCheckbox) {
          if (itemText) evaluationCriteria.push(itemText);
        } else if (submode === "hints") {
          // (g) Deriva nivel/etiqueta/tipo del prefijo si existe; si no, numera.
          const parsedHint = parseHintPrefix(rawItem);
          if (itemText) {
            const hint: LearningHint = {
              level: parsedHint?.level ?? hints.length + 1,
              label: parsedHint?.label ?? `Pista ${hints.length + 1}`,
              content: itemText,
            };
            if (parsedHint?.type) hint.type = parsedHint.type;
            hints.push(hint);
          }
        } else {
          // (f) Higiene de requirements: descarta vacíos y etiquetas sin valor.
          const labelWithValue = rawItem.match(/^\*\*([^*]+)\*\*\s*[:\-–—]?\s*(.*)$/);
          const value = labelWithValue
            ? cleanMarkdownPrefix(labelWithValue[2].trim())
            : itemText;
          if (value && !isLabelWithoutValue(value)) reqs.push(value);
        }
      } else {
        const cleanedTr = cleanMarkdownPrefix(tr);
        if (taskTitle === "Tarea Actual") {
          taskTitle = cleanedTr.replace(/^[:\-–]\s*/, "");
        } else if (cleanedTr) {
          // Preservamos la estructura multilínea (listas numeradas, bullets
          // residuales y párrafos) en lugar de concatenar todo con espacios.
          const leading = (l.match(/^[ \t]*/) || [""])[0].replace(/\t/g, "    ");
          descriptionLines.push({ indent: leading.length, text: cleanedTr });
        }
      }
    }

    // Reconstruye la descripción preservando los saltos de línea y
    // normalizando la sangría relativa (para sublistas anidadas).
    if (descriptionLines.length > 0) {
      const minIndent = Math.min(...descriptionLines.map((d) => d.indent));
      description = descriptionLines
        .map((d) => {
          const level = Math.max(0, Math.round((d.indent - minIndent) / 2));
          return "  ".repeat(level) + d.text;
        })
        .join("\n");
    }

    // El parseo es puro: no fabricamos snippet ni pistas aquí. Si el archivo
    // no los trae, quedan vacíos y `applyPedagogicalDefaults` decide después.

    state.activeTask = {
      title: taskTitle,
      description: description || rawActiveTask,
      status: "active",
      requirements: reqs.length > 0 ? reqs : undefined,
      evaluationCriteria: evaluationCriteria.length > 0 ? evaluationCriteria : undefined,
      referenceSnippet,
      referenceNotes: referenceNotes.length > 0 ? referenceNotes : undefined,
      hints,
    };
  }

  // El bloque gestionado MANDA cuando aporta datos; lo que no aporte se resuelve
  // con el camino heurístico de siempre (retrocompatible con archivos sin bloque).
  if (parsedBlock) {
    const hasBlockData =
      parsedBlock.evaluationCriteria.length > 0 ||
      parsedBlock.hints.length > 0 ||
      (typeof parsedBlock.referenceSnippet === "string" &&
        parsedBlock.referenceSnippet.trim() !== "") ||
      parsedBlock.referenceNotes.length > 0;

    if (hasBlockData) {
      if (!state.activeTask) {
        state.activeTask = { title: "Tarea Actual", status: "active" };
      }
      const task = state.activeTask;

      if (parsedBlock.evaluationCriteria.length > 0) {
        task.evaluationCriteria = parsedBlock.evaluationCriteria;
      }
      if (parsedBlock.hints.length > 0) {
        task.hints = parsedBlock.hints;
      }
      if (
        typeof parsedBlock.referenceSnippet === "string" &&
        parsedBlock.referenceSnippet.trim() !== ""
      ) {
        task.referenceSnippet = parsedBlock.referenceSnippet;
        if (parsedBlock.referenceLanguage) {
          task.referenceLanguage = parsedBlock.referenceLanguage;
        }
      }
      if (parsedBlock.referenceNotes.length > 0) {
        task.referenceNotes = parsedBlock.referenceNotes;
      }
    }
  }

  return state;
}
