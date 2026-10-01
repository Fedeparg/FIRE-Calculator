// Motor de proyección de inversiones genérico, compartido por varias calculadoras. Core puro.

import { clampYears } from "./inputs.js";

export type Frequency = "weekly" | "monthly" | "quarterly" | "semiannual" | "annual";

export const FREQUENCIES: Frequency[] = ["weekly", "monthly", "quarterly", "semiannual", "annual"];

export const PERIODS_PER_YEAR: Record<Frequency, number> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  semiannual: 2,
  annual: 1,
};

export interface ProjectionInput {
  initial: number;
  contribution: number;
  frequency: Frequency;
  /** Rentabilidad anual nominal, en base 100 (7 = 7 %). */
  annualRate: number;
  years: number;
  /** Comisión/gastos anuales (TER), en base 100; rentabilidad efectiva = annualRate − annualFee. */
  annualFee?: number;
  /** Crecimiento anual de la aportación, en base 100; se aplica al inicio de cada año. */
  contributionGrowth?: number;
  /** Inflación anual, en base 100; si se indica, cada punto lleva `realValue` (poder adquisitivo de hoy). */
  inflationRate?: number;
}

export interface ProjectionPoint {
  // firma de índice: permite usar los puntos como datos de gráfica (Record<string, number>) sin casts
  [key: string]: number;
  year: number;
  contributed: number;
  interest: number;
  value: number;
  realValue: number;
}

export interface ProjectionResult {
  series: ProjectionPoint[];
  finalValue: number;
  totalContributed: number;
  totalInterest: number;
  finalRealValue: number;
}

/**
 * Capitalización por periodo: la aportación va al final de cada periodo y el interés del periodo es
 * annualRate / periodosPorAño (para mensual, i = r/12, la convención estándar).
 */
export function project(input: ProjectionInput): ProjectionResult {
  const initial = Math.max(0, input.initial || 0);
  const years = clampYears(input.years);
  const periodsPerYear = PERIODS_PER_YEAR[input.frequency] ?? 12;
  const netAnnualRate = (input.annualRate || 0) - Math.max(0, input.annualFee || 0);
  const periodRate = netAnnualRate / 100 / periodsPerYear;
  const growth = Math.max(0, input.contributionGrowth || 0) / 100;
  // la inflación se descuenta con la periodicidad del interés: si la rentabilidad neta iguala a la inflación, el valor real queda constante
  const inflationPeriodRate = Math.max(0, input.inflationRate || 0) / 100 / periodsPerYear;

  const series: ProjectionPoint[] = [
    { year: 0, contributed: initial, interest: 0, value: initial, realValue: initial },
  ];

  let value = initial;
  let contributed = initial;
  let contribution = Math.max(0, input.contribution || 0);
  let realDivisor = 1;
  const totalPeriods = years * periodsPerYear;

  for (let period = 1; period <= totalPeriods; period++) {
    value = value * (1 + periodRate) + contribution;
    contributed += contribution;
    realDivisor *= 1 + inflationPeriodRate;

    if (period % periodsPerYear === 0) {
      series.push({
        year: period / periodsPerYear,
        contributed,
        interest: value - contributed,
        value,
        realValue: value / realDivisor,
      });
      contribution *= 1 + growth;
    }
  }

  return {
    series,
    finalValue: value,
    totalContributed: contributed,
    totalInterest: value - contributed,
    finalRealValue: value / realDivisor,
  };
}
