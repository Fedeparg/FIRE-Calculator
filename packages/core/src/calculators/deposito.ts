// Fixed-term deposit: compounds at the TAE (APY) and applies the Spanish withholding on interest. Pure core.

import { MAX_HORIZON_YEARS } from "../inputs.js";
import { SPAIN_SAVINGS_WITHHOLDING_PCT } from "../fiscal/countries.js";

export interface DepositInput {
  principal: number;
  apr: number;
  years: number;
  /** Withholding on interest, in base 100. Defaults to 19% (Spain). */
  withholdingRate?: number;
  /** Annual inflation, in base 100; when given, the final value is also computed in today's purchasing power. */
  inflationRate?: number;
}

export interface DepositResult {
  finalGross: number;
  grossInterest: number;
  withheld: number;
  netInterest: number;
  finalNet: number;
  /** Net final value in today's purchasing power (inflation discounted). */
  realFinalNet: number;
}

export function computeDeposit(input: DepositInput): DepositResult {
  const principal = Math.max(0, input.principal || 0);
  const apr = (input.apr || 0) / 100;
  // Not rounded (a deposit can last 6 months), but capped like every other term.
  const years = Math.min(MAX_HORIZON_YEARS, Math.max(0, input.years || 0));
  const withholding = Math.min(100, Math.max(0, input.withholdingRate ?? SPAIN_SAVINGS_WITHHOLDING_PCT)) / 100;
  const inflation = (input.inflationRate || 0) / 100;

  // With a TAE or inflation ≤ −100% the factor drops to zero (as in `projection.ts`) instead of yielding NaN.
  const finalGross = principal * Math.pow(Math.max(0, 1 + apr), years);
  const grossInterest = finalGross - principal;
  const withheld = grossInterest * withholding;
  const netInterest = grossInterest - withheld;
  const finalNet = principal + netInterest;
  const inflationFactor = Math.pow(Math.max(0, 1 + inflation), years);

  return {
    finalGross,
    grossInterest,
    withheld,
    netInterest,
    finalNet,
    realFinalNet: inflationFactor > 0 ? finalNet / inflationFactor : finalNet,
  };
}
