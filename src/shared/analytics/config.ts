/**
 * Analítica propia (Umami, alojado junto al resto del stack). Todo lo de aquí es
 * PÚBLICO por diseño: el ID de sitio de Umami viaja igualmente al navegador en el
 * atributo del script, así que no es un secreto.
 *
 * El script y el envío de eventos pasan por el mismo origen (`/stats/*`, ver los
 * rewrites de next.config): el CSP sigue siendo estrictamente 'self' y el navegador
 * nunca habla con un tercero.
 */

/** Ruta pública bajo la que Next proxea Umami. Debe coincidir con next.config y proxy.ts. */
export const ANALYTICS_PATH_PREFIX = "/stats";

/** URL del script del tracker. Umami envía los eventos a `<directorio del script>/api/send`. */
export const ANALYTICS_SCRIPT_SRC = `${ANALYTICS_PATH_PREFIX}/script.js`;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Devuelve el ID de sitio si es un UUID válido; si no, `null` (analítica apagada).
 * Validarlo evita emitir un script roto cuando la variable está vacía o mal copiada.
 */
export function parseWebsiteId(raw: string | undefined): string | null {
  const value = raw?.trim();
  return value && UUID_PATTERN.test(value) ? value.toLowerCase() : null;
}

/** ID de sitio de Umami, inlineado en build (NEXT_PUBLIC_). `null` = sin analítica. */
export const ANALYTICS_WEBSITE_ID = parseWebsiteId(process.env.NEXT_PUBLIC_ANALYTICS_WEBSITE_ID);
