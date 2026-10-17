# GLOSARIO — Menthor Studio

Este documento fija el vocabulario compartido del proyecto en dos planos:
**arquitectura** (cómo razonamos sobre el diseño) y **dominio** (los términos del
producto pedagógico). Es de uso interno y se mantiene junto al código.

---

## A) Vocabulario de arquitectura

Estos términos se usan de forma deliberada y precisa. No se sustituyen por
sinónimos ("componente", "servicio", "API", "firma", "frontera", "capa" ni
"wrapper").

- **Module**: cualquier cosa con una interface y una implementation (una función,
  una clase, un paquete, un slice). Es agnóstico de escala: aplica igual a un
  `Module` de una línea que a un subsistema entero.

- **Interface**: TODO lo que un caller debe saber para usar el module
  correctamente. Incluye tipos, invariantes, orden de uso, modos de error,
  configuración requerida y expectativas de rendimiento. La interface es más que
  la firma; es el contrato completo.

- **Implementation**: el cuerpo del module. Es distinto de **Adapter**: un adapter
  pequeño puede tener una implementation grande (por ejemplo, un repositorio de
  Postgres) o al revés (un fake en memoria). Usa "adapter" cuando el tema sea el
  seam, no cuando el tema sea el volumen de código.

- **Depth / deep / shallow**: leverage que vive en la interface. **Deep** = mucha
  conducta detrás de una interface pequeña. **Shallow** = la interface es casi tan
  compleja como la implementation (el caller trabaja tanto como el module).

- **Seam** (Michael Feathers): el lugar donde vive la interface de un module;
  donde se puede alterar conducta sin editar ahí mismo.

- **Adapter**: cosa concreta que satisface una interface en un seam. Describe un
  **rol**, no una sustancia; lo que importa es dónde se enchufa, no de qué está
  hecho.

- **Leverage**: lo que ganan los **callers**. Una implementation paga en N call
  sites y M tests: se escribe una vez y se reutiliza en muchos lugares.

- **Locality**: lo que ganan los **mantenedores**. Cambio, bugs, conocimiento y
  verificación se concentran en un solo lugar en vez de dispersarse.

### Principios operativos

- La profundidad es propiedad de la **interface**, no de la implementation.
- **Deletion test**: si al borrar el module la complejidad desaparece, era un
  passthrough; si reaparece repartida en N callers, valía la pena.
- **La interface es la superficie de test**: se prueba el contrato, no las
  tripas.
- **Aceptar dependencias en vez de crearlas**: el module recibe lo que necesita;
  no lo instancia por dentro.
- **Devolver resultados, no efectos secundarios**.
- **Un adapter = seam hipotético; dos adapters = seam real.**

---

## B) Vocabulario del dominio

Términos del producto Menthor Studio, con el module/archivo donde viven.

- **Proyecto activo**: el directorio de trabajo en curso, identificado por
  contener un `LEARNING.md`; define qué bitácora se lee y renderiza.
  *(vive en `src/server/project.ts` y `src/workspace.ts`)*

- **Almacén del proyecto activo (`projectStore`)**: module único del cliente que
  posee la clave `menthor_project_dir` de `localStorage` y su normalización
  (comillas envolventes, barra final y sufijo `LEARNING.md`); expone
  `read`/`write`/`clear`/`normalize`/`fromFilePath` con el storage inyectable.
  *(vive en `src/client/js/projectStore.js`)*

- **Resolución de proyecto activo**: precedencia que decide el directorio activo
  combinando `ctx.directory`, las sesiones del host y `cwd()`; es pura con
  dependencias inyectadas (`exists`, `cwd`, `listSessions`, `pluginDirectory`) y
  no toca el filesystem por sí misma. Distinta del fallback de filesystem de
  `findFallbackProjectDir`: sesión vs. búsqueda en disco. *(vive en
  `src/workspace.ts`, `resolveActiveProjectDir`)*

- **Seam de estado (`resolveState(dir?)`)**: única operación que el servidor HTTP
  recibe inyectada para resolver el directorio activo, persistirlo y parsear
  `LEARNING.md`; mantiene `src/server/http.ts` ajeno al filesystem y al parser.
  El mismo `resolveState` se expone como `ServerInstance.getState(dir?)`, la
  única vía de consulta de estado para las tools. *(interface en
  `src/server/http.ts`, `HttpServerDeps`; adaptador real y `getState` en
  `src/server/index.ts`)*

- **Dashboard (módulo de pintado)**: factory `createDashboard(root, options)`
  que encapsula DOM, pintado e interacciones en su closure; su única entrada es
  `apply(state, {force})`, que deduplica por firma (JSON del estado) y sólo
  repinta cuando algo cambió, salvo con `force`.
  *(vive en `src/client/js/dashboard.js`)*

- **Contrato de `root`**: el `root` que recibe la factory debe CONTENER el shell
  del dashboard —la barra de pestañas `.tab-btn[data-tab]` con sus paneles
  `.tab-panel#<id>` (incluido `#tab-criteria`) y los contenedores del pintado—.
  La factory resuelve TODOS sus refs desde `root` (nunca con
  `document.getElementById`) y crea los nodos con `root.ownerDocument`, por lo
  que es montable en cualquier contenedor: no depende de dónde se monte. Si
  falta un nodo requerido del shell, avisa una vez por consola y desactiva SÓLO
  la función afectada, sin romper ni mentir. El singleton de producción lo monta
  sobre `document.body` (ver `src/client/js/main.js`), que satisface el contrato.
  *(vive en `src/client/js/dashboard.js`)*

