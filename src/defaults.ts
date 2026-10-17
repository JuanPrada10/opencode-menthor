import type { LearningHint, LearningState } from "./types.js";

/**
 * Política de defaults pedagógicos.
 *
 * `parseLearningMarkdown` es puro: devuelve EXACTAMENTE lo que hay en el
 * archivo. Este módulo concentra la fabricación de contenido por defecto para
 * que el parser no mezcle responsabilidades y para que lo que se inventa sea
 * explícitamente genérico, agnóstico y honesto.
 *
 * Reglas de la política:
 *  - Agnósticos al stack: si el archivo no declara tecnologías, no inventamos
 *    ninguna; se deja un marcador honesto (nunca chips de tecnologías reales).
 *  - Sin ficción sobre el alumno: ningún default afirma provenir de su archivo.
 *  - Etiquetado honesto: el snippet y las pistas por defecto se identifican
 *    como genéricos.
 *  - Contenido por defecto = ayuda metodológica neutra aplicable a cualquier
 *    proyecto, no una arquitectura de software concreta.
 */

/**
 * Marcador honesto cuando el archivo no declara tecnologías. No es una
 * tecnología concreta: sólo indica que no hay stack declarado.
 */
export const UNDECLARED_STACK_LABEL = "Stack por definir (no declarado en tu archivo de entrada)";

/** Etiqueta honesta para contenido genérico que no sale del archivo. */
export const GENERIC_CONTENT_NOTICE = "Ejemplo genérico (no proviene de tu archivo de entrada)";

/** Plantilla neutra: cómo estructurar un archivo de entrada y sus criterios. */
const GENERIC_REFERENCE_SNIPPET = `# ${GENERIC_CONTENT_NOTICE}
# Plantilla neutra: adapta los campos a tu proyecto.

[Proyecto]
nombre = "<nombre del proyecto>"

[Objetivos de aprendizaje]
1. <qué quieres aprender>
2. <qué quieres aprender>

[Tarea activa]
titulo = "<título de la tarea>"
criterios =
  1. <cómo sabrás que la tarea está bien hecha>
  2. <cómo sabrás que la tarea está bien hecha>`;

const GENERIC_REFERENCE_NOTES = [
  "Plantilla neutra: reemplaza los ejemplos por el contenido real de tu tarea.",
  "Esta referencia no se leyó de tu archivo; es una guía de estructura.",
];

function buildGenericHints(): LearningHint[] {
  return [
    {
      level: 1,
      label: "Nivel 1: Concepto (genérico)",
      type: "concept",
      content:
        "Ayuda genérica: antes de escribir código, identifica la entrada, la salida esperada y el criterio que probará que la tarea está bien hecha.",
    },
    {
      level: 2,
      label: "Nivel 2: Estrategia (genérico)",
      type: "algorithm",
      content:
        "Ayuda genérica: divide el problema en pasos pequeños y verificables. Resuelve y comprueba un paso antes de pasar al siguiente.",
    },
    {
      level: 3,
      label: "Nivel 3: Plantilla (genérico)",
      type: "snippet",
      content: `# Plantilla de criterios de aceptación (genérica):
#   1. Describe la situación de partida.
#   2. Describe el resultado esperado.
#   3. Define cómo comprobarás el resultado.`,
    },
  ];
}

/**
 * Aplica la política de defaults pedagógicos sobre un estado ya parseado.
 *
 * `parseLearningMarkdown` debe haberse ejecutado antes para que este módulo
 * sólo rellene lo que el archivo no trae. Si el archivo SÍ trae stack, snippet
 * o pistas, pasan intactos (sin envolverlos ni marcarlos como genéricos).
 *
 * Muta y devuelve el mismo `state` (el llamador trabaja sobre un parseo recién
 * creado).
 */
export function applyPedagogicalDefaults(state: LearningState): LearningState {
  // Un estado inexistente no se decora: no hay archivo que rellenar.
  if (!state.exists) {
    return state;
  }

  // 1. Stack: nunca inventamos tecnologías concretas. Si el archivo no declara
  //    stack, dejamos un marcador honesto (no vacío) para que la interfaz no
  //    fabrique chips por su cuenta.
  if (!state.techStack || state.techStack.length === 0) {
    state.techStack = [UNDECLARED_STACK_LABEL];
  }

  const task = state.activeTask;

  // 2. Tarea activa: sólo fabricamos snippet/pistas cuando el archivo no las
  //    trae; si vienen, pasan intactas.
  if (task) {
    if (!task.referenceSnippet) {
      task.referenceSnippet = GENERIC_REFERENCE_SNIPPET;
      if (!task.referenceNotes || task.referenceNotes.length === 0) {
        task.referenceNotes = [...GENERIC_REFERENCE_NOTES];
      }
    }

    if (!task.hints || task.hints.length === 0) {
      task.hints = buildGenericHints();
    }
  }

  return state;
}
