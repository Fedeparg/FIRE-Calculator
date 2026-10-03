/** Esquemas que puede llevar un enlace del contenido: web y correo. */
const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/** Base ficticia para resolver rutas relativas y anclas, que así cuentan como `https:`. */
const RELATIVE_BASE = "https://relative.invalid/";

/**
 * ¿Es seguro publicar este `href` de un enlace del Markdown? Solo `http(s):`, `mailto:`, rutas
 * relativas y anclas. Se decide con el parser de `URL`, el mismo algoritmo que aplica el
 * navegador: ignora espacios y caracteres de control al principio, tabuladores y saltos de línea
 * dentro, y las mayúsculas del esquema, así que `" JaVa\tScript:…"` se reconoce como
 * `javascript:` y se descarta. El contenido es de confianza, pero con `script-src
 * 'unsafe-inline'` un `javascript:` se ejecutaría en nuestro origen.
 */
export function isSafeHref(href: string): boolean {
  try {
    return SAFE_PROTOCOLS.has(new URL(href, RELATIVE_BASE).protocol);
  } catch {
    return false;
  }
}
