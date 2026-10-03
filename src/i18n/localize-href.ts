import { DEFAULT_LOCALE, LOCALES, type Locale } from "./types";

/**
 * Markdown links carry no prefix (Spanish's, under `as-needed`); in English `/en` must be
 * added or the reader switches locale. Only touches internal paths without a locale prefix.
 */
export function localizeHref(href: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) return href;
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const alreadyPrefixed = LOCALES.some(
    (l) => href === `/${l}` || href.startsWith(`/${l}/`) || href.startsWith(`/${l}?`) || href.startsWith(`/${l}#`),
  );
  if (alreadyPrefixed) return href;
  return href === "/" ? `/${locale}` : `/${locale}${href}`;
}
