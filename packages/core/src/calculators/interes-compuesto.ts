// Interés compuesto con aportaciones periódicas. Delega en el motor genérico
// `project` (ver core/projection.ts) para no duplicar la lógica de cálculo.

import { project, type Frequency, type ProjectionPoint, type ProjectionResult } from "../projection.js";

export interface CompoundInput {
  /** Capital inicial. */
  initial: number;
  /** Importe de cada aportación. */
  contribution: number;
  /** Frecuencia de las aportaciones (por defecto mensual). */
  frequency?: Frequency;
  /** Rentabilidad anual esperada, en base 100 (7 = 7 %). */
  annualRate: number;
  /** Horizonte en años. */
  years: number;
  /** Comisión anual del producto (TER), en base 100. Opcional. */
  annualFee?: number;
  /** Crecimiento anual de la aportación, en base 100. Opcional. */
  contributionGrowth?: number;
  /** Inflación anual estimada, en base 100 (para el valor real). Opcional. */
  inflationRate?: number;
}

export type CompoundYearPoint = ProjectionPoint;
export type CompoundResult = ProjectionResult;

export function computeCompound(input: CompoundInput): CompoundResult {
  return project({
    initial: input.initial,
    contribution: input.contribution,
    frequency: input.frequency ?? "monthly",
    annualRate: input.annualRate,
    years: input.years,
    annualFee: input.annualFee,
    contributionGrowth: input.contributionGrowth,
    inflationRate: input.inflationRate,
  });
}
