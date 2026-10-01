import { useLocale } from "next-intl";

import { getFormatters, type Formatters } from "@/shared/format/format";
import { asLocale } from "@/core/types";

/**
 * Devuelve el juego de formateadores (`formatCurrency`, `formatPercent`, `currencyLabel`…)
 * ligado al idioma activo de la UI. Úsalo en componentes en lugar de importar las funciones
 * de formato directamente, para que los números se muestren con los separadores del idioma
 * (es-ES vs en-GB). `getFormatters` memoiza por locale, así que esto no reconstruye nada.
 *
 * Funciona en Client y Server Components (next-intl expone el locale en ambos).
 */
export function useFormat(): Formatters {
  return getFormatters(asLocale(useLocale()));
}
