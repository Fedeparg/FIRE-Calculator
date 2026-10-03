import { useLocale } from "next-intl";

import { getFormatters, type Formatters } from "@/shared/format/format";
import { asLocale } from "@/i18n/types";

/** Formatters bound to the active locale; works in both Client and Server Components. */
export function useFormat(): Formatters {
  return getFormatters(asLocale(useLocale()));
}
