/* =============================================================================
   markdown.js — utilidades de texto y render de markdown.
   Extraído de Menthor Studio (src/server.ts, template del dashboard).
   Sin dependencias: módulo hoja.
   ============================================================================= */

/* Escapa caracteres HTML para un render seguro (XSS). */
export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* Markdown en línea -> HTML seguro */
export function formatInlineMarkdown(text) {
  if (!text) return "";
  var str = String(text).trim();

  // Limpiar prefijos redundantes si existen (ej. **Objetivo**:, etc.)
  str = str.replace(new RegExp("^\\*{1,2}(?:objetivo|objective|contexto|context|instrucciones|instructions|tu trabajo|your task|requisitos|requirements|criterios|criteria|pistas|hints|meta)\\*{1,2}[:\\-–]\\s*", "i"), "");

  // Prefijos de pista/nivel (paridad con src/parser.ts · cleanMarkdownPrefix)
  str = str.replace(new RegExp("^\\*{1,2}\\s*(?:pista|nivel)\\b[^*]*?\\*{1,2}\\s*[:\\-–—]\\s*", "i"), "");

  // Escapar caracteres HTML básicos primero para seguridad XSS
  var escaped = escapeHtml(str);

  // Negritas: **texto** o __texto__
  escaped = escaped.replace(new RegExp("\\*\\*(.+?)\\*\\*", "g"), "<strong>$1</strong>");
  escaped = escaped.replace(new RegExp("__(.+?)__", "g"), "<strong>$1</strong>");

  // Inline code: backticks
  escaped = escaped.replace(new RegExp(String.fromCharCode(96) + "([^" + String.fromCharCode(96) + "]+)" + String.fromCharCode(96), "g"), '<code class="inline-code">$1</code>');

  // Cursiva: *texto* o _texto_
  escaped = escaped.replace(new RegExp("(^|[^\\*])\\*([^\\*\\s][^\\*]*?[^\\*\\s]|[^\\*\\s])\\*(?!\\*)", "g"), "$1<em>$2</em>");
  escaped = escaped.replace(new RegExp("(^|[^_])_([^_\\s][^_]*?[^_\\s]|[^_\\s])_(?!_)", "g"), "$1<em>$2</em>");

  // Links markdown: [texto](url)
  escaped = escaped.replace(new RegExp("\\[([^\\]]+)\\]\\((https?:\\/\\/[^\\s\\)]+)\\)", "g"), '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--brand-clarity); text-decoration:underline; overflow-wrap:anywhere;">$1</a>');

  // Limpiar asteriscos aislados o huérfanos que hayan quedado al inicio o fin
  escaped = escaped.replace(new RegExp("^\\*+|\\*+$", "g"), "");

  return escaped.trim();
}

/* Contenido a nivel de bloque -> párrafos y listas semánticas.
   Soporta sublistas por sangría (2 espacios = 1 nivel). */
export function renderRichContent(text) {
  if (text === null || text === undefined) return "";
  var raw = String(text).replace(/\r\n?/g, "\n");
  var lines = raw.split("\n");
  var out = [];
  var stack = []; // { tag: "ol" | "ul", level: number, openLi: boolean }

  function closeFrame(frame) {
    if (frame.openLi) { out.push("</li>"); frame.openLi = false; }
    out.push("</" + frame.tag + ">");
  }

  function closeAllLists() {
    while (stack.length) closeFrame(stack.pop());
  }

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var trimmed = line.trim();

    // Línea en blanco: separador de bloques, cierra listas abiertas
    if (!trimmed) {
      closeAllLists();
      continue;
    }

    var indentRaw = (line.match(/^[ \t]*/) || [""])[0].replace(/\t/g, "    ");
    var level = Math.floor(indentRaw.length / 2);

    var olMatch = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
    var ulMatch = !olMatch ? trimmed.match(/^[-*•]\s+(.+)$/) : null;

    if (olMatch || ulMatch) {
      var tag = olMatch ? "ol" : "ul";
      var content = olMatch ? olMatch[2] : ulMatch[1];

      // Cierra listas de nivel más profundo o de tipo distinto en el mismo nivel
      while (stack.length) {
        var t = stack[stack.length - 1];
        if (t.level > level || (t.level === level && t.tag !== tag)) {
          closeFrame(stack.pop());
          continue;
        }
        break;
      }

      var top = stack[stack.length - 1];
      if (!top || top.level < level) {
        // Sublista: se abre dentro del <li> padre, que permanece abierto
        out.push("<" + tag + ' class="rich-list">');
        top = { tag: tag, level: level, openLi: false };
        stack.push(top);
      } else if (top.openLi) {
        // Mismo nivel: cierra el <li> hermano anterior
        out.push("</li>");
        top.openLi = false;
      }
      out.push("<li>" + formatInlineMarkdown(content));
      top.openLi = true;
    } else {
      // Párrafo: cierra cualquier lista activa antes de abrirlo
      closeAllLists();
      out.push("<p>" + formatInlineMarkdown(trimmed) + "</p>");
    }
  }

  closeAllLists();
  return out.join("");
}
