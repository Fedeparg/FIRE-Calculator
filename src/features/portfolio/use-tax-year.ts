"use client";

import { useState } from "react";

import { firstItem } from "@sextante/core/arrays";

import { defaultTaxYear } from "@/features/portfolio/model/tax-year";

/**
 * Ejercicio elegido en el informe fiscal. Abre en `defaultTaxYear`; si el elegido deja de estar
 * en la lista (los datos se refrescan tras guardar), se usa el más reciente en vez de quedarse
 * apuntando a un ejercicio que ya no existe. `years` nunca está vacía (ver `taxYears`).
 */
export function useTaxYear(years: readonly number[], currentYear: number) {
  const [selected, setSelected] = useState(() => defaultTaxYear(years, currentYear));
  const year = years.includes(selected) ? selected : firstItem(years);
  return [year, setSelected] as const;
}
