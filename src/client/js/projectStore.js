/* =============================================================================
   projectStore.js — dueño único del proyecto activo del cliente.

   La clave `menthor_project_dir` de localStorage y su normalización estaban
   copiadas en api.js, ui.js y dashboard.js con reglas divergentes. Este módulo
   concentra ese contrato: la clave, la normalización y el acceso al storage.

   El storage es INYECTABLE (`{ getItem, setItem, removeItem }`) para poder
   probarlo sin navegador; por defecto usa `window.localStorage` y cae a un
   almacén en memoria si no existe.

   Interface pública:
     createProjectStore(storage?) -> { read, write, clear, normalize, fromFilePath }
     read()          -> ruta guardada ya normalizada, o null
     write(dir)      -> normaliza, guarda y devuelve la ruta normalizada
     clear()         -> elimina la clave guardada
     normalize(dir)  -> limpia la ruta (comillas, separador final, LEARNING.md)
     fromFilePath(fp)-> deriva el directorio desde un filePath de LEARNING.md
   ============================================================================= */

/* Clave única de persistencia (sin migración: se conserva tal cual). */
export var STORAGE_KEY = "menthor_project_dir";

/* ======================================================================
   NORMALIZACIÓN (regla única)
   ----------------------------------------------------------------------
   Cubre las tres variantes históricas sin romper ninguna:
     - espacios sobrantes (trim)
     - comillas simples/dobles envolventes
     - separador final (\ o /)
     - sufijo LEARNING.md, con o sin separador previo
   ====================================================================== */
export function normalize(dir) {
  if (dir === null || dir === undefined) return "";
  var s = String(dir).trim();

  /* Comillas envolventes (simples o dobles), una o varias. */
  s = s.replace(/^["']+|["']+$/g, "").trim();

  /* Separador(es) final(es). */
  s = s.replace(/[\\\/]+$/, "");

  /* Sufijo LEARNING.md, con o sin separador previo (case-insensitive). */
  s = s.replace(/[\\\/]?LEARNING\.md$/i, "");

  /* Separador que pudiera quedar tras quitar el nombre de archivo. */
  s = s.replace(/[\\\/]+$/, "");

  /* Guarda: no degradar una raíz de unidad (`C:\` -> `C:`). */
  if (/^[A-Za-z]:$/.test(s)) s += "\\";

  return s;
}

/* Deriva el directorio desde un filePath de LEARNING.md. */
export function fromFilePath(fp) {
  return normalize(fp);
}

/* ======================================================================
   STORAGE POR DEFECTO
   ====================================================================== */
function memoryStorage() {
  var map = Object.create(null);
  return {
    getItem: function (key) {
      return (key in map) ? map[key] : null;
    },
    setItem: function (key, value) {
      map[key] = String(value);
    },
    removeItem: function (key) {
      delete map[key];
    }
  };
}

function defaultStorage() {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch (err) { /* sin localStorage: se usa memoria */ }
  return memoryStorage();
}

/* ======================================================================
   FACTORY + CONVENIENCIA
   ====================================================================== */
export function createProjectStore(storage) {
  var backing = storage || defaultStorage();

  return {
    /* Ruta guardada ya normalizada, o null si falta o queda vacía. */
    read: function () {
      var raw;
      try { raw = backing.getItem(STORAGE_KEY); } catch (err) { return null; }
      if (raw === null || raw === undefined) return null;
      var norm = normalize(raw);
      return norm ? norm : null;
    },
    /* Normaliza, persiste y devuelve la ruta normalizada. */
    write: function (dir) {
      var norm = normalize(dir);
      try { backing.setItem(STORAGE_KEY, norm); } catch (err) { /* sin persistencia */ }
      return norm;
    },
    /* Elimina la clave guardada. */
    clear: function () {
      try { backing.removeItem(STORAGE_KEY); } catch (err) { /* sin persistencia */ }
    },
    normalize: normalize,
    fromFilePath: fromFilePath
  };
}

/* Instancia por defecto, perezosa: no toca el storage hasta usarse. */
var sharedStore = null;
function shared() {
  if (!sharedStore) sharedStore = createProjectStore();
  return sharedStore;
}

export function read() {
  return shared().read();
}

export function write(dir) {
  return shared().write(dir);
}

export function clear() {
  shared().clear();
}
