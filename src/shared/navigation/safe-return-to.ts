/** Caracteres de control C0, DEL o la barra invertida: el navegador los normaliza o los ignora al navegar. */
function hasUnsafeChar(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 0x20 || code === 0x7f || char === "\\") return true;
  }
  return false;
}

/**
 * Valida un destino de vuelta (`?returnTo=`) y lo reduce a una ruta de NUESTRO origen
 * (`pathname + search + hash`), o `null` si podría salir de él.
 *
 * Comprobar solo `startsWith("/") && !startsWith("//")` no basta: `/\evil.com` o `/\t/evil.com`
 * pasan ese filtro y el navegador los normaliza a `//evil.com` (open redirect). Por eso se
 * rechazan la barra invertida y los caracteres de control, y la ruta se resuelve con `URL`
 * contra el origen exigiendo que no cambie.
 */
export function safeReturnTo(raw: string, origin: string): string | null {
  if (!raw.startsWith("/") || raw.startsWith("//") || hasUnsafeChar(raw)) return null;

  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  return url.pathname + url.search + url.hash;
}
