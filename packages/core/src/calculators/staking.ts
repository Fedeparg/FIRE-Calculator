// Crypto staking: compounds at the APY on top of the projection engine and applies withholding to rewards. Pure
// core.

import { project, type ProjectionResult } from "../projection.js";
import { SPAIN_SAVINGS_WITHHOLDING_PCT } from "../fiscal/countries.js";

export interface StakingInput {
  principal: number;
  apy: number;
  years: number;
  /** Withholding on rewards, in base 100; defaults to 19% (they are taxed as savings income). */
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

  const withholding = Math.min(100, Math.max(0, input.withholdingRate ?? SPAIN_SAVINGS_WITHHOLDING_PCT)) / 100;
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
