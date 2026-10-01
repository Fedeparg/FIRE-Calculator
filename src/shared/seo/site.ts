// URL canónica (NEXT_PUBLIC_SITE_URL): fuente única de SEO, sitemap, robots y OG.
// Obligatoria en producción; un valor mal formado cae al fallback de desarrollo.
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

export const SITE_URL = normalize(process.env.NEXT_PUBLIC_SITE_URL);

export const SITE_NAME = "Sextante";

/** URL absoluta para datos estructurados y `og`, donde Next no resuelve relativas. */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}
