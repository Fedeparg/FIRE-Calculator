import { DEFAULT_LOCALE, LOCALES, type Locale } from "../core/types";

/**
 * Enlace interno del contenido (wiki, legal) adaptado al idioma de la página. Los Markdown
 * enlazan siempre con la ruta sin prefijo (`/aprende/regla-del-4`), que es la del español
 * (prefijo `as-needed`); en inglés hay que añadir `/en` o el lector salta de idioma al
 * pulsar. Core puro, testeable.
 *
 * Solo toca rutas absolutas del propio sitio (`/…`). Deja intactos los enlaces externos, los
 * de protocolo (`mailto:`), los anclas (`#…`), las rutas de red (`//host`) y las que ya
 * llevan un prefijo de idioma.
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
