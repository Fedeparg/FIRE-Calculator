import type { Metadata } from "next";

import { asLocale, CATEGORIES, LOCALES, type Locale } from "@/core/types";
import { CALCULATORS } from "@/features/calculators/registry";
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
 * (es sin prefijo, en con `/en`). `path` debe empezar por `/` y no incluir el
 * prefijo de idioma; usa `/` para la home.
 */
export function localizedPath(locale: Locale, path: string): string {
  const clean = path === "/" ? "" : path;
  return locale === "es" ? clean || "/" : `/en${clean}`;
}

/** Mapa hreflang completo (es, en y x-default → es) para `alternates.languages`. */
function languageAlternates(path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of LOCALES) {
    languages[locale] = localizedPath(locale, path);
  }
  // x-default apunta al idioma por defecto (castellano): es la versión que se
  // sirve cuando el navegador no coincide con ningún idioma declarado.
  languages["x-default"] = localizedPath("es", path);
  return languages;
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

/**
 * Metadata de una página de calculadora. Centraliza la ruta y el subtítulo OG
 * (la categoría, resuelta del registro) para que cada página quede en una línea
 * y mantenga consistencia. `title`/`description` ya vienen traducidos del
 * namespace `calc.<slug>` de la propia página.
 */
export function calculatorMetadata(args: {
  locale: string;
  slug: string;
  title: string;
  description: string;
}): Metadata {
  const { slug, title, description } = args;
  const locale = asLocale(args.locale);
  const calc = CALCULATORS.find((c) => c.slug === slug);
  const ogSubtitle = calc ? CATEGORIES[calc.category][locale] : undefined;
  return buildMetadata({
    locale,
    path: `/calculadoras/${slug}`,
    title,
    description,
    ogSubtitle,
  });
}
