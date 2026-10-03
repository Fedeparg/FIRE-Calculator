// Financial health check: weighted questionnaire → 0-100 score and category. Pure core.

export type HealthCategory = "critical" | "fragile" | "stable" | "strong";

export interface FinancialHealthQuestion {
  id: string;
  /** Weight of the question in the total (weights sum to 1). */
  weight: number;
}

/** Questions and weights (summing to 1); this order sets the UI order. Each answer scores from 0 to 1. */
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

/** Financial health from 0..1 answers per question; missing answers count as 0. */
export function computeFinancialHealth(answers: readonly number[]): FinancialHealthResult {
  let weighted = 0;
  FINANCIAL_HEALTH_QUESTIONS.forEach((q, i) => {
    const value = Math.min(1, Math.max(0, answers[i] ?? 0));
    weighted += value * q.weight;
  });
  const score = Math.round(weighted * 100);
  return { score, category: categoryForScore(score) };
}

/** Score (0..1) per option index (0 = worst); shared by the website and MCP. */
export const FINANCIAL_HEALTH_OPTION_SCORES: readonly number[] = [0, 0.34, 0.67, 1];

export const FINANCIAL_HEALTH_OPTIONS = FINANCIAL_HEALTH_OPTION_SCORES.length;

/** Financial health from the index of the option chosen per question; out-of-range indices score 0. */
export function scoreFinancialHealthOptions(options: readonly number[]): FinancialHealthResult {
  return computeFinancialHealth(options.map((i) => FINANCIAL_HEALTH_OPTION_SCORES[i] ?? 0));
}
