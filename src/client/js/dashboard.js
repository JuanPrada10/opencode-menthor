/* =============================================================================
   dashboard.js — módulo profundo del dashboard (pintado + interacciones).
   Fusiona render.js + state.js en un único módulo con estado encapsulado por
   closure del factory createDashboard(root, options).

   Interface pública:
     createDashboard(root, options?) -> { apply(state, opts?) }
     deriveProjectStatusLabel(state)
     criteriaInfo(criteria, localCriteriaState)
     critKey(index, text)
     getCriteria(task)

   CONTRATO DE `root` (importante):
     El `root` debe CONTENER el shell del dashboard: la barra de pestañas
     (`.tab-btn[data-tab]`) con sus paneles (`.tab-panel#<id>`, incluido
     `#tab-criteria`) y los contenedores que el pintado manipula (ver `el`).
     La factory resuelve TODOS sus refs desde `root` —nunca con
     `document.getElementById`— y crea los nodos con el documento de `root`
     (`root.ownerDocument`). Por tanto es montable en CUALQUIER contenedor:
     basta que ese contenedor contenga el shell. El singleton de producción lo
     monta sobre `document.body` (ver main.js), que satisface el contrato por
     contener todo el documento.

   Si un nodo requerido del shell no vive dentro de `root`, el módulo avisa una
   vez por consola y desactiva SÓLO la función afectada (nunca rompe).

   Depende SOLO de markdown.js, syntax.js y projectStore.js. No importa ui.js,
   api.js ni state.js. El chrome del topbar (connectionText, toastBox) queda
   FUERA de este seam.
   ============================================================================= */

import { escapeHtml, formatInlineMarkdown, renderRichContent } from "./markdown.js";
import { highlightSyntax } from "./syntax.js";
import { createProjectStore, fromFilePath } from "./projectStore.js";

/* ======================================================================
   SEAMS PUROS (exportados para tests)
   ====================================================================== */

/* Regla única de criterios: evaluationCriteria ?? requirements */
export function getCriteria(task) {
  if (!task) return [];
  var list = (task.evaluationCriteria && task.evaluationCriteria.length)
    ? task.evaluationCriteria
    : (task.requirements || []);
  return list || [];
}

/* Clave estable por criterio (índice + fragmento del texto) */
export function critKey(index, text) {
  return "crit_" + index + "_" + String(text).substring(0, 15);
}

/* Cuántos criterios van cumplidos y cuál es el primero pendiente.
   Recibe el mapa de estado local para ser una función pura. */
export function criteriaInfo(criteria, localCriteriaState) {
  var checked = 0;
  var firstPending = -1;
  for (var i = 0; i < criteria.length; i++) {
    if (localCriteriaState[critKey(i, criteria[i])]) {
      checked++;
    } else if (firstPending === -1) {
      firstPending = i;
    }
  }
  return { total: criteria.length, checked: checked, firstPending: firstPending };
}

/* Etiqueta CORTA y legible del estado. El párrafo largo de "Estado Actual"
   nunca se vuelca en la etiqueta: se resume y su texto íntegro queda en el
   atributo title y en el bloque "Estado del proyecto". */
