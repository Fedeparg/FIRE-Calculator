// Test de salud financiera: cuestionario ponderado que resume el estado de tus
// finanzas en una puntuación de 0 a 100 y una categoría. Core puro (los textos
// de preguntas y respuestas viven en las traducciones; aquí solo el modelo).

/** Categorías del resultado, de peor a mejor. */
export type HealthCategory = "critical" | "fragile" | "stable" | "strong";

export interface FinancialHealthQuestion {
  /** Identificador estable de la pregunta. */
  id: string;
  /** Peso de la pregunta sobre el total (los pesos suman 1). */
  weight: number;
}

/**
 * Definición de las preguntas y su peso. El orden fija el de la UI. Cada
 * respuesta puntúa de 0 a 1; la puntuación final es la media ponderada × 100.
 */
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
  /** Puntuación de 0 a 100. */
  score: number;
  /** Categoría asociada a la puntuación. */
  category: HealthCategory;
}

/** Umbrales de categoría (límite inferior incluido). */
export function categoryForScore(score: number): HealthCategory {
  if (score >= 80) return "strong";
  if (score >= 60) return "stable";
  if (score >= 35) return "fragile";
  return "critical";
}

/**
 * Calcula la salud financiera a partir de las respuestas (valor 0..1 por
 * pregunta, en el mismo orden que `FINANCIAL_HEALTH_QUESTIONS`). Las respuestas
 * que falten cuentan como 0.
 */
export function computeFinancialHealth(answers: readonly number[]): FinancialHealthResult {
  let weighted = 0;
  FINANCIAL_HEALTH_QUESTIONS.forEach((q, i) => {
    const value = Math.min(1, Math.max(0, answers[i] ?? 0));
    weighted += value * q.weight;
  });
  const score = Math.round(weighted * 100);
  return { score, category: categoryForScore(score) };
}

/**
 * Puntuación (0..1) de cada opción de respuesta, por índice: la opción 0 es la peor y la
 * última, la mejor. La comparten la web y el MCP para que las dos puntúen igual.
 */
export const FINANCIAL_HEALTH_OPTION_SCORES: readonly number[] = [0, 0.34, 0.67, 1];

/** Número de opciones de respuesta de cada pregunta. */
export const FINANCIAL_HEALTH_OPTIONS = FINANCIAL_HEALTH_OPTION_SCORES.length;

/**
 * Calcula la salud financiera a partir del ÍNDICE de la opción elegida en cada pregunta (en el
 * orden de `FINANCIAL_HEALTH_QUESTIONS`). Un índice fuera de rango puntúa 0.
 */
export function scoreFinancialHealthOptions(options: readonly number[]): FinancialHealthResult {
  return computeFinancialHealth(options.map((i) => FINANCIAL_HEALTH_OPTION_SCORES[i] ?? 0));
}
