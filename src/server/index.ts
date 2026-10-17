import type http from "node:http";
import { parseLearningFile } from "../parser.js";
import type { LearningState } from "../types.js";
import { createHttpServer } from "./http.js";
import { findFallbackProjectDir } from "./project.js";
import { broadcast, closeAllSseClients } from "./sse.js";

export interface ServerInstance {
  server: http.Server;
  port: number;
  url: string;
  close: () => Promise<void>;
  /**
   * Single source of truth for state queries: the exact `resolveState` seam the
   * HTTP transport uses (resolves the directory, persists the active one and
   * parses LEARNING.md). Exposed so callers never re-parse on their own.
   */
  getState: (dir?: string | null) => LearningState;
  broadcast?: (state: LearningState) => void;
  setProjectDir?: (dir: string) => void;
}

export { openBrowser } from "./browser.js";
export { findFallbackProjectDir } from "./project.js";
export { createHttpServer, type HttpServerDeps } from "./http.js";
export { serveStaticFile } from "./static.js";
export { renderDashboardHtml } from "./render.js";
export {
  addSseClient,
  removeSseClient,
  broadcast,
  closeAllSseClients,
} from "./sse.js";

/**
 * Starts an HTTP server supporting REST, SSE, and HTML dashboard views.
 *
 * Falls back to a random free port when the preferred port is already in use.
 */
export async function startServer(
  preferredPort: number = 4567,
  initialProjectDir: string = process.cwd(),
): Promise<ServerInstance> {
  let activeProjectDir = initialProjectDir;

  /**
   * Composition root for the `HttpServerDeps` seam: the single adapter that
   * resolves the target directory, persists the active one and parses
   * LEARNING.md. Wires `parseLearningFile` + `findFallbackProjectDir` into the
   * transport layer without the latter knowing about either.
   */
  const resolveState = (dir?: string | null): LearningState => {
    const explicit = dir && dir.trim() ? dir.trim() : null;

    // Explicit ?dir=... always wins and becomes the active directory.
    if (explicit) {
      activeProjectDir = explicit;
      return parseLearningFile(explicit);
    }

    // Otherwise use the active directory, falling back when it has no bitácora.
    const activeState = parseLearningFile(activeProjectDir);
    if (activeState.exists) {
      return activeState;
    }

    const fallback = findFallbackProjectDir(activeProjectDir);
    if (fallback) {
      activeProjectDir = fallback;
      return parseLearningFile(fallback);
    }

    return activeState;
  };

  const setProjectDir = (dir: string) => {
    if (dir && dir !== activeProjectDir) {
      activeProjectDir = dir;
      broadcast(parseLearningFile(activeProjectDir));
    }
  };

  const server = createHttpServer({ resolveState });

  return new Promise<ServerInstance>((resolve, reject) => {
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" && preferredPort !== 0) {
        console.warn(`[mentor-plugin] Puerto ${preferredPort} en uso, intentando puerto aleatorio...`);
        server.listen(0, "127.0.0.1");
      } else {
        reject(err);
      }
    });

    server.listen(preferredPort, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : preferredPort;
      const url = `http://localhost:${port}`;
      resolve({
        server,
        port,
        url,
        broadcast,
        setProjectDir,
        getState: resolveState,
        close: () =>
          new Promise<void>((resClose) => {
            closeAllSseClients();
            server.close(() => resClose());
          }),
      });
    });
  });
}
