// Splits an imported dividend into gross amount, withholding at source (retención en origen) and
// Spanish withholding, with the provenance of each figure. Pure core module. Three layers, from
// most to least reliable:
//   1. `resolveFromBroker`: arithmetic on what the broker says.
//   2. `resolveWithMarket`: check against the market dividend per share × shares.
//   3. `estimateWithStatutoryRate`: the rate the country withholds by law, flagged as an estimate.
// Criterion and sources: see ./README.md, section `dividend-resolution.ts`.

import { roundCents } from "../money.js";
import { countryColumn, SPAIN_SAVINGS_WITHHOLDING_PCT } from "./countries.js";
import type { ValueSource } from "./income.js";

/** Spanish withholding on capital income (rendimientos del capital mobiliario, art. 90 RIRPF), as a fraction. */
export const SPANISH_WITHHOLDING_RATE = SPAIN_SAVINGS_WITHHOLDING_PCT / 100;

/**
 * Withholding at source the broker actually applies, as a fraction, to untangle the mix of
 * withholdings in the Trade Republic export. Data and source: `brokerAppliedPct` in `countries.ts`.
 */
const BROKER_ORIGIN_RATES: Readonly<Record<string, number>> = countryColumn((rates) =>
  rates.brokerAppliedPct !== undefined ? rates.brokerAppliedPct / 100 : undefined,
);

/** Tolerance for comparing amounts the broker rounds to cents at each step. */
const CENT_TOLERANCE = 0.011;

/** Withholding at source above this is not plausible: the market figure does not fit. */
const MAX_PLAUSIBLE_ORIGIN_RATE = 0.4;

/** What the broker says about a dividend. Amounts in euros except `originalAmount`. */
export interface DividendFacts {
  /** Amount paid, in euros. */
  amount: number;
  /** Withholdings the broker records on the row, in euros and as an absolute value. */
  tax: number;
  /** Amount paid in the payment currency, if it was not the euro. */
  originalAmount: number | null;
  /** The broker already withholds in Spain (Spanish branch): it applies 19% to the amount received. */
  reported: boolean;
  /** Issuer's country (ISIN prefix). */
  country: string;
}

export interface DividendResolution {
  gross: number;
  /** `null` if it cannot be known. */
  origin: number | null;
  spain: number;
  grossSource: ValueSource;
  /** `null` while `origin` is `null`. */
  originSource: ValueSource | null;
}

/**
 * Layer 1. The meaning of `amount` and `tax` changes with the period and the issuer (verified
 * against Trade Republic's tax reports):
 *
 * - Before the Spanish branch: `amount` is the gross amount and `tax` the withholding at source.
 * - Afterwards, Spain withholds 19% of the amount received net of source withholding.
 *   `tax/amount` ≈ 19%: `amount` arrived net of source withholding and `tax` is only the Spanish
 *   one (ASML). ≈ source + 19% of the rest: `amount` is the gross amount and `tax` adds up both
 *   (US).
 *
 * Grossing up a net amount with an assumed rate is an estimate until the market confirms it.
 */
export function resolveFromBroker({ amount, tax, country, reported }: DividendFacts): DividendResolution {
  const rate = BROKER_ORIGIN_RATES[country];
  if (tax === 0) {
    if (country === "ES") return { gross: amount, origin: 0, spain: 0, grossSource: "broker", originSource: "broker" };
    // So small that the withholding at source would round to 0 cents.
    if (rate !== undefined && roundCents(Math.abs(amount) * rate) === 0) {
      return { gross: amount, origin: 0, spain: 0, grossSource: "broker", originSource: "derived" };
    }
    return { gross: amount, origin: null, spain: 0, grossSource: "broker", originSource: null };
  }
  if (!reported) return { gross: amount, origin: tax, spain: 0, grossSource: "broker", originSource: "broker" };

  if (Math.abs(tax - SPANISH_WITHHOLDING_RATE * amount) <= CENT_TOLERANCE) {
    if (country === "ES")
      return { gross: amount, origin: 0, spain: tax, grossSource: "broker", originSource: "broker" };
    if (rate === undefined)
      return { gross: amount, origin: null, spain: tax, grossSource: "broker", originSource: null };
    const gross = roundCents(amount / (1 - rate));
    return { gross, origin: roundCents(gross - amount), spain: tax, grossSource: "estimate", originSource: "estimate" };
  }
  if (
    rate !== undefined &&
    Math.abs(tax - (rate + SPANISH_WITHHOLDING_RATE * (1 - rate)) * amount) <= 2 * CENT_TOLERANCE
  ) {
    // Reproduces the broker's rounding (source to cents, Spain the rest): solving it
    // algebraically is off by a cent on small amounts.
    const origin = roundCents(rate * amount);
    return { gross: amount, origin, spain: roundCents(tax - origin), grossSource: "broker", originSource: "derived" };
  }
  // Unclassified: the Spanish withholding cannot exceed 19% of the amount received; source unknown.
  return {
    gross: amount,
    origin: null,
    spain: Math.min(tax, roundCents(SPANISH_WITHHOLDING_RATE * amount)),
    grossSource: "broker",
    originSource: null,
  };
}

/**
 * Layer 2. `marketGross` = shares × market dividend per share, in the payment currency. If it
 * matches what was paid, the broker gave the gross amount; if it is larger, the payment arrived
 * net and the difference is the withholding at source, whatever the country. The comparison is
 * made in the payment currency (not in euros: that would mix the broker's rate with the ECB's)
 * and the derived figures are converted to euros at the broker's implied rate, so that gross,
 * withholdings and net add up. `null` if the market figure does not fit (lower than what was
 * paid, or an implausible withholding).
 */
export function resolveWithMarket(facts: DividendFacts, marketGross: number): DividendResolution | null {
  const paid = facts.originalAmount ?? facts.amount;
  if (!(marketGross > 0) || !(paid > 0)) return null;
  const tolerance = Math.max(CENT_TOLERANCE, 0.005 * marketGross);
  if (marketGross < paid - tolerance) return null;

  const fx = facts.amount / paid;
  if (Math.abs(marketGross - paid) <= tolerance) {
    // The amount paid is the gross amount: what the broker withheld is all there was.
    const broker = resolveFromBroker(facts);
    if (broker.origin !== null && broker.originSource !== "estimate") return broker;
    const spain = facts.reported ? Math.min(facts.tax, roundCents(SPANISH_WITHHOLDING_RATE * facts.amount)) : 0;
    const origin = roundCents(Math.max(0, facts.tax - spain));
    return { gross: facts.amount, origin, spain, grossSource: "market", originSource: "market" };
  }

  const gross = roundCents(marketGross * fx);
  const origin = roundCents(gross - facts.amount);
  if (origin / gross > MAX_PLAUSIBLE_ORIGIN_RATE) return null;
  return { gross, origin, spain: facts.reported ? facts.tax : 0, grossSource: "market", originSource: "market" };
}

/**
 * Layer 3. With no market data, assumes the payment arrived net of the rate the country withholds
 * by law (`statutoryRate`, with its source in `withholding-rates.ts`). It is an estimate and is
 * flagged as such.
 */
export function estimateWithStatutoryRate(facts: DividendFacts, statutoryRate: number): DividendResolution {
  const spain = facts.reported ? facts.tax : 0;
  const gross = roundCents(facts.amount / (1 - statutoryRate));
  return { gross, origin: roundCents(gross - facts.amount), spain, grossSource: "estimate", originSource: "estimate" };
}
