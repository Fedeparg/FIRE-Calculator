// Withholding the source country actually applies to the dividends of an individual resident in
// Spain, to ESTIMATE the withholding at source (retención en origen) when neither the broker nor
// the market data give it (`dividend-resolution.ts`, layer 3). Every figure that comes out of here
// is flagged as an estimate. The data and their sources live in `countries.ts` (in %); here, as
// fractions. Cross-checked on 2026-10-03: see ./README.md, section `withholding-rates.ts`.

import { countryColumn } from "./countries.js";

/** Rate (as a fraction) and where it comes from. */
export interface StatutoryWithholding {
  rate: number;
  source: string;
}

/** By country (ISO 3166-1 alpha-2); absent if the rate depends on something we do not know (see `countries.ts`). */
export const STATUTORY_DIVIDEND_WITHHOLDING: Readonly<Record<string, StatutoryWithholding>> = countryColumn(
  (rates) => rates.statutory && { rate: rates.statutory.pct / 100, source: rates.statutory.source },
);
