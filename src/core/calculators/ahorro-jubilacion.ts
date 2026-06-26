// Ahorro para la jubilación. Reutiliza el motor genérico de proyección y estima
// la renta mensual con la regla del 4 %. Core puro.
//
// A diferencia de FIRE (que razona en términos REALES), aquí la rentabilidad es
// NOMINAL y la inflación se modela aparte: así mostramos el patrimonio nominal y
// su poder adquisitivo en euros de hoy (`finalRealValue` del motor). La renta
// mensual estimada se calcula sobre el valor REAL para no engañar con euros
// futuros inflados.

import { project, type ProjectionResult } from "../projection";

export interface RetirementInput {
  /** Edad actual. */
  currentAge: number;
  /** Edad a la que quieres jubilarte. */
  retirementAge: number;
  /** Patrimonio invertido actual. */
  currentSavings: number;
  /** Aportación mensual hasta la jubilación. */
  monthlySavings: number;
  /** Rentabilidad anual NOMINAL esperada, en base 100 (6 = 6 %). */
  annualReturn: number;
  /** Inflación media anual estimada, en base 100 (2,5 = 2,5 %). Opcional. */
  inflationRate?: number;
  /** Comisión/gastos anuales del producto (TER), en base 100. Opcional. */
  annualFee?: number;
  /** Crecimiento anual de la aportación, en base 100 (subirla con el sueldo). Opcional. */
  contributionGrowth?: number;
}

export interface RetirementResult extends ProjectionResult {
  /** Años que faltan hasta la jubilación. */
  yearsToRetirement: number;
  /** Renta mensual estimada con la regla del 4 %, en euros de HOY (poder real). */
  monthlyIncome: number;
  /** Renta mensual estimada con la regla del 4 %, en euros NOMINALES del futuro. */
  monthlyIncomeNominal: number;
}

export function computeRetirement(input: RetirementInput): RetirementResult {
  const yearsToRetirement = Math.max(
    0,
    Math.round((input.retirementAge || 0) - (input.currentAge || 0)),
  );

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

  // Regla del 4 %: renta anual segura = 4 % del patrimonio → /12 para la mensual.
  // En euros de hoy (real) y en euros nominales del futuro.
  const monthlyIncome = (projection.finalRealValue * 0.04) / 12;
  const monthlyIncomeNominal = (projection.finalValue * 0.04) / 12;

  return { ...projection, yearsToRetirement, monthlyIncome, monthlyIncomeNominal };
}
