// Canonical URL (NEXT_PUBLIC_SITE_URL): single source for SEO, sitemap, robots and OG.
// Required in production; a malformed value falls back to the development default.
const DEV_FALLBACK = "http://localhost:3000";

function normalize(raw: string | undefined): string {
  if (!raw) return DEV_FALLBACK;
  try {
    // `new URL` validates and, when serializing, strips extra trailing slashes.
    return new URL(raw).origin;
  } catch {
    return DEV_FALLBACK;
  }
}

export const SITE_URL = normalize(process.env.NEXT_PUBLIC_SITE_URL);

export const SITE_NAME = "Sextante";

/** Absolute URL for structured data and `og`, where Next does not resolve relative ones. */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}
