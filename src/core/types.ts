// Tipos compartidos del dominio. Sin dependencias de framework (core puro).

export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "es";

/** Cadena traducida a los idiomas soportados. */
export type Localized = Record<Locale, string>;

export const CATEGORIES: Record<string, Localized> = {
  inversion: { es: "Inversión e interés compuesto", en: "Investing & compound interest" },
  fire: { es: "FIRE y planificación", en: "FIRE & planning" },
  hipoteca: { es: "Hipoteca y vivienda", en: "Mortgage & housing" },
  ahorro: { es: "Ahorro y depósitos", en: "Savings & deposits" },
  fiscalidad: { es: "Fiscalidad (España)", en: "Taxes (Spain)" },
  deuda: { es: "Deuda", en: "Debt" },
  herramientas: { es: "Herramientas", en: "Tools" },
} as const;

export type CategoryId = keyof typeof CATEGORIES;

export interface CalculatorMeta {
  /** Identificador y, si está activa, ruta bajo /calculadoras/<slug>. */
  slug: string;
  name: Localized;
  category: CategoryId;
  description: Localized;
  /** Palabras clave (es+en) para el buscador del selector. */
  keywords: string[];
  /** "live" = implementada y navegable; "soon" = próximamente. */
  status: "live" | "soon";
}
