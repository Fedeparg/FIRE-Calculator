import type { Metadata } from "next";

import { asLocale, DEFAULT_LOCALE, LOCALES, type Locale } from "@/i18n/types";
import { SITE_NAME } from "./site";

/**
 * Helpers de metadata SEO, fuente única para canonical, hreflang y Open Graph.
 * Reutilizado por todas las páginas (regla "reciclable por defecto").
 *
 * Las URLs se devuelven SIEMPRE relativas: `metadataBase` (definida en el layout
 * raíz) las resuelve a absolutas. Así evitamos construir strings de dominio a
 * mano y los errores de doble barra / doble prefijo de idioma.
 */

/**
 * Ruta pública de una página para un idioma, respetando `localePrefix: as-needed`
 * (el idioma por defecto sin prefijo, el resto con `/<locale>`). `path` debe empezar por `/` y no incluir el
 * prefijo de idioma; usa `/` para la home.
 */
export function localizedPath(locale: Locale, path: string): string {
  const clean = path === "/" ? "" : path;
  return locale === DEFAULT_LOCALE ? clean || "/" : `/${locale}${clean}`;
}

/** Mapa hreflang completo (es, en y x-default → es) para `alternates.languages`. */
function languageAlternates(path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of LOCALES) {
    languages[locale] = localizedPath(locale, path);
  }
  // x-default apunta al idioma por defecto (castellano): es la versión que se
  // sirve cuando el navegador no coincide con ningún idioma declarado.
  languages["x-default"] = localizedPath(DEFAULT_LOCALE, path);
  return languages;
}

/** Metadata de una página privada (cartera, cuenta, importación): su título y nada que indexar ni seguir. */
export function privateMetadata(title: string): Metadata {
  return { title, robots: { index: false, follow: false } };
}

/** Construye la ruta relativa a la imagen Open Graph generada en `/og`. */
function ogImagePath(title: string, locale: Locale, subtitle?: string): string {
  const params = new URLSearchParams({ title, locale });
  if (subtitle) params.set("subtitle", subtitle);
  return `/og?${params.toString()}`;
}

export interface BuildMetadataOptions {
  /** Idioma de la página; se normaliza a `Locale` (cae a `es` si no es válido). */
  locale: string;
  /** Ruta sin prefijo de idioma, empezando por `/` (`/` para la home). */
  path: string;
  title: string;
  description: string;
  /**
   * Si el título ya contiene la marca (p. ej. la home), evita que la plantilla
   * `%s | Sextante` la duplique. El OG sigue usando el título tal cual.
   */
  titleAbsolute?: boolean;
  /** Subtítulo opcional para la imagen OG (p. ej. la categoría). */
  ogSubtitle?: string;
  /** `website` (por defecto) o `article` para contenido de la wiki. */
  ogType?: "website" | "article";
  /** Excluye la página de los índices (login, callbacks, gracias…). */
  noindex?: boolean;
}

/**
 * Metadata canónica para una página: canonical + hreflang + Open Graph + Twitter.
 * Cada `generateMetadata` la fusiona con su `title`/`description` ya traducidos.
 */
export function buildMetadata(options: BuildMetadataOptions): Metadata {
  const { path, title, description, titleAbsolute, ogSubtitle, ogType = "website", noindex } = options;
  const locale = asLocale(options.locale);
  const canonical = localizedPath(locale, path);
  const image = ogImagePath(title, locale, ogSubtitle);

  return {
    title: titleAbsolute ? { absolute: title } : title,
    description,
    alternates: {
      canonical,
      languages: languageAlternates(path),
    },
    openGraph: {
      type: ogType,
      title,
      description,
      url: canonical,
      siteName: SITE_NAME,
      locale: locale === "es" ? "es_ES" : "en_US",
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  };
}
