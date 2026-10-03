// Compound interest with periodic contributions; delegates to `project`.

import { project, type Frequency, type ProjectionResult } from "../projection.js";

export interface CompoundInput {
  initial: number;
  contribution: number;
  /** Contribution frequency (when money is added). */
  frequency?: Frequency;
  /**
   * Interest compounding (when interest is credited and starts earning); independent of `frequency`. Defaults
   * to annual.
   */
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
