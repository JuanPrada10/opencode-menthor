/* =============================================================================
   ui.js — chrome e interacciones del shell: pestañas, modales, toast, selector
   de proyecto y copiar snippet.
   Depende SOLO de api.js. No importa dashboard.js, render.js ni state.js.
   Sus refs de chrome son locales; el pintado llega por el sink `apply`.
   ============================================================================= */

import { fetchLatestState } from "./api.js";
import { write as writeProjectDir } from "./projectStore.js";

/* ======================================================================
   REFS DE CHROME (locales, perezosas)
   ====================================================================== */
function byId(id) { return document.getElementById(id); }

var refsCache = null;
function refs() {
  if (refsCache) return refsCache;
  refsCache = {
    toastBox: byId("toastBox"),
    toastMessage: byId("toastMessage"),
    rawModalBackdrop: byId("rawModalBackdrop"),
    projectDirModal: byId("projectDirModal"),
    projectModalInput: byId("projectModalInput"),
    btnChangeProject: byId("btnChangeProject"),
    btnCloseProjectModal: byId("btnCloseProjectModal"),
    btnCancelProjectModal: byId("btnCancelProjectModal"),
    btnConfirmProjectModal: byId("btnConfirmProjectModal"),
    welcomeBanner: byId("welcomeBanner"),
    welcomeProjectInput: byId("welcomeProjectInput"),
    btnWelcomeLoad: byId("btnWelcomeLoad"),
    chipPruebaAgente: byId("chipPruebaAgente"),
    btnRawMd: byId("btnRawMd"),
    btnCloseModal: byId("btnCloseModal"),
    btnCopySnippet: byId("btnCopySnippet"),
    btnRefresh: byId("btnRefresh"),
    codeSnippetBox: byId("codeSnippetBox"),
    stickyTaskNav: byId("stickyTaskNav")
  };
  return refsCache;
}

/* Sink de pintado inyectado por main.js (dashboard.apply). */
var applySink = null;
function sink(state, opts) {
  if (typeof applySink === "function") applySink(state, opts);
}

/* ======================================================================
   AVISO FLOTANTE
   ====================================================================== */
export function showToast(msg) {
  var r = refs();
  if (!r.toastBox || !r.toastMessage) return;
  r.toastMessage.textContent = msg;
  r.toastBox.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(function () {
    r.toastBox.classList.remove("show");
  }, 2600);
}

/* ======================================================================
   PESTAÑAS (patrón ARIA + teclado)
   ====================================================================== */
function tabButtons() {
  return Array.prototype.slice.call(document.querySelectorAll(".tab-btn"));
}

