// Familias de calculadoras. Fuente única de los ids: la web les pone etiqueta localizada
// (`Record<CalculatorCategory, Localized>`, así que un id que falte o sobre no compila) y el
// servidor MCP los usa como filtro de `list_calculators`.

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
