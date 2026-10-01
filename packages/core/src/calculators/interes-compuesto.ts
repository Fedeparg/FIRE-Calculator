// Interés compuesto con aportaciones periódicas; delega en `project`.

import { project, type Frequency, type ProjectionResult } from "../projection.js";

export interface CompoundInput {
  initial: number;
  contribution: number;
  /** Frecuencia de aportación (cuándo se añade dinero). */
  frequency?: Frequency;
  /** Capitalización de intereses (cuándo se abonan y empiezan a rendir); independiente de `frequency`. Por defecto anual. */
  compounding?: Frequency;
  annualRate: number;
  years: number;
  annualFee?: number;
  contributionGrowth?: number;
  inflationRate?: number;
}

export type CompoundResult = ProjectionResult;

export function computeCompound(input: CompoundInput): CompoundResult {
  return project({
    initial: input.initial,
    contribution: input.contribution,
    frequency: input.frequency ?? "monthly",
    compounding: input.compounding,
    annualRate: input.annualRate,
    years: input.years,
    annualFee: input.annualFee,
    contributionGrowth: input.contributionGrowth,
    inflationRate: input.inflationRate,
  });
}
