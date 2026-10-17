/* =============================================================================
   test/server-http.test.js
   -----------------------------------------------------------------------------
   Especificación ejecutable del seam `HttpServerDeps` de `src/server/http.ts`.

   El transporte HTTP sólo conoce UNA operación inyectada (`resolveState`). No
   importa `parser.ts` ni `project.ts`, de modo que estas pruebas de routing
   arrancan el servidor real en un puerto efímero (0) con una implementación
   falsa de `resolveState` y NO tocan el filesystem.

   Nota: `http.ts` es TypeScript, por lo que se consume su salida compilada en
   `dist/` (ejecutar `npm run build` antes que `npm test`).
   ============================================================================= */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createHttpServer } from "../dist/server/http.js";

/** Estado falso de aprendizaje (mismo shape que `LearningState`). */
function fakeState(overrides = {}) {
  return {
    exists: true,
    filePath: "/proyecto-demo/LEARNING.md",
    objective: "Aprender el seam de dependencias",
    competencies: [],
    concepts: [],
    activeTask: null,
    ...overrides,
  };
}

/**
 * Arranca el servidor en un puerto efímero con un `resolveState` falso.
 * Registra en `calls` cada directorio recibido y cierra el servidor al final
 * del test para no dejar handles abiertos.
 */
async function withServer(t, resolveState) {
  const server = createHttpServer({ resolveState });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

describe("server/http.js · seam HttpServerDeps (routing sin filesystem)", () => {
  it("1. GET / devuelve 200 HTML con el bloque de estado inicial embebido", async (t) => {
    const state = fakeState();
    const calls = [];
    const base = await withServer(t, (dir) => {
      calls.push(dir);
      return state;
    });

    const res = await fetch(`${base}/`);

    assert.equal(res.status, 200, "status 200");
    assert.match(
      res.headers.get("content-type") || "",
      /text\/html/,
      "content-type HTML",
    );
    assert.equal(
      res.headers.get("cache-control"),
      "no-cache, no-store, must-revalidate",
      "cabecera de caché del HTML",
    );

    const html = await res.text();
    assert.ok(
      html.includes('<script id="initial-state"'),
      "el HTML embebe el <script id=initial-state>",
    );
    assert.ok(
      html.includes(JSON.stringify(state)),
      "el estado serializado aparece en el bloque inicial",
    );
    assert.deepEqual(calls, [null], "/ sin ?dir= reenvía null a resolveState");
  });

  it("2. GET /api/state devuelve 200 JSON equivalente al estado falso", async (t) => {
    const state = fakeState({ status: "Fase 2" });
    const base = await withServer(t, () => state);

    const res = await fetch(`${base}/api/state`);

    assert.equal(res.status, 200, "status 200");
    assert.match(
      res.headers.get("content-type") || "",
      /application\/json/,
      "content-type JSON",
    );
    assert.equal(
      res.headers.get("cache-control"),
      "no-cache, no-store, must-revalidate",
      "cabecera de caché del JSON",
    );

    const body = await res.json();
    assert.deepEqual(body, state, "el JSON coincide con el estado falso");
  });

  it("3. GET /api/state?dir=X reenvía X a resolveState y devuelve su estado", async (t) => {
    const calls = [];
    const base = await withServer(t, (dir) => {
      calls.push(dir);
      return fakeState({ filePath: `${dir}/LEARNING.md` });
    });

    const res = await fetch(`${base}/api/state?dir=${encodeURIComponent("C:/ruta/X")}`);

    assert.equal(res.status, 200, "status 200");
    assert.deepEqual(calls, ["C:/ruta/X"], "resolveState recibe el dir resuelto");
    const body = await res.json();
    assert.equal(body.filePath, "C:/ruta/X/LEARNING.md", "estado del dir solicitado");
  });

  it("4. ruta desconocida devuelve 404", async (t) => {
    const base = await withServer(t, () => fakeState());

    const res = await fetch(`${base}/ruta/inexistente`);

    assert.equal(res.status, 404, "status 404");
    assert.equal(await res.text(), "Not Found", "cuerpo Not Found");
  });

  it("5. OPTIONS devuelve 204", async (t) => {
    const base = await withServer(t, () => fakeState());

    const res = await fetch(`${base}/api/state`, { method: "OPTIONS" });

    assert.equal(res.status, 204, "status 204");
  });
});
