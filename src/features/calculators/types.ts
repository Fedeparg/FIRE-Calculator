// Calculator catalog types. No framework dependencies (pure core).

import type { CalculatorCategory } from "@sextante/core/calculators/categories";

import type { Localized } from "@/i18n/types";

export const CATEGORIES: Record<CalculatorCategory, Localized> = {
  inversion: { es: "Inversión e interés compuesto", en: "Investing & compound interest" },
  fire: { es: "FIRE y planificación", en: "FIRE & planning" },
  hipoteca: { es: "Hipoteca y vivienda", en: "Mortgage & housing" },
  ahorro: { es: "Ahorro y depósitos", en: "Savings & deposits" },
  fiscalidad: { es: "Fiscalidad (España)", en: "Taxes (Spain)" },
  deuda: { es: "Deuda", en: "Debt" },
  herramientas: { es: "Herramientas", en: "Tools" },
} as const;

export type CategoryId = CalculatorCategory;

export interface CalculatorMeta {
  /** Identifier and, when active, route under /calculadoras/<slug>. */
  slug: string;
  category: CategoryId;
  /** Keywords (es+en) for the selector's search box. The name and description live in i18n. */
  keywords: readonly string[];
}
