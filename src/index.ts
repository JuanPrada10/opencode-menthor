import { Plugin } from "@opencode/plugin";
import { Schema } from "effect";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerMenthorAgent } from "./agent.js";
import { startServer, openBrowser, type ServerInstance } from "./server/index.js";
import { upsertTaskBlock, type TaskBlockHint, type TaskBlockPayload } from "./task-writer.js";
import { resolveActiveProjectDir, type SessionLike } from "./workspace.js";

/**
 * Minimal structural typing for the host `client` used to list sessions. The
 * published `Context` type does not expose `client`, so we describe only the
 * slice this plugin consumes instead of falling back to `any`.
 */
interface SessionClient {
  session?: {
    list?: () => Promise<SessionLike[]>;
  };
}

type PluginContext = Parameters<Parameters<typeof Plugin.define>[0]["setup"]>[0] & {
  directory?: string;
  client?: SessionClient;
};
type ToolEditor = Parameters<Parameters<PluginContext["tool"]["transform"]>[0]>[0];

/** Absolute path of the plugin's own directory (excluded as a target). */
const pluginDirectory = fileURLToPath(new URL(".", import.meta.url));

let serverInstance: ServerInstance | null = null;

/** Name of the pedagogical log read by the dashboard. */
const LEARNING_FILE_NAME = "LEARNING.md";

const HINT_TYPES = ["concept", "algorithm", "snippet"] as const;
type HintType = (typeof HINT_TYPES)[number];

/** Shape of the `hints` entries accepted by `present_task` (validated leniently). */
interface PresentTaskHintInput {
  readonly level?: number;
  readonly label?: string;
  readonly content: string;
  readonly type?: string;
}

/** Input accepted by `present_task` after schema validation. */
interface PresentTaskExecuteInput {
  readonly title: string;
  readonly description?: string;
  readonly requirements?: readonly string[];
  readonly checkedCriteria?: readonly string[];
  readonly evaluationCriteria?: readonly string[];
  readonly hints?: readonly PresentTaskHintInput[];
  readonly referenceSnippet?: string;
  readonly referenceLanguage?: string;
  readonly referenceNotes?: readonly string[];
  readonly dir?: string;
}

/** Trims, drops blanks and returns `undefined` instead of an empty array. */
function cleanStringList(value?: readonly string[]): string[] | undefined {
  const cleaned = (value ?? [])
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
  return cleaned.length ? cleaned : undefined;
}

function normalizeHintType(value?: string): HintType | undefined {
  return value && (HINT_TYPES as readonly string[]).includes(value) ? (value as HintType) : undefined;
}

function normalizeHints(hints?: readonly PresentTaskHintInput[]): TaskBlockHint[] | undefined {
  if (!hints?.length) return undefined;
  const cleaned = hints
    .filter((hint) => typeof hint?.content === "string" && hint.content.trim().length > 0)
    .map((hint) => ({
      level: typeof hint.level === "number" ? hint.level : undefined,
      label: hint.label?.trim() || undefined,
      content: hint.content.trim(),
      type: normalizeHintType(hint.type),
    }));
  return cleaned.length ? cleaned : undefined;
}

/**
 * Writes (or replaces) the managed task block inside the project's
 * `LEARNING.md` so the pistas, reference snippet and anatomy tabs show the real
 * material instead of the honest placeholders. Never touches anything outside
 * the block (or the active-task section when the block must be inserted) and
 * keeps a `LEARNING.md.bak` copy of the previous content.
 */
function persistTaskBlock(
  projectDir: string,
  input: PresentTaskExecuteInput,
): { ok: boolean; path: string; backupPath?: string; reason?: string } {
  const filePath = join(projectDir, LEARNING_FILE_NAME);
  try {
    const existing = existsSync(filePath) ? readFileSync(filePath, "utf8") : null;
    const payload: TaskBlockPayload = {
      title: input.title,
      evaluationCriteria: cleanStringList(input.evaluationCriteria),
      checkedCriteria: cleanStringList(input.checkedCriteria),
      hints: normalizeHints(input.hints),
      referenceSnippet: input.referenceSnippet?.trim() || undefined,
      referenceLanguage: input.referenceLanguage?.trim() || undefined,
      referenceNotes: cleanStringList(input.referenceNotes),
    };

    const result = upsertTaskBlock(existing ?? "# Seguimiento de Aprendizaje\n", payload);
    if (!result.changed) {
      return { ok: true, path: filePath };
    }

    let backupPath: string | undefined;
    if (existing !== null) {
      backupPath = `${filePath}.bak`;
      writeFileSync(backupPath, existing, "utf8");
    }

    const tmpPath = `${filePath}.tmp`;
    writeFileSync(tmpPath, result.content, "utf8");
    renameSync(tmpPath, filePath);
    return { ok: true, path: filePath, backupPath };
  } catch (err) {
    return { ok: false, path: filePath, reason: err instanceof Error ? err.message : String(err) };
  }
}