export function deriveProjectStatusLabel(state) {
  if (!state || !state.exists) return "Sin proyecto activo";
  var raw = String(state.status || "").trim();
  var task = state.activeTask || null;
  if (!raw) {
    if (task && task.status === "completed") return "Tarea completada";
    return task ? "En desarrollo activo" : "En curso";
  }
  var t = raw.toLowerCase();
  if (/(complet|finaliz|termin|culmin|concluid|listo|done)/.test(t)) return "Completado";
  if (/(bloque|pausa|detenid|suspendid|stuck|en espera)/.test(t)) return "En pausa";
  if (/(progres|desarrollo|avanz|en curso|activo|trabaj|marcha|construcc)/.test(t)) return "En desarrollo activo";
  if (/(inicializ|inicio|comienzo|arranque|setup|fase\s*1)/.test(t)) return "En inicio";
  if (/(pendient|por hacer)/.test(t)) return "Pendiente";
  // Respaldo: primera cláusula recortada a pocas palabras.
  var clause = raw.split(/[.:;\n(]/)[0].trim();
  var words = clause ? clause.split(/\s+/).slice(0, 4).join(" ") : "";
  return words || "En curso";
}

/* ======================================================================
   ICONOS
   ====================================================================== */
var ICON_CHECK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
var ICON_TARGET = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>';
var ICON_LOCK = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
var ICON_SEARCH = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
var ICON_LIST = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>';

/* Adapter de storage por defecto (memoria segura ante entornos sin DOM). */
function createDefaultStorage() {
  return {
    get: function (key) {
      try { return window.localStorage.getItem(key); } catch (err) { return null; }
    },
    set: function (key, value) {
      try { window.localStorage.setItem(key, value); } catch (err) { /* sin persistencia */ }
    }
  };
}

/* ======================================================================
   FACTORY
   ====================================================================== */
export function createDashboard(root, options) {
  var opts = options || {};
  var storage = opts.storage || createDefaultStorage();
  /* El proyecto activo (clave + normalización) lo posee projectStore.js.
     Adaptamos el storage get/set de este factory a su contrato getItem/setItem. */
  var projectStore = createProjectStore({
    getItem: function (key) { return storage.get(key); },
    setItem: function (key, value) { storage.set(key, value); },
    removeItem: function () {}
  });
  var onRequestTab = (typeof opts.onRequestTab === "function")
    ? opts.onRequestTab
    : function () {};

  /* Referencias del DOM reconstruidas desde el root (no document global). */
  var el = {
    /* Radar */
    objective: root.querySelector("#projectObjective"),
    projectStatus: root.querySelector("#projectStatus"),
    projectStatusBlock: root.querySelector("#projectStatusBlock"),
    projectStatusDetail: root.querySelector("#projectStatusDetail"),
    techStack: root.querySelector("#techStackContainer"),
    competencyPct: root.querySelector("#competencyPct"),
    progressFill: root.querySelector("#progressFill"),
    progressHint: root.querySelector("#progressHint"),
    competencyTrack: root.querySelector("#competencyTrack"),
    compCount: root.querySelector("#compCount"),
    compSummary: root.querySelector("#compSummary"),
    competenciesList: root.querySelector("#competenciesList"),
    conceptsCount: root.querySelector("#conceptsCount"),
    conceptsList: root.querySelector("#conceptsList"),
    /* Tarea */
    taskTitle: root.querySelector("#taskTitle"),
    taskDesc: root.querySelector("#taskDesc"),
    taskStatusBadge: root.querySelector("#taskStatusBadge"),
    taskStatusText: root.querySelector("#taskStatusText"),
    nextStepPanel: root.querySelector("#nextStepPanel"),
    criteriaChecklist: root.querySelector("#criteriaChecklist"),
    criteriaProgressLabel: root.querySelector("#criteriaProgressLabel"),
    stickyCriteriaProgress: root.querySelector("#stickyCriteriaProgress"),
    stickyTaskTitle: root.querySelector("#stickyTaskTitle"),
    criteriaTabCount: root.querySelector("#criteriaTabCount"),
    hintsTabCount: root.querySelector("#hintsTabCount"),
    codeSnippetBox: root.querySelector("#codeSnippetBox"),
    anatomyList: root.querySelector("#anatomyList"),
    hintsContainer: root.querySelector("#hintsContainer"),
    /* Proyecto (pill + modal + bienvenida) */
    projectPillPathText: root.querySelector("#projectPillPathText"),
    projectModalInput: root.querySelector("#projectModalInput"),
    welcomeProjectInput: root.querySelector("#welcomeProjectInput"),
    welcomeBanner: root.querySelector("#welcomeBanner"),
    chipPruebaAgente: root.querySelector("#chipPruebaAgente"),
    /* Markdown crudo */
    rawMarkdownContent: root.querySelector("#rawMarkdownContent"),
    /* Shell de pestañas: se resuelve UNA sola vez aquí, nunca en cada interacción. */
    tabButtons: Array.prototype.slice.call(root.querySelectorAll(".tab-btn")),
    tabPanels: Array.prototype.slice.call(root.querySelectorAll(".tab-panel")),
    tabCriteria: root.querySelector("#tab-criteria")
  };

  /* Documento inyectado: se deriva del propio `root` para no depender de dónde
     esté montado. `document` (global) aparece SÓLO como último recurso cuando el
     root no expone `ownerDocument` (root nulo o stub de test): ahí no hay un
     documento mejor al que recurrir. Todo lo demás crea nodos con `doc`. */
  var doc = (root && root.ownerDocument) || document;

  /* ---------- Contrato del shell: degradación honesta ----------
     Si un nodo REQUERIDO del shell no vive dentro de `root`, el módulo no debe
     romper ni mentir: se avisa UNA vez y se desactiva SÓLO la función que
     depende de ese nodo; el resto sigue pintando e interactuando igual. */
  var missingShell = [];
  if (el.tabButtons.length === 0) missingShell.push("los botones de pestaña (.tab-btn[data-tab])");
  if (el.tabPanels.length === 0) missingShell.push("los paneles de pestaña (.tab-panel)");
  if (!el.tabCriteria) missingShell.push("el panel #tab-criteria");
  if (missingShell.length) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn(
        "[dashboard] shell incompleto dentro del `root`: falta " +
        missingShell.join(", ") +
        ". Se desactiva sólo la función afectada; el resto del dashboard sigue operando."
      );
    }
  }
  /* El cambio de pestaña exige botones y paneles dentro del root. */
  var canSwitchTabs = el.tabButtons.length > 0 && el.tabPanels.length > 0;

  /* Estado interno del módulo (nadie fuera lo lee ni lo escribe). */
  var currentState = null;
  var localCriteriaState = {};

  /* ---------- Piezas de interfaz reutilizables ---------- */
  function emptyState(icon, title, text) {
    return '<div class="empty-state">' +
      '<span class="empty-state-icon">' + icon + '</span>' +
      '<p class="empty-state-title">' + title + '</p>' +
      '<p class="empty-state-text">' + text + '</p>' +
    '</div>';
  }

  function summaryChip(kind, value, label) {
    return '<li class="summary-chip is-' + kind + '">' +
      '<span class="summary-value">' + value + '</span>' +
      '<span class="summary-label">' + label + '</span>' +
    '</li>';
  }

  function stripLeadingNumber(text) {
    return String(text).replace(/^\s*\d+\s*[.)]\s*/, "").trim();
  }

  function hintTypeLabel(type) {
    if (type === "concept") return "Concepto clave";
    if (type === "algorithm") return "Estrategia";
    if (type === "snippet") return "Ejemplo guiado";
    return "Pista guiada";
  }

  function hintTitle(hint) {
    var label = (hint && hint.label) ? String(hint.label) : "";
    var cleaned = label
      .replace(/^\s*nivel\s*\d+\s*(?:\([^)]*\))?\s*[:\-–—]\s*/i, "")
      .replace(/^\s*pista\s*\d+\s*(?:\([^)]*\))?\s*[:\-–—]\s*/i, "")
      .replace(/^\*{1,2}|\*{1,2}$/g, "")
      .trim();
    if (!cleaned) cleaned = hintTypeLabel(hint && hint.type);
    return escapeHtml(cleaned);
  }

  /* ---------- Siguiente paso ---------- */
  function renderNextStep(criteria) {
    var panel = el.nextStepPanel;
    if (!panel) return;
    var hasTask = !!(currentState && currentState.activeTask);

    if (!hasTask) {
      panel.setAttribute("data-state", "idle");
      panel.innerHTML =
        '<div class="next-step-head">' +
          '<span class="next-step-eyebrow">' + ICON_TARGET + ' En espera</span>' +
        '</div>' +
        '<p class="next-step-text">Cuando Menthor te asigne una tarea, aquí verás el primer paso pendiente.</p>';
      return;
    }

    var info = criteriaInfo(criteria, localCriteriaState);

    if (info.total === 0) {
      panel.setAttribute("data-state", "idle");
      panel.innerHTML =
        '<div class="next-step-head">' +
          '<span class="next-step-eyebrow">' + ICON_TARGET + ' Siguiente paso</span>' +
        '</div>' +
        '<p class="next-step-text">Esta tarea no tiene criterios definidos: sigue las indicaciones de Menthor en OpenCode.</p>';
      return;
    }

    if (info.firstPending === -1) {
      panel.setAttribute("data-state", "done");
      panel.innerHTML =
        '<div class="next-step-head">' +
          '<span class="next-step-eyebrow">' + ICON_CHECK + ' ¡Misión completada!</span>' +
          '<span class="next-step-progress">' + info.checked + ' de ' + info.total + '</span>' +
        '</div>' +
        '<p class="next-step-text">¡Misión completada! Avisa a tu mentor en OpenCode para continuar.</p>' +
        '<div class="next-step-track" aria-hidden="true"><span class="next-step-fill" style="width:100%"></span></div>' +
        '<div class="next-step-actions">' +
          '<button type="button" class="btn-ghost" data-action="goto-criteria">Revisar criterios</button>' +
        '</div>';
      return;
    }

    var pct = Math.round((info.checked / info.total) * 100);
    panel.setAttribute("data-state", "pending");
    panel.innerHTML =
      '<div class="next-step-head">' +
        '<span class="next-step-eyebrow">' + ICON_TARGET + ' Siguiente paso</span>' +
        '<span class="next-step-progress">' + info.checked + ' de ' + info.total + ' cumplidos</span>' +
      '</div>' +
      '<p class="next-step-text">' + formatInlineMarkdown(criteria[info.firstPending]) + '</p>' +
      '<div class="next-step-track" aria-hidden="true"><span class="next-step-fill" style="width:' + pct + '%"></span></div>' +
      '<div class="next-step-actions">' +
        '<button type="button" class="btn-primary" data-action="complete-next">' + ICON_CHECK + ' Marcar como cumplido</button>' +
        '<button type="button" class="btn-ghost" data-action="goto-criteria">Ver todos los criterios</button>' +
      '</div>';
  }

  /* ---------- Objetivo del proyecto ---------- */
  function renderObjective(state) {
    var host = el.objective;
    if (!host) return;
    if (!state || !state.exists) {
      host.innerHTML = '<p class="objective-empty">Esperando un proyecto válido para cargar el radar pedagógico.</p>';
      return;
    }
    var name = state.projectName ? String(state.projectName).trim() : "";
    var goals = (state.learningGoals && state.learningGoals.length) ? state.learningGoals : [];
    var generic = state.objective ? String(state.objective).trim() : "";
    var html = "";

    if (name) {
      html += '<p class="objective-project">' +
        '<span class="objective-project-tag">Proyecto</span>' +
        '<span class="objective-project-name">' + formatInlineMarkdown(name) + '</span>' +
      '</p>';
    }
    if (goals.length) {
      html += '<p class="objective-subhead">Objetivos de aprendizaje</p>' +
        '<ul class="goal-list">';
      for (var i = 0; i < goals.length; i++) {
        html += '<li class="goal-item">' + formatInlineMarkdown(goals[i]) + '</li>';
      }
      html += '</ul>';
    }
    if (!name && !goals.length) {
      if (generic) {
        html += '<div class="objective-prose prose">' + renderRichContent(generic) + '</div>';
      } else {
        html += '<p class="objective-empty">Aún no hay un objetivo definido en LEARNING.md.</p>';
      }
    }
    host.innerHTML = html;
  }

  /* ---------- Checklist de criterios ---------- */
  function renderCriteriaList(criteria) {
    if (!el.criteriaChecklist) return;
    var info = criteriaInfo(criteria, localCriteriaState);
    el.criteriaChecklist.innerHTML = "";

    if (el.criteriaProgressLabel) {
      el.criteriaProgressLabel.textContent = info.checked + " de " + info.total + " cumplidos";
    }
    if (el.stickyCriteriaProgress) {
      el.stickyCriteriaProgress.textContent = info.checked + "/" + info.total;
      if (info.total > 0 && info.checked === info.total) {
        el.stickyCriteriaProgress.classList.add("is-complete");
      } else {
        el.stickyCriteriaProgress.classList.remove("is-complete");
      }
    }

    if (criteria.length === 0) {
      el.criteriaChecklist.innerHTML = emptyState(
        ICON_LIST,
        "Sin criterios activos",
        "Cuando Menthor asigne una tarea con criterios de aceptación, aparecerán aquí como lista de comprobación."
      );
      return;
    }

    criteria.forEach(function (crit, idx) {
      var key = critKey(idx, crit);
      var isChecked = !!localCriteriaState[key];
      var item = doc.createElement("div");
      item.className = "criterion-item" + (isChecked ? " checked" : "");
      item.setAttribute("role", "checkbox");
      item.setAttribute("aria-checked", isChecked ? "true" : "false");
      item.setAttribute("tabindex", "0");
      item.setAttribute("data-crit-key", key);
      item.innerHTML = "" +
        '<span class="criterion-index" aria-hidden="true">' + (isChecked ? ICON_CHECK : String(idx + 1)) + '</span>' +
        '<span class="criterion-body">' +
          '<span class="criterion-text">' + formatInlineMarkdown(crit) + '</span>' +
          '<span class="criterion-status">' + (isChecked ? "Cumplido" : "Pendiente") + '</span>' +
        '</span>';
      el.criteriaChecklist.appendChild(item);
    });
  }

  function renderSnippet(task) {
    if (!el.codeSnippetBox) return;
    var snippet = (task && task.referenceSnippet) || "// No hay snippet de referencia para esta tarea.";
    var isPlaceholder = !task || !task.referenceSnippet ||
      snippet.indexOf("// No hay snippet") === 0 ||
      snippet.indexOf("// Esperando") === 0;

    if (isPlaceholder) {
      el.codeSnippetBox.innerHTML = "<code>" + highlightSyntax(snippet) + "</code>";
      return;
    }

    var lines = snippet.split("\n");
    var html = '<div class="code-lines-wrapper" role="region" aria-label="Código con números de línea">';
    for (var i = 0; i < lines.length; i++) {
      var lineNum = i + 1;
      var highlightedLine = highlightSyntax(lines[i]);
      html += '<div class="code-line">' +
        '<span class="code-line-num" aria-hidden="true">' + lineNum + '</span>' +
        '<span class="code-line-content"><code>' + (highlightedLine || " ") + '</code></span>' +
      '</div>';
    }
    html += '</div>';
    el.codeSnippetBox.innerHTML = html;
  }

  function renderAnatomy(task) {
    if (!el.anatomyList) return;
    var notes = (task && task.referenceNotes && task.referenceNotes.length) ? task.referenceNotes : [];
    el.anatomyList.innerHTML = "";

    if (notes.length === 0) {
      el.anatomyList.innerHTML = '<p class="panel-hint">El propio snippet está comentado paso a paso.</p>';
      return;
    }

    notes.forEach(function (note, idx) {
      var row = doc.createElement("div");
      row.className = "anatomy-item";
      row.innerHTML = "" +
        '<span class="anatomy-num" aria-hidden="true">' + (idx + 1) + '</span>' +
        '<span>' + formatInlineMarkdown(stripLeadingNumber(note)) + '</span>';
      el.anatomyList.appendChild(row);
    });
  }

  /* ---------- Acordeón de pistas ---------- */
  function renderHints(hints) {
    if (!el.hintsContainer) return;
    el.hintsContainer.innerHTML = "";

    if (!hints || hints.length === 0) {
      el.hintsContainer.innerHTML = emptyState(
        ICON_LOCK,
        "Pistas bloqueadas",
        "Se desbloquearán cuando Menthor asigne una tarea activa con pistas escalonadas."
      );
      return;
    }

    hints.forEach(function (hint, index) {
      var level = hint.level || (index + 1);
      var bodyId = "hint-body-" + index;
      var headerId = "hint-header-" + index;
      var content = String(hint.content || "");
      var looksLikeCode = hint.type === "snippet" ||
        (!hint.type && (content.indexOf("\n") !== -1 || content.indexOf("const ") !== -1 || content.indexOf("function") !== -1));
      var contentHtml = looksLikeCode
        ? "<pre><code>" + highlightSyntax(content) + "</code></pre>"
        : renderRichContent(content);

      var subtitle = "💡 Idea conceptual para desbloquearte";
      if (level === 2) {
        subtitle = "🧭 Estrategia y arquitectura de solución";
      } else if (level === 3) {
        subtitle = "⚠️ Plantilla con código guiado";
      }

      var card = doc.createElement("div");
      card.className = "hint-card";
      card.innerHTML = "" +
        '<button type="button" class="hint-header" id="' + headerId + '" aria-expanded="false" aria-controls="' + bodyId + '">' +
          '<span class="hint-badge-level lvl-' + level + '">Nivel ' + level + '</span>' +
          '<span class="hint-header-main">' +
            '<span class="hint-title-text">' + hintTitle(hint) + '</span>' +
            '<span class="hint-subtitle">' + subtitle + '</span>' +
          '</span>' +
          '<span class="hint-step">' + (index + 1) + ' de ' + hints.length + '</span>' +
          '<svg class="hint-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<polyline points="6 9 12 15 18 9"/>' +
          '</svg>' +
        '</button>' +
        '<div class="hint-body" id="' + bodyId + '" role="region" aria-labelledby="' + headerId + '">' +
          '<div class="hint-body-inner">' +
            '<div class="hint-content prose">' + contentHtml + '</div>' +
          '</div>' +
        '</div>';
      el.hintsContainer.appendChild(card);
    });
  }

  /* ---------- Pintado principal ---------- */
  function paint(state) {
    if (!state) return;
    currentState = state;

    /* Proyecto activo: state.filePath -> projectStore -> vacío. */
    var activePath = state.filePath
      ? fromFilePath(state.filePath)
      : (projectStore.read() || "");
    if (el.projectPillPathText) {
      el.projectPillPathText.textContent = activePath || "Sin ruta definida";
    }
    if (el.projectModalInput) {
      el.projectModalInput.value = activePath || "";
    }
    if (el.welcomeProjectInput && !el.welcomeProjectInput.value) {
      var suggested = el.chipPruebaAgente ? el.chipPruebaAgente.getAttribute("data-path") : "";
      el.welcomeProjectInput.value = activePath || suggested || "";
    }
    if (el.welcomeBanner) {
      el.welcomeBanner.style.display = state.exists ? "none" : "grid";
    }

    /* Objetivo del proyecto (estructurado) */
    renderObjective(state);

    /* Estado del proyecto (etiqueta corta + detalle) */
    var statusLabel = deriveProjectStatusLabel(state);
    var statusFull = (state.status && String(state.status).trim()) || "";
    if (el.projectStatus) {
      el.projectStatus.textContent = statusLabel;
      if (statusFull) {
        el.projectStatus.setAttribute("title", statusFull);
      } else {
        el.projectStatus.removeAttribute("title");
      }
    }
    if (el.projectStatusBlock) {
      if (statusFull) {
        el.projectStatusBlock.hidden = false;
        if (el.projectStatusDetail) el.projectStatusDetail.innerHTML = renderRichContent(statusFull);
      } else {
        el.projectStatusBlock.hidden = true;
        if (el.projectStatusDetail) el.projectStatusDetail.innerHTML = "";
      }
    }

    /* Tecnologías */
    if (el.techStack) {
      el.techStack.innerHTML = "";
      // Sin fabricación: si tu archivo no declara stack, no inventamos uno (ver tarea "B").
      var stack = state.techStack || [];
      stack.forEach(function (tech) {
        var chip = doc.createElement("span");
        chip.className = "tech-chip";
        chip.textContent = tech.replace(/^\*\*|\*\*$/g, "");
        el.techStack.appendChild(chip);
      });
    }

    /* Competencias */
    var competencies = state.competencies || [];
    var masteredComps = competencies.filter(function (c) { return c.status === "mastered"; }).length;
    var inProgressComps = competencies.filter(function (c) { return c.status === "in_progress"; }).length;
    var pendingComps = Math.max(0, competencies.length - masteredComps - inProgressComps);
    var pct = competencies.length > 0 ? Math.round((masteredComps / competencies.length) * 100) : 0;

    if (el.competencyPct) el.competencyPct.textContent = pct + "%";
    if (el.progressFill) el.progressFill.style.width = pct + "%";
    if (el.compCount) el.compCount.textContent = masteredComps + "/" + competencies.length;
    if (el.progressHint) el.progressHint.textContent = masteredComps + " de " + competencies.length + " competencias dominadas";
    if (el.competencyTrack) {
      el.competencyTrack.setAttribute("aria-valuenow", String(pct));
      el.competencyTrack.setAttribute("aria-valuetext", masteredComps + " de " + competencies.length + " competencias dominadas");
    }

    if (el.compSummary) {
      if (competencies.length === 0) {
        el.compSummary.hidden = true;
        el.compSummary.innerHTML = "";
      } else {
        el.compSummary.hidden = false;
        el.compSummary.innerHTML =
          summaryChip("mastered", masteredComps, "dominadas") +
          summaryChip("in_progress", inProgressComps, "en progreso") +
          summaryChip("pending", pendingComps, "pendientes");
      }
    }

    if (el.competenciesList) {
      el.competenciesList.innerHTML = "";
      if (competencies.length === 0) {
        el.competenciesList.innerHTML = '<li class="empty-state-item">' +
          emptyState(ICON_LIST, "Sin competencias todavía", "Cuando LEARNING.md defina competencias, verás aquí su progreso.") +
        '</li>';
      } else {
        competencies.forEach(function (comp) {
          var isMastered = comp.status === "mastered";
          var isInProgress = comp.status === "in_progress";
          var li = doc.createElement("li");
          li.className = "item-card" + (isMastered ? " mastered" : (isInProgress ? " in_progress" : ""));
          li.innerHTML = "" +
            '<span class="item-checkbox-visual" aria-hidden="true">' +
              (isMastered ? ICON_CHECK : (isInProgress ? '<span style="font-size:11px;font-weight:bold;">&#9679;</span>' : "")) +
            '</span>' +
            '<span class="item-label">' + formatInlineMarkdown(comp.name) + '</span>' +
            '<span class="item-badge ' + escapeHtml(comp.status || "pending") + '">' +
              (isMastered ? "Dominado" : (isInProgress ? "En progreso" : "Pendiente")) +
            '</span>';
          el.competenciesList.appendChild(li);
        });
      }
    }

    /* Conceptos por reforzar */
    var concepts = state.concepts || [];
    var masteredConcepts = concepts.filter(function (c) { return c.mastered; }).length;
    if (el.conceptsCount) el.conceptsCount.textContent = masteredConcepts + "/" + concepts.length;

    if (el.conceptsList) {
      el.conceptsList.innerHTML = "";
      if (concepts.length === 0) {
        el.conceptsList.innerHTML = '<li class="empty-state-item">' +
          emptyState(ICON_SEARCH, "Sin conceptos registrados", "Menthor anotará aquí los conceptos que conviene afianzar.") +
        '</li>';
      } else {
        concepts.forEach(function (concept) {
          var li = doc.createElement("li");
          li.className = "item-card" + (concept.mastered ? " mastered" : "");
          li.innerHTML = "" +
            '<span class="item-checkbox-visual" aria-hidden="true">' +
              (concept.mastered ? ICON_CHECK : "") +
            '</span>' +
            '<span class="item-label">' + formatInlineMarkdown(concept.name) + '</span>' +
            '<span class="item-badge ' + (concept.mastered ? "mastered" : "pending") + '">' +
              (concept.mastered ? "Comprendido" : "Por afianzar") +
            '</span>';
          el.conceptsList.appendChild(li);
        });
      }
    }

    /* Tarea activa */
    var criteria = [];
    var hints = [];

    if (state.activeTask) {
      var task = state.activeTask;
      criteria = getCriteria(task);
      hints = task.hints || [];

      if (el.taskTitle) el.taskTitle.innerHTML = formatInlineMarkdown(task.title);
      if (el.stickyTaskTitle) el.stickyTaskTitle.innerHTML = formatInlineMarkdown(task.title);
      if (el.taskDesc) {
        el.taskDesc.innerHTML = renderRichContent(task.description || "Completa los criterios indicados a continuación.");
      }

      if (el.taskStatusBadge && el.taskStatusText) {
        var taskState = task.status || "active";
        el.taskStatusBadge.setAttribute("data-state", taskState);
        el.taskStatusText.textContent = (taskState === "completed")
          ? "Tarea completada"
          : ((taskState === "pending") ? "Tarea pendiente" : "Tarea activa");
      }

      renderCriteriaList(criteria);
      renderSnippet(task);
      renderAnatomy(task);
      renderHints(hints);
    } else {
      if (el.taskTitle) {
        el.taskTitle.textContent = state.exists
          ? "Sin tarea activa en LEARNING.md"
          : "Esperando un proyecto con LEARNING.md";
      }
      if (el.stickyTaskTitle) {
        el.stickyTaskTitle.textContent = state.exists
          ? "Sin tarea activa"
          : "Sin proyecto";
      }
      if (el.taskDesc) {
        el.taskDesc.textContent = state.exists
          ? "Pide a Menthor tu siguiente reto pedagógico desde OpenCode."
          : "Conecta tu carpeta de trabajo para empezar el acompañamiento.";
      }
      if (el.taskStatusBadge && el.taskStatusText) {
        el.taskStatusBadge.setAttribute("data-state", "pending");
        el.taskStatusText.textContent = "Sin tarea activa";
      }
      renderCriteriaList([]);
      if (el.codeSnippetBox) {
        el.codeSnippetBox.innerHTML = "<code>// Esperando una nueva tarea…</code>";
      }
      if (el.anatomyList) {
        el.anatomyList.innerHTML = '<p class="panel-hint">La anatomía comentada aparecerá con la próxima tarea.</p>';
      }
      renderHints([]);
    }

    /* Contadores y siguiente paso */
    if (el.criteriaTabCount) el.criteriaTabCount.textContent = String(criteria.length);
    if (el.hintsTabCount) el.hintsTabCount.textContent = String(hints.length);
    renderNextStep(criteria);

    /* Markdown crudo (modal) */
    if (el.rawMarkdownContent) {
      el.rawMarkdownContent.textContent = state.rawContent || "LEARNING.md vacío o no encontrado en el directorio activo.";
    }
  }

  /* ======================================================================
     INTERACCIONES (delegación sobre el root)
     ====================================================================== */

  /* Alterna un criterio en el estado local y repinta. */
  function toggleCriterion(key, force) {
    localCriteriaState[key] = (force === undefined) ? !localCriteriaState[key] : force;
    paint(currentState);
    /* Devuelve el foco al criterio sólo si el panel vive dentro del root y está
       activo; si falta, `el.tabCriteria` es null y la función se degrada sin romper. */
    var panel = el.tabCriteria;
    if (!panel || !panel.classList.contains("active")) return;
    var items = el.criteriaChecklist ? el.criteriaChecklist.querySelectorAll(".criterion-item") : [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].getAttribute("data-crit-key") === key) { items[i].focus(); break; }
    }
  }

  /* Marca como cumplido el primer criterio pendiente. */
  function completeNext() {
    var criteria = getCriteria(currentState && currentState.activeTask);
    var info = criteriaInfo(criteria, localCriteriaState);
    if (info.firstPending === -1) return;
    toggleCriterion(critKey(info.firstPending, criteria[info.firstPending]), true);
    var refreshed = el.nextStepPanel
      ? el.nextStepPanel.querySelector(".next-step-actions .btn-primary, .next-step-actions .btn-ghost")
      : null;
    if (refreshed) refreshed.focus();
  }

  /* Alterna el acordeón de una tarjeta de pista. */
  function toggleHint(header) {
    var card = header.closest(".hint-card");
    if (!card) return;
    var isOpen = card.classList.toggle("open");
    header.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }

  /* Activa una pestaña del shell operando SÓLO sobre los refs resueltos desde
     `root` (no vuelve a consultar el documento). Es idempotente con el chrome
     de ui.js: mismo resultado sobre el mismo DOM. Si faltan botones/paneles en
     el root, no hace nada (la función ya quedó desactivada con aviso). */
  function activateTab(panelId, moveFocus) {
    if (!canSwitchTabs || !panelId) return;
    for (var i = 0; i < el.tabButtons.length; i++) {
      var btn = el.tabButtons[i];
      var isTarget = btn.getAttribute("data-tab") === panelId;
      btn.classList.toggle("active", isTarget);
      btn.setAttribute("aria-selected", isTarget ? "true" : "false");
      btn.setAttribute("tabindex", isTarget ? "0" : "-1");
      if (isTarget && moveFocus) btn.focus();
    }
    for (var j = 0; j < el.tabPanels.length; j++) {
      var panel = el.tabPanels[j];
      panel.classList.toggle("active", panel.id === panelId);
    }
  }

  function onRootClick(e) {
    var target = e.target;
    if (!target || !target.closest) return;

    /* Cambio de pestaña del shell (resuelto dentro de root). */
    var tabBtn = target.closest(".tab-btn");
    if (tabBtn && canSwitchTabs && el.tabButtons.indexOf(tabBtn) !== -1) {
      activateTab(tabBtn.getAttribute("data-tab"), false);
      return;
    }

    var actionEl = target.closest("[data-action]");
    if (actionEl && el.nextStepPanel && el.nextStepPanel.contains(actionEl)) {
      var action = actionEl.getAttribute("data-action");
      if (action === "goto-criteria") {
        if (el.tabCriteria) {
          el.tabCriteria.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        var firstCrit = el.criteriaChecklist ? el.criteriaChecklist.querySelector(".criterion-item") : null;
        if (firstCrit) firstCrit.focus();
        onRequestTab("tab-criteria");
        return;
      }
      if (action === "complete-next") { completeNext(); return; }
    }

    var item = target.closest(".criterion-item");
    if (item && el.criteriaChecklist && el.criteriaChecklist.contains(item)) {
      var key = item.getAttribute("data-crit-key");
      if (key) toggleCriterion(key);
      return;
    }

    var header = target.closest(".hint-header");
    if (header && el.hintsContainer && el.hintsContainer.contains(header)) {
      toggleHint(header);
    }
  }

  function onRootKeydown(e) {
    if (e.key !== " " && e.key !== "Enter" && e.key !== "Spacebar") return;
    var target = e.target;
    if (!target || !target.closest) return;
    var item = target.closest(".criterion-item");
    if (!item || !el.criteriaChecklist || !el.criteriaChecklist.contains(item)) return;
    e.preventDefault();
    var key = item.getAttribute("data-crit-key");
    if (key) toggleCriterion(key);
  }

  root.addEventListener("click", onRootClick);
  root.addEventListener("keydown", onRootKeydown);

  /* Ingesta de estado: única entrada pública del módulo. */
  var lastSignature = null;

  function apply(state, applyOpts) {
    if (!state) return;
    var force = !!(applyOpts && applyOpts.force);
    var signature = null;
    try { signature = JSON.stringify(state); } catch (e) { signature = null; }
    if (!force && signature !== null && signature === lastSignature) return;
    lastSignature = signature;
    paint(state);
  }

  return { apply: apply };
}

