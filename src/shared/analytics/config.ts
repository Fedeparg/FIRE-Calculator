// Umami propio. Script y eventos van por el mismo origen (`/stats/*`, rewrites de
// next.config): el CSP sigue en 'self'. El ID de sitio es público (viaja en el script).

// Única fuente de la ruta: la usan los rewrites de next.config. El `matcher` de proxy.ts tiene
// que ser un literal (Next lo analiza estáticamente), así que lo comprueba un test.
export const ANALYTICS_PATH_PREFIX = "/stats";

// Umami envía los eventos a `<directorio del script>/api/send`.
export const ANALYTICS_SCRIPT_SRC = `${ANALYTICS_PATH_PREFIX}/script.js`;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ID de sitio si es un UUID válido; si no, `null` (evita emitir un script roto). */
export function parseWebsiteId(raw: string | undefined): string | null {
  const value = raw?.trim();
  return value && UUID_PATTERN.test(value) ? value.toLowerCase() : null;
}

export const ANALYTICS_WEBSITE_ID = parseWebsiteId(process.env.NEXT_PUBLIC_ANALYTICS_WEBSITE_ID);
