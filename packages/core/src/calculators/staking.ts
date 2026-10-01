// Staking cripto: capitaliza al APY sobre el motor de proyección y aplica retención sobre las recompensas. Core puro.

import { project, type ProjectionResult } from "../projection.js";

export interface StakingInput {
  principal: number;
  apy: number;
  years: number;
  /** Retención sobre las recompensas, en base 100; por defecto 19 % (tributan como renta del ahorro). */
  withholdingRate?: number;
}

export interface StakingResult extends ProjectionResult {
  rewards: number;
  withheld: number;
  netRewards: number;
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
