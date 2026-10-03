// Retirement savings on top of the projection engine; monthly income via the 4% rule. Pure core.
// Unlike FIRE, the return is nominal and inflation is handled separately; the income is computed
// on the real value so we do not show inflated future euros.

import { project, type ProjectionResult } from "../projection.js";
import { SAFE_WITHDRAWAL_RATE_PERCENT } from "./fire.js";

export interface RetirementInput {
  currentAge: number;
  retirementAge: number;
  currentSavings: number;
  monthlySavings: number;
  /** Expected nominal annual return, in base 100 (6 = 6%). */
  annualReturn: number;
  inflationRate?: number;
  annualFee?: number;
  contributionGrowth?: number;
}

export interface RetirementResult extends ProjectionResult {
  yearsToRetirement: number;
  /** Monthly income (4% rule) in today's euros. */
  monthlyIncome: number;
  /** Monthly income (4% rule) in nominal future euros. */
  monthlyIncomeNominal: number;
}

export function computeRetirement(input: RetirementInput): RetirementResult {
  const yearsToRetirement = Math.max(0, Math.round((input.retirementAge || 0) - (input.currentAge || 0)));

  const projection: ProjectionResult = project({
    initial: input.currentSavings,
    contribution: input.monthlySavings,
    frequency: "monthly",
    annualRate: input.annualReturn,
    years: yearsToRetirement,
    inflationRate: input.inflationRate,
    annualFee: input.annualFee,
    contributionGrowth: input.contributionGrowth,
  });

  // 4% rule: safe annual income = 4% of net worth.
  const withdrawalRate = SAFE_WITHDRAWAL_RATE_PERCENT / 100;
  const monthlyIncome = (projection.finalRealValue * withdrawalRate) / 12;
  const monthlyIncomeNominal = (projection.finalValue * withdrawalRate) / 12;

  return { ...projection, yearsToRetirement, monthlyIncome, monthlyIncomeNominal };
}
