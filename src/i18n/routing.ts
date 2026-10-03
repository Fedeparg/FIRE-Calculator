import { defineRouting } from "next-intl/routing";

import { DEFAULT_LOCALE, LOCALES } from "./types";

// Locales come from `types.ts` (framework-free, so pure modules import it too): a single
// list for routing, SEO, robots and the language switcher.
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  // "/" serves Spanish and "/en" English.
  localePrefix: "as-needed",
  // The URL wins: no cookie/header detection (avoids bounces when switching locale).
  localeDetection: false,
});
