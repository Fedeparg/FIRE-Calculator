// Motor de proyección de inversiones GENÉRICO y reutilizable.
// Lo comparten varias calculadoras (interés compuesto, FIRE, ...) para no
// duplicar lógica. Soporta distinta frecuencia de aportación. Core puro.

export type Frequency = "weekly" | "monthly" | "quarterly" | "semiannual" | "annual";

export const FREQUENCIES: Frequency[] = [
  "weekly",
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
];

export const PERIODS_PER_YEAR: Record<Frequency, number> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  semiannual: 2,
  annual: 1,
};

export interface ProjectionInput {
  /** Capital inicial. */
  initial: number;
  /** Importe de cada aportación. */
  contribution: number;
  /** Frecuencia de las aportaciones. */
  frequency: Frequency;
  /** Rentabilidad anual nominal, en base 100 (7 = 7 %). */
  annualRate: number;
  /** Horizonte en años. */
  years: number;
  /**
   * Comisión/gastos anuales del producto (TER), en base 100. Reduce la
   * rentabilidad neta: rentabilidad efectiva = annualRate − annualFee. Opcional.
   */
  annualFee?: number;
  /**
   * Crecimiento anual de la aportación, en base 100 (ej. subirla con la
   * inflación o el sueldo). Se aplica al inicio de cada nuevo año. Opcional.
   */
  contributionGrowth?: number;
  /**
   * Inflación anual estimada, en base 100. Si se indica, cada punto incluye el
   * valor en poder adquisitivo de hoy (`realValue`). Opcional.
   */
  inflationRate?: number;
}

export interface ProjectionPoint {
  // Firma de índice numérica: permite consumir los puntos como datos genéricos
  // de gráfica (Record<string, number>) sin castings.
  [key: string]: number;
  year: number;
  /** Total aportado acumulado (capital inicial + aportaciones). */
  contributed: number;
  /** Interés acumulado generado (value - contributed). */
  interest: number;
  /** Valor de la cartera al final del año. */
  value: number;
  /** Valor en poder adquisitivo de hoy (descontada la inflación). */
  realValue: number;
}

export interface ProjectionResult {
  series: ProjectionPoint[];
  finalValue: number;
  totalContributed: number;
  totalInterest: number;
  /** Valor final en poder adquisitivo de hoy (= finalValue si no hay inflación). */
  finalRealValue: number;
}

/**
 * Capitalización por periodo (nominal): la aportación se realiza al final de
 * cada periodo y el interés del periodo es annualRate / periodosPorAño. Para
 * frecuencia mensual coincide con i = r/12 (convención estándar de las
 * calculadoras de interés compuesto).
 */
export function project(input: ProjectionInput): ProjectionResult {
  const initial = Math.max(0, input.initial || 0);
  const years = Math.max(0, Math.round(input.years || 0));
  const periodsPerYear = PERIODS_PER_YEAR[input.frequency] ?? 12;
  // Rentabilidad neta de comisiones (TER).
  const netAnnualRate = (input.annualRate || 0) - Math.max(0, input.annualFee || 0);
  const periodRate = netAnnualRate / 100 / periodsPerYear;
  const growth = Math.max(0, input.contributionGrowth || 0) / 100;
  // La inflación se descuenta con la MISMA periodicidad con la que capitaliza el
  // interés. Así, si la rentabilidad neta iguala a la inflación, el valor real se
  // mantiene exactamente constante (sin ganancias ni pérdidas fantasma por
  // mezclar capitalización mensual con descuento anual).
  const inflationPeriodRate = (Math.max(0, input.inflationRate || 0) / 100) / periodsPerYear;

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
      // La aportación crece al iniciar el siguiente año.
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
