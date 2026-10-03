// Calculator families. Single source of truth for the ids: the website gives them localized labels
// (`Record<CalculatorCategory, Localized>`, so a missing or extra id does not compile) and the MCP
// server uses them as the `list_calculators` filter.

export const CALCULATOR_CATEGORIES = [
  "inversion",
  "fire",
  "hipoteca",
  "ahorro",
  "fiscalidad",
  "deuda",
  "herramientas",
] as const;

export type CalculatorCategory = (typeof CALCULATOR_CATEGORIES)[number];
