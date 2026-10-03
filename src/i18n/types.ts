// Shared domain types. No framework dependencies (pure core).

export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "es";

/** Narrows a string to `Locale`, falling back to the default locale if it is not valid. */
export function asLocale(value: string): Locale {
  return (LOCALES as readonly string[]).includes(value) ? (value as Locale) : DEFAULT_LOCALE;
}

/** A string translated into the supported locales. */
export type Localized = Record<Locale, string>;