export default Plugin.define({
  id: "mentor-plugin",
  async setup(ctx: PluginContext) {
    /** Injects the real dependencies into the pure workspace resolver. */
    const resolveProjectDir = (): Promise<string> =>
      resolveActiveProjectDir({
        ctxDirectory: ctx.directory,
        exists: (path) => existsSync(path),
        cwd: () => process.cwd(),
        listSessions: () => ctx.client?.session?.list?.() ?? Promise.resolve([]),
        pluginDirectory,
      });

    /**
     * Single orchestration helper shared by every tool: resolves the target
     * directory (an explicit `dir` wins), makes sure the HTTP server is running
     * and points it at that directory. Keeps the lazy (re)start behavior.
     */
    async function ensureWorkspace(explicitDir?: string | null): Promise<{ server: ServerInstance; dir: string }> {
      const dir = explicitDir && explicitDir.trim() ? explicitDir.trim() : await resolveProjectDir();
      if (!serverInstance) {
        serverInstance = await startServer(4567, dir);
        console.log(`[mentor-plugin] Servidor de Menthor iniciado en ${serverInstance.url}`);
      } else if (serverInstance.setProjectDir) {
        serverInstance.setProjectDir(dir);
      }
      return { server: serverInstance, dir };
    }

    const initialProjectDir = await resolveProjectDir();

    // Iniciar el servidor HTTP pedagógico
    try {
      serverInstance = await startServer(4567, initialProjectDir);
      console.log(`[mentor-plugin] Servidor de Menthor iniciado en ${serverInstance.url}`);
    } catch (err) {
      console.error("[mentor-plugin] Error al iniciar el servidor HTTP:", err);
    }

    // Registrar el agente Menthor si la API de agentes está disponible
    try {
      await registerMenthorAgent(ctx);
    } catch (err) {
      console.warn("[mentor-plugin] No se pudo registrar el agente Menthor:", err);
    }

    // Registrar comando rápido /menthor si ctx.command.transform está disponible
    const ctxAny = ctx as any;
    if (ctxAny?.command && typeof ctxAny.command.transform === "function") {
      try {
        await ctxAny.command.transform((editor: any) => {
          editor.add({
            name: "menthor",
            description: "Abre el dashboard de Menthor Studio o asocia el agente Menthor a la sesión.",
            execute: async (input: any) => {
              const { server, dir: projectDir } = await ensureWorkspace();
              const fullUrl = `${server.url}/?dir=${encodeURIComponent(projectDir)}`;
              openBrowser(fullUrl);

              if (input?.sessionID && ctxAny?.session?.switchAgent) {
                try {
                  await ctxAny.session.switchAgent({
                    sessionID: input.sessionID,
                    agent: "menthor",
                  });
                } catch {
                  // Fallback silencioso si switchAgent no aplica en esta sesión
                }
              }

              return `Menthor Studio abierto en ${fullUrl}`;
            },
          });
        });
      } catch (err) {
        console.warn("[mentor-plugin] No se pudo registrar el comando /menthor:", err);
      }
    }

    // Registrar herramientas en el entorno OpenCode a través del editor
    await ctx.tool.transform((editor: ToolEditor) => {
      editor.add({
        name: "mentor_open_dashboard",
        description: "Abre el dashboard pedagógico de Menthor en el navegador web del usuario.",
        input: Schema.Struct({
          dir: Schema.optional(Schema.String),
        }),
        execute: async (input: { readonly dir?: string }) => {
          const { server, dir: projectDir } = await ensureWorkspace(input?.dir);
          const fullUrl = `${server.url}/?dir=${encodeURIComponent(projectDir)}`;
          openBrowser(fullUrl);
          return {
            content: `Dashboard de Menthor abierto en ${fullUrl} para el directorio ${projectDir}`,
          };
        },
      });

      editor.add({
        name: "mentor_get_state",
        description: "Obtiene el estado pedagógico actual parseado desde LEARNING.md.",
        input: Schema.Struct({
          dir: Schema.optional(Schema.String),
        }),
        execute: async (input: { readonly dir?: string }) => {
          const { server, dir: projectDir } = await ensureWorkspace(input?.dir);
          const state = server.getState(projectDir);
          return {
            content: JSON.stringify(state, null, 2),
            output: state,
          };
        },
      });

      const PresentTaskHintSchema = Schema.Struct({
        level: Schema.optional(Schema.Number),
        label: Schema.optional(Schema.String),
        content: Schema.String,
        type: Schema.optional(Schema.String),
      });

      const PresentTaskInput = Schema.Struct({
        title: Schema.String,
        description: Schema.optional(Schema.String),
        requirements: Schema.optional(Schema.Array(Schema.String)),
        evaluationCriteria: Schema.optional(Schema.Array(Schema.String)),
        checkedCriteria: Schema.optional(Schema.Array(Schema.String)),
        hints: Schema.optional(Schema.Array(PresentTaskHintSchema)),
        referenceSnippet: Schema.optional(Schema.String),
        referenceLanguage: Schema.optional(Schema.String),
        referenceNotes: Schema.optional(Schema.Array(Schema.String)),
        dir: Schema.optional(Schema.String),
      });

      editor.add({
        name: "present_task",
        description:
          "Presenta una tarea pedagógica al alumno y la ESCRIBE en LEARNING.md dentro de un bloque gestionado " +
          "(marcadores `<!-- menthor:task:start v1 -->` / `<!-- menthor:task:end -->`), para que el dashboard muestre " +
          "el material real en vez de los ejemplos genéricos. Pasa `evaluationCriteria` (pestaña Criterios), `hints` " +
          "(pestaña Pistas, escalonadas de Nivel 1 a 3) y `referenceSnippet` + `referenceNotes` (pestaña Referencia) cada " +
          "vez que presentes una tarea. El bloque es idempotente: se reemplaza entero sin tocar el resto del archivo y se " +
          "guarda una copia en LEARNING.md.bak. OJO: el título y la descripción de una tarea que YA existe en el archivo " +
          "viven en el texto libre de su sección y se editan en el propio LEARNING.md. Después sincroniza el estado y abre Menthor Studio.",
        input: PresentTaskInput,
        execute: async (input: PresentTaskExecuteInput) => {
          const { server, dir: projectDir } = await ensureWorkspace(input?.dir);
          const fullUrl = `${server.url}/?dir=${encodeURIComponent(projectDir)}`;

          // Persistir el material de la tarea ANTES de sincronizar: el estado que
          // se emite por SSE y el que lee el dashboard salen de LEARNING.md.
          const written = persistTaskBlock(projectDir, input);

          // Abrir automáticamente el navegador si aún no estaba abierto o al presentar la tarea
          openBrowser(fullUrl);

          // Forzar sincronización SSE en tiempo real hacia los dashboards conectados
          try {
            if (server.broadcast) {
              const freshState = server.getState(projectDir);
              server.broadcast(freshState);
            }
          } catch (e) {
            console.warn("[mentor-plugin] No se pudo emitir broadcast SSE:", e);
          }

          const notes = written.ok
            ? `Bloque de tarea sincronizado en ${written.path}${written.backupPath ? ` (copia previa en ${written.backupPath})` : ""}`
            : `AVISO: no se pudo escribir el bloque de tarea en ${written.path} (${written.reason}). El dashboard sigue mostrando los ejemplos genéricos.`;

          return {
            content: `Tarea presentada: "${input.title}". ${notes}. Dashboard abierto y sincronizado en ${fullUrl} para ${projectDir}`,
            output: {
              success: true,
              title: input.title,
              dashboardUrl: fullUrl,
              learningFile: written.path,
              blockWritten: written.ok,
            },
          };
        },
      });
    });

    // Cleanup hook cuando el plugin o la sesión finaliza
    return async () => {
      if (serverInstance) {
        console.log("[mentor-plugin] Deteniendo servidor de Menthor...");
        await serverInstance.close();
        serverInstance = null;
      }
    };
  },
});

export { startServer, openBrowser };
export { parseLearningFile } from "./parser.js";
export * from "./agent.js";
export * from "./types.js";
