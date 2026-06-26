// Intereses de staking (cripto). Capitaliza al APY (compuesto anual). Reutiliza
// el motor genérico de proyección. Aplica una retención/impuesto sobre las
// recompensas (rendimiento del capital mobiliario). Core puro.

import { project, type ProjectionResult } from "../projection";

export interface StakingInput {
  /** Capital inicial en staking. */
  principal: number;
  /** APY (rendimiento anual compuesto), en base 100 (8 = 8 %). */
  apy: number;
  /** Horizonte en años. */
  years: number;
  /**
   * Retención/impuesto sobre las recompensas, en base 100. Por defecto 19 %
   * (España). Las recompensas de staking tributan como renta del ahorro.
   */
  withholdingRate?: number;
}

export interface StakingResult extends ProjectionResult {
  /** Recompensas brutas generadas (= intereses). */
  rewards: number;
  /** Importe retenido sobre las recompensas. */
  withheld: number;
  /** Recompensas netas (tras retención). */
  netRewards: number;
  /** Valor final neto (capital + recompensas netas). */
  netFinalValue: number;
}

export function computeStaking(input: StakingInput): StakingResult {
  const projection = project({
    initial: input.principal,
    contribution: 0,
    frequency: "annual",
    annualRate: input.apy,
    years: input.years,
  });

  const withholding = Math.min(100, Math.max(0, input.withholdingRate ?? 19)) / 100;
  const rewards = projection.totalInterest;
  const withheld = Math.max(0, rewards) * withholding;
  const netRewards = rewards - withheld;

  return {
    ...projection,
    rewards,
    withheld,
    netRewards,
    netFinalValue: projection.totalContributed + netRewards,
  };
}
