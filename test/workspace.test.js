/* =============================================================================
   test/workspace.test.js
   -----------------------------------------------------------------------------
   Especificación ejecutable de `src/workspace.ts`.

   `resolveActiveProjectDir` es pura con dependencias inyectadas, así que estas
   pruebas NO tocan el filesystem: usan `exists` / `cwd` / `listSessions` falsos.

   Nota: `workspace.ts` es TypeScript, por lo que se consume su salida compilada
   en `dist/` (ejecutar `npm run build` antes de `npm test`).

   Precedencia especificada:
     ctxDirectory con LEARNING.md -> primera sesión con LEARNING.md ->
     primera sesión que no sea el plugin -> ctxDirectory -> cwd()
   ============================================================================= */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve as pathResolve } from "node:path";

import { resolveActiveProjectDir } from "../dist/workspace.js";

/** `exists` falso: sólo existen los directorios listados y sus LEARNING.md. */
function fakeExists(dirsWithLearning, dirsThatExist = []) {
  const withLearning = new Set(dirsWithLearning.map((d) => pathResolve(d, "LEARNING.md")));
  const existing = new Set([...dirsWithLearning, ...dirsThatExist]);
  return (path) => withLearning.has(path) || existing.has(path);
}

describe("workspace.js · resolución de proyecto activo (deps inyectadas)", () => {
  it("1. ctx.directory con LEARNING.md gana y no consulta sesiones", async () => {
    const dir = "C:/proyectos/demo";
    let listCalls = 0;

    const result = await resolveActiveProjectDir({
      ctxDirectory: dir,
      exists: fakeExists([dir]),
      cwd: () => "C:/fallback",
      listSessions: async () => {
        listCalls += 1;
        return [{ directory: "C:/otra" }];
      },
    });

    assert.equal(result, dir, "devuelve ctx.directory");
    assert.equal(listCalls, 0, "no se listan sesiones cuando ctx.directory ya vale");
  });

  it("2. ctx.directory sin LEARNING.md pasa a las sesiones", async () => {
    const ctxDir = "C:/sin-bitacora";
    const sessionDir = "C:/proyectos/real";
    let listCalls = 0;

    const result = await resolveActiveProjectDir({
      ctxDirectory: ctxDir,
      exists: fakeExists([sessionDir], [ctxDir]),
      cwd: () => "C:/fallback",
      listSessions: async () => {
        listCalls += 1;
        return [{ location: { directory: sessionDir } }];
      },
    });

    assert.equal(listCalls, 1, "se consultan las sesiones");
    assert.equal(result, sessionDir, "gana la sesión con LEARNING.md");
  });

  it("3. elige la PRIMERA sesión (orden de lista) cuyo directorio tenga LEARNING.md", async () => {
    const first = "C:/s1";
    const second = "C:/s2";

    const result = await resolveActiveProjectDir({
      exists: fakeExists([first, second]),
      cwd: () => "C:/fallback",
      listSessions: async () => [{ directory: first }, { location: { directory: second } }],
    });

    assert.equal(result, first, "respeta el orden de la lista");
  });

  it("4. excluye el directorio del propio plugin", async () => {
    const pluginDir = "C:/plugins/mentor-plugin";
    const realDir = "C:/proyectos/real";

    const result = await resolveActiveProjectDir({
      // Ningún directorio tiene LEARNING.md: se ejerce el fallback de sesiones.
      exists: fakeExists([], [pluginDir, realDir]),
      cwd: () => "C:/fallback",
      listSessions: async () => [{ directory: pluginDir }, { directory: realDir }],
      pluginDirectory: pluginDir,
    });

    assert.equal(result, realDir, "ignora el directorio del plugin y toma el siguiente");
  });

  it("4b. excluye el pluginDirectory inyectado aunque no contenga 'mentor-plugin'", async () => {
    const pluginDir = "C:/tools/pedagogical-host";
    const realDir = "C:/proyectos/real";

    const result = await resolveActiveProjectDir({
      exists: fakeExists([], [pluginDir, realDir]),
      cwd: () => "C:/fallback",
      listSessions: async () => [{ directory: pluginDir }, { directory: realDir }],
      pluginDirectory: pluginDir,
    });

    assert.equal(result, realDir, "usa pluginDirectory como criterio de exclusión");
  });

  it("5. sin sesiones útiles cae a cwd()", async () => {
    const result = await resolveActiveProjectDir({
      exists: () => false,
      cwd: () => "C:/cwd",
      listSessions: async () => [],
    });

    assert.equal(result, "C:/cwd", "devuelve el cwd inyectado");
  });

  it("5b. ctx.directory sin LEARNING.md y sin sesiones vuelve a ctx.directory", async () => {
    const ctxDir = "C:/solo-ctx";

    const result = await resolveActiveProjectDir({
      ctxDirectory: ctxDir,
      exists: fakeExists([], [ctxDir]),
      cwd: () => "C:/cwd",
      listSessions: async () => [],
    });

    assert.equal(result, ctxDir, "última red antes de cwd()");
  });

  it("6a. listSessions que lanza no revienta y cae a cwd()", async () => {
    const result = await resolveActiveProjectDir({
      exists: () => false,
      cwd: () => "C:/cwd",
      listSessions: async () => {
        throw new Error("boom");
      },
    });

    assert.equal(result, "C:/cwd", "replica el try/catch defensivo");
  });

  it("6b. listSessions no-array no revienta y cae a cwd()", async () => {
    const result = await resolveActiveProjectDir({
      exists: () => false,
      cwd: () => "C:/cwd",
      listSessions: async () => ({ nope: true }),
    });

    assert.equal(result, "C:/cwd", "una respuesta no-array se descarta");
  });

  it("6c. listSessions con envoltorio { data } usa las sesiones", async () => {
    const sessionDir = "C:/proyectos/envuelto";

    const result = await resolveActiveProjectDir({
      exists: fakeExists([sessionDir]),
      cwd: () => "C:/cwd",
      listSessions: async () => ({ data: [{ directory: sessionDir }] }),
    });

    assert.equal(result, sessionDir, "soporta el envoltorio { data }");
  });
});
