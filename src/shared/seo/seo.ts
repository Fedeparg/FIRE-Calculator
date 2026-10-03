import type { Metadata } from "next";

import { asLocale, DEFAULT_LOCALE, LOCALES, type Locale } from "@/i18n/types";
import { SITE_NAME } from "./site";

/**
 * SEO metadata helpers, the single source for canonical, hreflang and Open Graph. Reused by every
 * page (the "reusable by default" rule).
 *
 * URLs are ALWAYS returned relative: `metadataBase` (set in the root layout) resolves them to
 * absolute. This avoids hand-building domain strings and the double-slash / double-locale-prefix
 * bugs.
 */

/**
 * Public path of a page for a locale, honoring `localePrefix: as-needed` (the default locale
 * unprefixed, the others with `/<locale>`). `path` must start with `/` and must not include the
 * locale prefix; use `/` for the home page.
 */
export function localizedPath(locale: Locale, path: string): string {
  const clean = path === "/" ? "" : path;
  return locale === DEFAULT_LOCALE ? clean || "/" : `/${locale}${clean}`;
}

/** Full hreflang map (es, en and x-default → es) for `alternates.languages`. */
function languageAlternates(path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of LOCALES) {
    languages[locale] = localizedPath(locale, path);
  }
  // x-default points to the default locale (Spanish): the version served when
  // the browser matches none of the declared languages.
  languages["x-default"] = localizedPath(DEFAULT_LOCALE, path);
  return languages;
}

/** Metadata for a private page (portfolio, account, import): its title and nothing to index or follow. */
export function privateMetadata(title: string): Metadata {
  return { title, robots: { index: false, follow: false } };
}

/** Fixed pages with their own Open Graph card (the `/og` route knows where their title comes from). */
export const OG_PAGES = ["home", "learn", "calculators", "changelog", "about"] as const;
export type OgPage = (typeof OG_PAGES)[number];

/**
 * Which Open Graph card a page uses. It is NOT free text: `/og` resolves the title (and
 * subtitle) from the slug, so nobody can generate images with the Sextante brand and arbitrary
 * text, and every image URL is stable and cacheable.
 */
export type OgCard =
  | { kind: "page"; page: OgPage }
  | { kind: "calculator"; slug: string }
  | { kind: "article"; slug: string }
  | { kind: "legal"; slug: string };

/** Name of the `/og` parameter for each card type. */
export const OG_CARD_PARAM = { page: "page", calculator: "calc", article: "article", legal: "legal" } as const;

/** Builds the relative path to the Open Graph image generated at `/og`. */
export function ogImagePath(card: OgCard, locale: Locale): string {
  const value = card.kind === "page" ? card.page : card.slug;
  const params = new URLSearchParams({ [OG_CARD_PARAM[card.kind]]: value, locale });
  return `/og?${params.toString()}`;
}

export interface BuildMetadataOptions {
  /** Page locale; normalized to `Locale` (falls back to `es` if invalid). */
  locale: string;
  /** Path without the locale prefix, starting with `/` (`/` for the home page). */
  path: string;
  title: string;
  description: string;
  /**
   * If the title already contains the brand (e.g. the home page), keeps the `%s | Sextante`
   * template from duplicating it. OG still uses the title as is.
   */
  titleAbsolute?: boolean;
  /** The page's Open Graph card (see `OgCard`). */
  og: OgCard;
  /** `website` (default) or `article` for wiki content. */
  ogType?: "website" | "article";
  /** Excludes the page from indexes (login, callbacks, thank-you pages…). */
  noindex?: boolean;
}

/**
 * Canonical metadata for a page: canonical + hreflang + Open Graph + Twitter. Each
 * `generateMetadata` merges it with its already translated `title`/`description`.
 */
export function buildMetadata(options: BuildMetadataOptions): Metadata {
  const { path, title, description, titleAbsolute, og, ogType = "website", noindex } = options;
  const locale = asLocale(options.locale);
  const canonical = localizedPath(locale, path);
  const image = ogImagePath(og, locale);

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
