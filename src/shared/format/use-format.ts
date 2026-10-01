import { useLocale } from "next-intl";

import { getFormatters, type Formatters } from "@/shared/format/format";
import { asLocale } from "@/i18n/types";

/** Formateadores ligados al idioma activo; funciona en Client y Server Components. */
export function useFormat(): Formatters {
  return getFormatters(asLocale(useLocale()));
}
