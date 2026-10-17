import { resolve } from "node:path";

/**
 * Minimal shape of an OpenCode session we care about: the directory it is bound
 * to, either nested under `location` or exposed directly. Structural on purpose
 * so callers can pass the raw session objects without depending on their full
 * (and unstable) type.
 */
export interface SessionLike {
  location?: { directory?: string };
  directory?: string;
}

/**
 * Dependencies of `resolveActiveProjectDir`. Everything side-effecting is
 * injected so the resolution order can be specified and tested without touching
 * the filesystem.
 */
export interface WorkspaceDeps {
  /** `ctx.directory` as provided by the plugin host, if any. */
  ctxDirectory?: string | null;
  /** Filesystem existence check (e.g. `existsSync`). */
  exists: (path: string) => boolean;
  /** Current working directory provider (e.g. `process.cwd`). */
  cwd: () => string;
  /** Lists the host's sessions; may reject (handled defensively). */
  listSessions: () => Promise<SessionLike[]>;
  /** Absolute path of the plugin's own directory, to exclude it as a target. */
  pluginDirectory?: string;
}

/** Extracts the target directory from a session, if present. */
function sessionDirectory(session: SessionLike | null | undefined): string | null {
  const loc = session?.location?.directory || session?.directory;
  return typeof loc === "string" && loc ? loc : null;
}

/** True when `loc` is the plugin's own directory (never a valid target). */
function isPluginDirectory(loc: string, pluginDirectory?: string): boolean {
  const normalized = loc.toLowerCase();
  if (pluginDirectory && normalized === pluginDirectory.toLowerCase()) {
    return true;
  }
  // Legacy guard kept from the original inline implementation.
  return normalized.includes("mentor-plugin");
}

/**
 * Resolves the current active project directory.
 *
 * Precedence (unchanged from the original inline closure):
 *   1. `ctxDirectory` when it contains a `LEARNING.md`;
 *   2. the first session (in list order) whose directory contains a `LEARNING.md`;
 *   3. the first session whose directory is not the plugin's own directory;
 *   4. `ctxDirectory` again, otherwise `cwd()`.
 *
 * A failing or non-array `listSessions()` is swallowed so resolution never
 * throws; it simply falls through to the final steps.
 */
export async function resolveActiveProjectDir(deps: WorkspaceDeps): Promise<string> {
  const { ctxDirectory, exists, cwd, listSessions, pluginDirectory } = deps;

  // 1. If ctx.directory is provided and contains a LEARNING.md, prioritize it
  if (ctxDirectory && typeof ctxDirectory === "string") {
    if (exists(resolve(ctxDirectory, "LEARNING.md"))) {
      return ctxDirectory;
    }
  }

  // 2. Query sessions from the OpenCode host client
  try {
    const result: unknown = await listSessions();
    const sessions = Array.isArray(result)
      ? result
      : (result as { data?: SessionLike[] } | null | undefined)?.data;

    if (Array.isArray(sessions)) {
      // Most recent-ish session that is a user project (has LEARNING.md)
      for (const session of sessions) {
        const loc = sessionDirectory(session);
        if (loc && exists(loc) && exists(resolve(loc, "LEARNING.md"))) {
          return loc;
        }
      }
      // Fallback to the first session that is not the plugin's own directory
      for (const session of sessions) {
        const loc = sessionDirectory(session);
        if (loc && exists(loc) && !isPluginDirectory(loc, pluginDirectory)) {
          return loc;
        }
      }
    }
  } catch (err) {
    console.warn("[mentor-plugin] No se pudieron listar sesiones:", err);
  }

  if (ctxDirectory && typeof ctxDirectory === "string") {
    return ctxDirectory;
  }

  return cwd();
}
