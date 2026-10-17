/* =============================================================================
   syntax.js — resaltado de sintaxis ligero para TypeScript / JavaScript.
   Extraído de Menthor Studio (src/server.ts, template del dashboard).
   Sin dependencias: módulo hoja.
   ============================================================================= */

export function highlightSyntax(code) {
  if (!code) return "";
  let safe = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Un único paso con alternancia: así las coincidencias posteriores no
  // vuelven a caer dentro del HTML que acabamos de insertar (los atributos
  // class="syn-*" contienen comillas y la palabra "class", que antes se
  // re-resaltaban y corrompían por completo el bloque de código).
  safe = safe.replace(
    /(\/\/\s*\d+\..*$)|(\/\/.*$)|("[^"\n]*"|'[^'\n]*'|`[^`\n]*`)|(\b(?:interface|export|import|from|const|let|readonly|async|await|return|function|class|type|new)\b)|(\b(?:string|number|boolean|Promise|void|any|null|undefined)\b)/gm,
    function (match, numComment, comment, str, keyword, type) {
      if (numComment) return '<span class="syn-comment" style="color:#60a5fa; font-weight:600;">' + numComment + '</span>';
      if (comment) return '<span class="syn-comment">' + comment + '</span>';
      if (str) return '<span class="syn-string">' + str + '</span>';
      if (keyword) return '<span class="syn-keyword">' + keyword + '</span>';
      if (type) return '<span class="syn-type">' + type + '</span>';
      return match;
    }
  );

  return safe;
}
