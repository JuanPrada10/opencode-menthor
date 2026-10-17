/* =============================================================================
   test/project-store.test.js
   -----------------------------------------------------------------------------
   Especificación ejecutable de `src/client/js/projectStore.js`, el dueño único
   de la clave `menthor_project_dir` y de su normalización.

   Se prueba el contrato con un storage falso (sin navegador): el módulo acepta
   el almacén por inyección, así que estos tests no tocan `localStorage` real.
   ============================================================================= */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createProjectStore,
  normalize,
  fromFilePath,
  STORAGE_KEY,
} from "../src/client/js/projectStore.js";

/** Storage falso con la interface `{ getItem, setItem, removeItem }`. */
function fakeStorage(initial) {
  const map = Object.assign(Object.create(null), initial || {});
  return {
    map,
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
    },
    setItem(key, value) {
      map[key] = String(value);
    },
    removeItem(key) {
      delete map[key];
    },
  };
}

describe("projectStore.js · normalize()", () => {
  it("recorta espacios sobrantes", () => {
    assert.equal(normalize("   C:\\Users\\juan\\proyecto   "), "C:\\Users\\juan\\proyecto");
  });

  it("quita comillas dobles envolventes", () => {
    assert.equal(normalize('"C:\\Users\\juan\\proyecto"'), "C:\\Users\\juan\\proyecto");
  });

  it("quita comillas simples envolventes", () => {
    assert.equal(normalize("'C:\\Users\\juan\\proyecto'"), "C:\\Users\\juan\\proyecto");
  });

  it("quita barra final (\\ o /)", () => {
    assert.equal(normalize("C:\\Users\\juan\\proyecto\\"), "C:\\Users\\juan\\proyecto");
    assert.equal(normalize("C:/Users/juan/proyecto/"), "C:/Users/juan/proyecto");
  });

  it("quita el sufijo LEARNING.md con separador", () => {
    assert.equal(normalize("C:\\Users\\juan\\proyecto\\LEARNING.md"), "C:\\Users\\juan\\proyecto");
    assert.equal(normalize("C:/Users/juan/proyecto/LEARNING.md"), "C:/Users/juan/proyecto");
  });

  it("quita el sufijo LEARNING.md sin separador y sin distinguir mayúsculas", () => {
    assert.equal(normalize("C:\\Users\\juan\\proyectoLEARNING.md"), "C:\\Users\\juan\\proyecto");
    assert.equal(normalize("C:\\Users\\juan\\learning.MD"), "C:\\Users\\juan");
  });

  it("combina comillas, barra final y sufijo en una sola pasada", () => {
    assert.equal(normalize('"C:\\Users\\juan\\proyecto\\LEARNING.md"'), "C:\\Users\\juan\\proyecto");
  });

  it("devuelve cadena vacía para entradas vacías o nulas", () => {
    assert.equal(normalize(""), "");
    assert.equal(normalize("   "), "");
    assert.equal(normalize(null), "");
    assert.equal(normalize(undefined), "");
    assert.equal(normalize("LEARNING.md"), "");
  });

  it("no degrada una raíz de unidad", () => {
    assert.equal(normalize("C:\\"), "C:\\");
  });
});

describe("projectStore.js · fromFilePath()", () => {
  it("deriva el directorio desde un filePath de LEARNING.md", () => {
    assert.equal(fromFilePath("C:\\proyectos\\demo\\LEARNING.md"), "C:\\proyectos\\demo");
  });

  it("aplica la misma normalización (comillas y barra final)", () => {
    assert.equal(fromFilePath('"C:/proyectos/demo/LEARNING.md"'), "C:/proyectos/demo");
  });
});

describe("projectStore.js · createProjectStore()", () => {
  it("hace round-trip write/read normalizando en la escritura", () => {
    const storage = fakeStorage();
    const store = createProjectStore(storage);

    const written = store.write('  "C:\\Users\\juan\\proyecto\\"  ');
    assert.equal(written, "C:\\Users\\juan\\proyecto");
    assert.equal(storage.map[STORAGE_KEY], "C:\\Users\\juan\\proyecto");
    assert.equal(store.read(), "C:\\Users\\juan\\proyecto");
  });

  it("read() devuelve null cuando falta la clave", () => {
    const store = createProjectStore(fakeStorage());
    assert.equal(store.read(), null);
  });

  it("read() devuelve null ante un valor corrupto (solo espacios o comillas)", () => {
    assert.equal(createProjectStore(fakeStorage({ [STORAGE_KEY]: "   " })).read(), null);
    assert.equal(createProjectStore(fakeStorage({ [STORAGE_KEY]: '""' })).read(), null);
  });

  it("read() normaliza el valor guardado", () => {
    const store = createProjectStore(fakeStorage({ [STORAGE_KEY]: "C:\\p\\q\\LEARNING.md" }));
    assert.equal(store.read(), "C:\\p\\q");
  });

  it("clear() elimina la clave guardada", () => {
    const storage = fakeStorage();
    const store = createProjectStore(storage);
    store.write("C:\\algo");
    store.clear();
    assert.equal(store.read(), null);
    assert.equal(STORAGE_KEY in storage.map, false);
  });

  it("solo toca la clave menthor_project_dir", () => {
    const storage = fakeStorage({ otra_clave: "intacta" });
    const store = createProjectStore(storage);

    store.write("C:\\proyecto");
    store.clear();

    assert.deepEqual(Object.keys(storage.map), ["otra_clave"]);
    assert.equal(storage.map.otra_clave, "intacta");
    assert.equal(STORAGE_KEY, "menthor_project_dir");
  });
});
