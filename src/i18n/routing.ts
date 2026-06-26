import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["es", "en"],
  defaultLocale: "es",
  // El idioma por defecto (es) no lleva prefijo en la URL: "/" sirve castellano,
  // "/en" sirve inglés. App centrada en fiscalidad española.
  localePrefix: "as-needed",
  // La URL manda: sin detección por cookie/cabecera (evita rebotes al cambiar de
  // idioma y mantiene el castellano como idioma por defecto).
  localeDetection: false,
});
