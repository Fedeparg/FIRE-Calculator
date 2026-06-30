/**
 * URL canónica del sitio, fuente única para SEO (metadataBase, canonical,
 * hreflang), sitemap, robots e imágenes Open Graph.
 *
 * Se lee de `NEXT_PUBLIC_SITE_URL` (ver `.env.example`). En desarrollo, si no
 * está definida, cae a `http://localhost:3000` para que las URLs absolutas
 * funcionen en local sin configurar nada. En producción la variable es
 * obligatoria; un valor mal formado se ignora y se usa el fallback.
 */
const DEV_FALLBACK = "http://localhost:3000";

function normalize(raw: string | undefined): string {
  if (!raw) return DEV_FALLBACK;
  try {
    // `new URL` valida y, al serializar, elimina barras finales sobrantes.
    return new URL(raw).origin;
  } catch {
    return DEV_FALLBACK;
  }
}

/** Origen del sitio sin barra final, p. ej. `https://sextante.fpardo.net`. */
export const SITE_URL = normalize(process.env.NEXT_PUBLIC_SITE_URL);

/** Nombre de marca, reutilizado en plantillas de título y datos estructurados. */
export const SITE_NAME = "Sextante";

/**
 * Construye una URL absoluta a partir de una ruta relativa (con barra inicial).
 * Útil para datos estructurados y para `og`, donde Next no resuelve relativas.
 */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}
