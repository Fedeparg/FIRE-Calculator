// Tipos compartidos del dominio. Sin dependencias de framework (core puro).

export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "es";

/** Estrecha un string al tipo `Locale`, cayendo al idioma por defecto si no es válido. */
export function asLocale(value: string): Locale {
  return (LOCALES as readonly string[]).includes(value) ? (value as Locale) : DEFAULT_LOCALE;
}

/** Cadena traducida a los idiomas soportados. */
export type Localized = Record<Locale, string>;
