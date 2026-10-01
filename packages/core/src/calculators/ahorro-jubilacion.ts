// Ahorro para la jubilación sobre el motor de proyección; renta mensual con la regla del 4 %. Core puro.
// A diferencia de FIRE, la rentabilidad es nominal y la inflación va aparte; la renta se calcula
// sobre el valor real para no mostrar euros futuros inflados.

import { project, type ProjectionResult } from "../projection.js";

export interface RetirementInput {
  currentAge: number;
  retirementAge: number;
  currentSavings: number;
  monthlySavings: number;
  /** Rentabilidad anual nominal esperada, en base 100 (6 = 6 %). */
  annualReturn: number;
  inflationRate?: number;
  annualFee?: number;
  contributionGrowth?: number;
}

export interface RetirementResult extends ProjectionResult {
  yearsToRetirement: number;
  /** Renta mensual (regla del 4 %) en euros de hoy. */
  monthlyIncome: number;
  /** Renta mensual (regla del 4 %) en euros nominales del futuro. */
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

  // Regla del 4 %: renta anual segura = 4 % del patrimonio.
  const monthlyIncome = (projection.finalRealValue * 0.04) / 12;
  const monthlyIncomeNominal = (projection.finalValue * 0.04) / 12;

  return { ...projection, yearsToRetirement, monthlyIncome, monthlyIncomeNominal };
}
