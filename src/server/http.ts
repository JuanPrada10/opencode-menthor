import http from "node:http";
import { fileURLToPath } from "node:url";
import type { LearningState } from "../types.js";
import { renderDashboardHtml } from "./render.js";
import { serveStaticFile } from "./static.js";
import { addSseClient, removeSseClient } from "./sse.js";

/**
 * Root of the shipped client assets, resolved relative to this module so it
 * works regardless of the process cwd (e.g. `dist/client` after build).
 */
const clientRoot = fileURLToPath(new URL("../client", import.meta.url));

/**
 * Seam (port) the HTTP server depends on. A single operation encapsulates
 * everything the transport layer needs: directory resolution, active-directory
 * persistence and LEARNING.md parsing. Nothing in this module touches the
 * filesystem or the parser directly.
 */
export interface HttpServerDeps {
  /**
   * Resolves the learning state for a target directory.
   *
   * Resolution order: the explicit `dir` (when non-empty, after trimming) ->
   * the active directory -> `findFallbackProjectDir()`. Whenever a valid
   * directory is resolved it is persisted as the active one, and the parsed
   * `LearningState` is returned (`exists: false` when there is no LEARNING.md).
   */
  resolveState: (dir?: string | null) => LearningState;
}

/**
 * Creates the HTTP server serving the Menthor dashboard: REST state, SSE stream,
 * the Eta-rendered HTML page and the static client assets.
 */
export function createHttpServer(deps: HttpServerDeps): http.Server {
  return http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    // CORS headers for local tools/dashboard
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Server-Sent Events endpoint
    if (url.pathname === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
      res.write(`data: ${JSON.stringify(deps.resolveState())}\n\n`);
      addSseClient(res);

      req.on("close", () => {
        removeSseClient(res);
      });
      return;
    }

    // JSON API State endpoint
    if (url.pathname === "/api/state") {
      const state = deps.resolveState(url.searchParams.get("dir"));
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      });
      res.end(JSON.stringify(state, null, 2));
      return;
    }

    // Main Dashboard HTML
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const state = deps.resolveState(url.searchParams.get("dir"));
      const html = renderDashboardHtml(state);
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      });
      res.end(html);
      return;
    }

    // Static client assets
    if (url.pathname.startsWith("/styles/") || url.pathname.startsWith("/js/")) {
      void serveStaticFile(res, clientRoot, url.pathname);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  });
}
