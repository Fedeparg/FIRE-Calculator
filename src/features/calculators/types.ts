// Tipos del catálogo de calculadoras. Sin dependencias de framework (core puro).

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
  /** Identificador y, si está activa, ruta bajo /calculadoras/<slug>. */
  slug: string;
  category: CategoryId;
  /** Palabras clave (es+en) para el buscador del selector. El nombre y la descripción están en i18n. */
  keywords: readonly string[];
}
