import { defineRouting } from "next-intl/routing";

import { DEFAULT_LOCALE, LOCALES } from "./types";

// Los idiomas salen de `types.ts` (sin dependencias de framework, lo importan también los
// módulos puros): una sola lista para el enrutado, el SEO, el robots y el selector.
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  // "/" sirve castellano y "/en" inglés.
  localePrefix: "as-needed",
  // La URL manda: sin detección por cookie/cabecera (evita rebotes al cambiar de idioma).
  localeDetection: false,
});
