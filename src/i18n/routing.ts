import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["es", "en"],
  defaultLocale: "es",
  // "/" sirve castellano y "/en" inglés.
  localePrefix: "as-needed",
  // La URL manda: sin detección por cookie/cabecera (evita rebotes al cambiar de idioma).
  localeDetection: false,
});