- **Sink inyectado**: patrón por el que un módulo que no pinta recibe el sink de
  pintado por parámetro en vez de importarlo; `api.js` recibe `apply` y no conoce
  el render, y `ui.js`/`main.js` cablean el `apply` del dashboard.
  *(vive en `src/client/js/api.js` y `src/client/js/ui.js`; cableado en
  `src/client/js/main.js`)*

- **LEARNING.md**: bitácora de aprendizaje del proyecto activo; fuente de verdad
  que se parsea para alimentar el dashboard. *(vive en `src/parser.ts`)*

- **Defaults honestos (`applyPedagogicalDefaults`)**: política que rellena SÓLO lo
  que el archivo no declara (stack, snippet de referencia, pistas) y que está
  separada del parseo: `parseLearningMarkdown` refleja únicamente lo que hay en
  `LEARNING.md`. El contenido por defecto es genérico, agnóstico al stack y se
  etiqueta como tal (p. ej. `"Ejemplo genérico (no proviene de tu archivo de
  entrada)"`): nunca inventa tecnologías del alumno ni menciona las tripas del
  plugin. `parseLearningFile` conserva su contrato y devuelve el estado ya con los
  defaults aplicados. El cliente tampoco fabrica stack: si no hay tecnologías
  declaradas, no pinta chips. El **bloque gestionado de tarea** tiene prioridad
  sobre los defaults: si declara pistas o snippet, no se sustituyen por genéricos.
  *(vive en `src/defaults.ts`; aplicado desde `src/parser.ts`)*

- **Bloque gestionado de tarea**: región de `LEARNING.md` delimitada por los
  marcadores `<!-- menthor:task:start v1 -->` y `<!-- menthor:task:end -->` que
  contiene las subsecciones canónicas de la tarea activa: criterios de
  aceptación, pistas escalonadas, referencia y sintaxis, y anatomía y buenas
  prácticas. Es la superficie por la que el agente publica el material de la
  tarea dentro del archivo, en lugar de sólo en el chat. Cuando existe manda
  sobre los defaults y sobre el parseo heurístico del texto libre de la sección.
  *(vive en `src/task-writer.ts`; leído desde `src/parser.ts`)*

- **Escritor de tarea (`src/task-writer.ts`)**: módulo puro que conoce el formato
  del bloque gestionado --marcadores, `renderTaskBlock`, `parseTaskBlock`,
  `splitTaskBlock`, `upsertTaskBlock`--. No accede al disco: recibe y devuelve
  contenido. `upsertTaskBlock` es idempotente y sólo reemplaza lo que está entre
  los marcadores (o inserta el bloque al final de la sección de tarea activa),
  dejando intacto el resto del archivo.

- **Tarea**: reto pedagógico asignado al alumno, con estado
  `pending | active | completed`. *(vive en `src/types.ts`, `LearningTask`)*

- **Tarea activa**: la tarea en curso (`activeTask`) que el dashboard muestra en
  foco; sólo puede haber una a la vez. *(vive en `src/types.ts` / `src/parser.ts`)*

- **Next step** ("Siguiente paso"): el primer criterio de aceptación pendiente de
  la tarea activa, destacado en 2 segundos para saber qué toca hacer ahora.
  *(vive en `src/client/js/dashboard.js`, `renderNextStep`)*

- **Criterio de aceptación**: condición que debe cumplirse para validar la tarea
  activa; se muestra como checklist. *(vive en `src/types.ts`,
  `LearningTask.evaluationCriteria`)*

- **critKey**: clave estable por criterio (índice + fragmento del texto) que
  identifica cada casilla del checklist. El estado marcado vive en
  `localCriteriaState`, una closure de `dashboard.js`: es efímero por sesión de
  página y se pierde al recargar (nunca toca `localStorage`).
  *(vive en `src/client/js/dashboard.js`, `critKey`)*

- **Pista escalonada**: ayuda graduada en niveles, de menor a mayor revelación y
  sin spoilers; se abre de una en una sólo cuando el alumno se bloquea.
  *(vive en `src/types.ts`, `LearningHint`; `src/client/js/dashboard.js`, `renderHints`)*

- **Competencia**: capacidad que el alumno desarrolla, con estado
  `pending | in_progress | mastered`, y que se resume en el progreso dominado.
  *(vive en `src/types.ts`, `LearningCompetency`)*

- **Concepto por reforzar**: idea que conviene afianzar (`mastered: true|false`),
  listada por separado de las competencias. *(vive en `src/types.ts`,
  `LearningConcept`)*

- **Radar pedagógico**: columna de contexto del dashboard que reúne objetivo,
  tecnologías, estado del proyecto, competencias y conceptos. *(vive en
  `src/views/dashboard.eta`, `aside.radar-column`; `src/client/js/dashboard.js`)*

- **Estado del proyecto**: resumen textual del avance, derivado de una etiqueta
  corta y un detalle largo. *(vive en `src/client/js/dashboard.js`,
  `deriveProjectStatusLabel`; `src/views/dashboard.eta`, `#projectStatusBlock`)*

---

> **Este glosario es normativo para revisiones de arquitectura: usa estos términos y no sus sinónimos.**
