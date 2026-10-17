import fs from "node:fs";
import path from "node:path";
import type http from "node:http";

/**
 * Content-Type map for the static assets served by the dashboard server.
 */
const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".map": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

/**
 * Serves a static file from `rootDir` for the given URL pathname.
 *
 * Path resolution is hardened: the requested path is decoded and resolved
 * against `rootDir`, and any attempt to escape the root (e.g. via `..` or an
 * absolute path outside the root) results in a `403`.
 */
export async function serveStaticFile(
  res: http.ServerResponse,
  rootDir: string,
  urlPath: string,
): Promise<void> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad Request");
    return;
  }

  // Reject NUL bytes outright.
  if (decoded.includes("\0")) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad Request");
    return;
  }

  const resolvedRoot = path.resolve(rootDir);
  const targetPath = path.resolve(resolvedRoot, "." + decoded);

  const withinRoot =
    targetPath === resolvedRoot || targetPath.startsWith(resolvedRoot + path.sep);

  if (!withinRoot) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  const ext = path.extname(targetPath).toLowerCase();
  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

  let stats: fs.Stats;
  try {
    stats = await fs.promises.stat(targetPath);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
    return;
  }

  if (!stats.isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
    return;
  }

  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-cache",
    "Content-Length": stats.size,
  });

  const stream = fs.createReadStream(targetPath);
  stream.on("error", () => {
    // Headers are already sent; just terminate the response.
    res.destroy();
  });
  stream.pipe(res);
}
