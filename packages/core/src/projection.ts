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

/** Frecuencias con sentido para capitalizar intereses (la semanal solo se usa para aportar). */
export const COMPOUNDING_FREQUENCIES: Frequency[] = FREQUENCIES.filter((f) => f !== "weekly");

export interface ProjectionInput {
  initial: number;
  contribution: number;
  frequency: Frequency;
  /**
   * Rentabilidad anual, en base 100 (7 = 7 %). Es la tasa nominal (TIN) del periodo de capitalización
   * `compounding`; con el valor por defecto (anual) coincide con la rentabilidad anual efectiva.
   */
  annualRate: number;
  /**
   * Cada cuánto se abonan y capitalizan los intereses; independiente de `frequency` (cuándo se
   * aporta). Por defecto "annual": la tasa se lee como rentabilidad anual y no hay capitalización
   * intra-anual (proyecciones de mercado: FIRE, jubilación, objetivo…).
   */
  compounding?: Frequency;
  years: number;
  /** Comisión/gastos anuales (TER), en base 100; rentabilidad neta = annualRate − annualFee. */
  annualFee?: number;
  /** Crecimiento anual de la aportación, en base 100; se aplica al inicio de cada año. */
  contributionGrowth?: number;
  /** Inflación anual efectiva, en base 100; si se indica, cada punto lleva `realValue` (poder adquisitivo de hoy). */
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
 * Tasa por periodo equivalente a una tasa anual efectiva: (1 + r)^(1/n) − 1. Con r ≤ −100 % el valor
 * se anula en un año (periodo −100 %) en lugar de dar NaN, como pide la política de `inputs.ts`.
 */
export function periodRateFromEffective(effectiveAnnualPercent: number, periodsPerYear: number): number {
  return Math.pow(Math.max(0, 1 + effectiveAnnualPercent / 100), 1 / periodsPerYear) - 1;
}

/** Tasa anual efectiva (base 100) de una tasa nominal que capitaliza `compoundingPeriods` veces al año. */
function effectiveFromNominal(nominalPercent: number, compoundingPeriods: number): number {
  return (Math.pow(Math.max(0, 1 + nominalPercent / 100 / compoundingPeriods), compoundingPeriods) - 1) * 100;
}

/**
 * Dos frecuencias independientes: `compounding` decide cuánto rinde el dinero (cada cuánto se
 * capitalizan los intereses) y `frequency` solo cuándo se aporta (al final de cada periodo). Con
 * aportación 0 el resultado depende de `compounding` pero NO de `frequency`: antes la capitalización
 * iba atada a la frecuencia de aportación, y 10.000 € al 7 % daban 10.722,90 € con aportación
 * mensual y 10.700 € con anual. La tasa nominal con `compounding` se convierte en su tasa anual
 * efectiva y de ella se deriva la tasa de cada periodo de aportación, (1 + ef)^(1/n) − 1.
 * La inflación es siempre anual efectiva.
 */
export function project(input: ProjectionInput): ProjectionResult {
  const initial = Math.max(0, input.initial || 0);
  const years = clampYears(input.years);
  const periodsPerYear = PERIODS_PER_YEAR[input.frequency] ?? 12;
  const compoundingPeriods = PERIODS_PER_YEAR[input.compounding ?? "annual"] ?? 1;
  const netAnnualRate = (input.annualRate || 0) - Math.max(0, input.annualFee || 0);
  const periodRate = periodRateFromEffective(effectiveFromNominal(netAnnualRate, compoundingPeriods), periodsPerYear);
  const growth = Math.max(0, input.contributionGrowth || 0) / 100;
  // la inflación se compone igual que la rentabilidad: si la rentabilidad neta iguala a la inflación, el valor real queda constante
  const inflationPeriodRate = periodRateFromEffective(Math.max(0, input.inflationRate || 0), periodsPerYear);

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
