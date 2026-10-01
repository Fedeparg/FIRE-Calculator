// Test de salud financiera: cuestionario ponderado → puntuación 0-100 y categoría. Core puro.

export type HealthCategory = "critical" | "fragile" | "stable" | "strong";

export interface FinancialHealthQuestion {
  id: string;
  /** Peso de la pregunta sobre el total (los pesos suman 1). */
  weight: number;
}

/** Preguntas y pesos (suman 1); el orden fija el de la UI. Cada respuesta puntúa de 0 a 1. */
export const FINANCIAL_HEALTH_QUESTIONS: readonly FinancialHealthQuestion[] = [
  { id: "emergencyFund", weight: 0.22 },
  { id: "savingsRate", weight: 0.18 },
  { id: "debt", weight: 0.18 },
  { id: "housingCost", weight: 0.12 },
  { id: "investing", weight: 0.1 },
  { id: "retirement", weight: 0.08 },
  { id: "protection", weight: 0.06 },
  { id: "tracking", weight: 0.06 },
];

export interface FinancialHealthResult {
  score: number;
  category: HealthCategory;
}

export function categoryForScore(score: number): HealthCategory {
  if (score >= 80) return "strong";
  if (score >= 60) return "stable";
  if (score >= 35) return "fragile";
  return "critical";
}

/** Salud financiera a partir de respuestas 0..1 por pregunta; las que falten cuentan 0. */
export function computeFinancialHealth(answers: readonly number[]): FinancialHealthResult {
  let weighted = 0;
  FINANCIAL_HEALTH_QUESTIONS.forEach((q, i) => {
    const value = Math.min(1, Math.max(0, answers[i] ?? 0));
    weighted += value * q.weight;
  });
  const score = Math.round(weighted * 100);
  return { score, category: categoryForScore(score) };
}

/** Puntuación (0..1) por índice de opción (0 = peor); compartida por la web y el MCP. */
export const FINANCIAL_HEALTH_OPTION_SCORES: readonly number[] = [0, 0.34, 0.67, 1];

export const FINANCIAL_HEALTH_OPTIONS = FINANCIAL_HEALTH_OPTION_SCORES.length;

/** Salud financiera a partir del índice de la opción elegida por pregunta; fuera de rango puntúa 0. */
export function scoreFinancialHealthOptions(options: readonly number[]): FinancialHealthResult {
  return computeFinancialHealth(options.map((i) => FINANCIAL_HEALTH_OPTION_SCORES[i] ?? 0));
}
