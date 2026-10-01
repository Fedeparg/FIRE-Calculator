import { DEFAULT_LOCALE, LOCALES, type Locale } from "./types";

/**
 * Los Markdown enlazan sin prefijo (el del español, `as-needed`); en inglés hay que añadir
 * `/en` o el lector cambia de idioma. Solo toca rutas internas sin prefijo de idioma.
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
