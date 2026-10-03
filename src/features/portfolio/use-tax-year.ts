"use client";

import { useState } from "react";
import { firstItem } from "@sextante/core/arrays";

import { defaultTaxYear } from "@/features/portfolio/model/tax-year";

/**
 * Tax year selected in the tax report. Opens on `defaultTaxYear`; if the selected one drops out
 * of the list (data refreshes after saving), the most recent one is used instead of pointing at a
 * year that no longer exists. `years` is never empty (see `taxYears`).
 */
export function useTaxYear(years: readonly number[], currentYear: number) {
  const [selected, setSelected] = useState(() => defaultTaxYear(years, currentYear));
  const year = years.includes(selected) ? selected : firstItem(years);
  return [year, setSelected] as const;
}