export function activateTab(panelId, moveFocus) {
  var btns = tabButtons();
  btns.forEach(function (btn) {
    var isTarget = btn.getAttribute("data-tab") === panelId;
    btn.classList.toggle("active", isTarget);
    btn.setAttribute("aria-selected", isTarget ? "true" : "false");
    btn.setAttribute("tabindex", isTarget ? "0" : "-1");
    if (isTarget && moveFocus) btn.focus();
  });
  Array.prototype.forEach.call(document.querySelectorAll(".tab-panel"), function (panel) {
    panel.classList.toggle("active", panel.id === panelId);
  });
  if (moveFocus && panelId) {
    var targetPanel = document.getElementById(panelId);
    if (targetPanel && targetPanel.scrollIntoView) {
      targetPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
}

/* ======================================================================
   MODALES (foco, cierre con Escape y clic en el fondo)
   ====================================================================== */
var lastFocusedElement = null;

export function openModal(modal, focusTarget) {
  if (!modal) return;
  lastFocusedElement = document.activeElement;
  modal.classList.add("open");
  if (focusTarget) {
    setTimeout(function () {
      focusTarget.focus();
      if (focusTarget.select) focusTarget.select();
    }, 60);
  }
}

export function closeModal(modal) {
  if (!modal) return;
  modal.classList.remove("open");
  if (lastFocusedElement && lastFocusedElement.focus) {
    try { lastFocusedElement.focus(); } catch (err) {}
  }
}

/* ======================================================================
   PROYECTO ACTIVO
   ====================================================================== */
export async function switchProjectDirectory(newPath) {
  if (!newPath || !newPath.trim()) {
    showToast("Indica una ruta de proyecto válida");
    return;
  }
  var cleanPath = writeProjectDir(newPath);
  showToast("Cargando proyecto…");
  await fetchLatestState({ apply: sink, dir: cleanPath, force: true });
  showToast("Proyecto sincronizado");
}

/* ======================================================================
   ENGANCHE DE LISTENERS
   ====================================================================== */
export function initUi(config) {
  var cfg = config || {};
  applySink = (typeof cfg.apply === "function") ? cfg.apply : null;
  var r = refs();

  /* ---------- Pestañas ---------- */
  var buttons = tabButtons();
  buttons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      activateTab(btn.getAttribute("data-tab"), false);
    });
    btn.addEventListener("keydown", function (e) {
      var index = buttons.indexOf(btn);
      var target = -1;
      if (e.key === "ArrowRight") target = (index + 1) % buttons.length;
      else if (e.key === "ArrowLeft") target = (index - 1 + buttons.length) % buttons.length;
      else if (e.key === "Home") target = 0;
      else if (e.key === "End") target = buttons.length - 1;
      if (target >= 0) {
        e.preventDefault();
        activateTab(buttons[target].getAttribute("data-tab"), true);
      }
    });
  });

  /* ---------- Modales: Escape ---------- */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (r.rawModalBackdrop && r.rawModalBackdrop.classList.contains("open")) closeModal(r.rawModalBackdrop);
    if (r.projectDirModal && r.projectDirModal.classList.contains("open")) closeModal(r.projectDirModal);
  });

  /* ---------- Modal de proyecto ---------- */
  if (r.btnChangeProject) {
    r.btnChangeProject.addEventListener("click", function () {
      openModal(r.projectDirModal, r.projectModalInput);
    });
  }
  if (r.btnCloseProjectModal) {
    r.btnCloseProjectModal.addEventListener("click", function () { closeModal(r.projectDirModal); });
  }
  if (r.btnCancelProjectModal) {
    r.btnCancelProjectModal.addEventListener("click", function () { closeModal(r.projectDirModal); });
  }
  if (r.projectDirModal) {
    r.projectDirModal.addEventListener("click", function (e) {
      if (e.target === r.projectDirModal) closeModal(r.projectDirModal);
    });
  }
  if (r.btnConfirmProjectModal) {
    r.btnConfirmProjectModal.addEventListener("click", function () {
      var value = r.projectModalInput ? r.projectModalInput.value : "";
      closeModal(r.projectDirModal);
      switchProjectDirectory(value);
    });
  }
  if (r.projectModalInput) {
    r.projectModalInput.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      var value = r.projectModalInput.value;
      closeModal(r.projectDirModal);
      switchProjectDirectory(value);
    });
  }

  /* ---------- Modal de LEARNING.md crudo ---------- */
  if (r.btnRawMd) {
    r.btnRawMd.addEventListener("click", function () { openModal(r.rawModalBackdrop, null); });
  }
  if (r.btnCloseModal) {
    r.btnCloseModal.addEventListener("click", function () { closeModal(r.rawModalBackdrop); });
  }
  if (r.rawModalBackdrop) {
    r.rawModalBackdrop.addEventListener("click", function (e) {
      if (e.target === r.rawModalBackdrop) closeModal(r.rawModalBackdrop);
    });
  }

  /* ---------- Copiar snippet (texto plano del bloque renderizado) ---------- */
  if (r.btnCopySnippet) {
    r.btnCopySnippet.addEventListener("click", function () {
      var box = r.codeSnippetBox;
      var snippet = "";
      if (box) {
        var lines = box.querySelectorAll(".code-line-content");
        if (lines.length > 0) {
          var lineTexts = [];
          for (var i = 0; i < lines.length; i++) {
            lineTexts.push(lines[i].textContent || "");
          }
          snippet = lineTexts.join("\n").trim();
        } else {
          snippet = String(box.textContent || "").trim();
        }
      }
      var placeholder = snippet.indexOf("// No hay snippet") === 0 ||
        snippet.indexOf("// Esperando una nueva tarea") === 0;
      if (!snippet || placeholder) { showToast("No hay snippet disponible para copiar"); return; }
      
      var copyBtn = r.btnCopySnippet;
      var btnLabel = copyBtn.querySelector(".btn-label");
      var originalText = btnLabel ? btnLabel.textContent : "Copiar";

      function setCopiedState() {
        copyBtn.classList.add("copied");
        if (btnLabel) btnLabel.textContent = "✓ Copiado";
        clearTimeout(copyBtn._copiedTimer);
        copyBtn._copiedTimer = setTimeout(function () {
          copyBtn.classList.remove("copied");
          if (btnLabel) btnLabel.textContent = originalText;
        }, 2000);
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(snippet)
          .then(function () {
            setCopiedState();
            showToast("Snippet copiado al portapapeles");
          })
          .catch(function () { showToast("No se pudo copiar el snippet"); });
      } else {
        showToast("El portapapeles no está disponible en este navegador");
      }
    });
  }

  /* ---------- Bienvenida: cargar proyecto ---------- */
  if (r.btnWelcomeLoad && r.welcomeProjectInput) {
    r.btnWelcomeLoad.addEventListener("click", function () {
      switchProjectDirectory(r.welcomeProjectInput.value);
    });
    r.welcomeProjectInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") switchProjectDirectory(r.welcomeProjectInput.value);
    });
  }

  if (r.chipPruebaAgente) {
    r.chipPruebaAgente.addEventListener("click", function () {
      var path = r.chipPruebaAgente.getAttribute("data-path");
      if (r.welcomeProjectInput && path) r.welcomeProjectInput.value = path;
      switchProjectDirectory(path);
    });
  }

  /* ---------- Refrescar ---------- */
  if (r.btnRefresh) {
    r.btnRefresh.addEventListener("click", async function () {
      showToast("Leyendo LEARNING.md…");
      await fetchLatestState({ apply: sink });
      showToast("Estado actualizado");
    });
  }

  /* ---------- Sticky Subheader / Barra flotante de navegación al hacer scroll ---------- */
  if (r.stickyTaskNav) {
    var hero = document.querySelector(".active-task-hero");
    var nav = r.stickyTaskNav;
    var handleScroll = function () {
      if (!hero) {
        nav.classList.remove("is-visible");
        nav.setAttribute("aria-hidden", "true");
        return;
      }
      var rect = hero.getBoundingClientRect();
      /* Al scrollear pasando la cabecera del hero (primeros 130px de la tarea) */
      var isPassed = rect.top < 20;
      if (isPassed) {
        nav.classList.add("is-visible");
        nav.setAttribute("aria-hidden", "false");
      } else {
        nav.classList.remove("is-visible");
        nav.setAttribute("aria-hidden", "true");
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
  }
}
