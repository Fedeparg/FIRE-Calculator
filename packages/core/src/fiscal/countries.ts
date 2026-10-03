// Dividend withholding rates by source country (ISO 3166-1 alpha-2), all in %, in a single
// registry. The three views the tax engine uses come from here, each with its unit at the edge:
//   - `TREATY_DIVIDEND_RATES` (double-taxation.ts, in %): the treaty limit for the foreign tax
//     credit (deducción por doble imposición internacional, art. 80 LIRPF);
//   - `STATUTORY_DIVIDEND_WITHHOLDING` (withholding-rates.ts, as a fraction): what the country
//     actually withholds, to ESTIMATE the withholding at source (retención en origen);
//   - `BROKER_ORIGIN_RATES` (dividend-resolution.ts, as a fraction): what the broker withholds.
// Sources for each column: see the fields of `CountryDividendRates` and ./README.md. Pure core
// module.

/** Spanish withholding on capital income and savings income, in % (art. 90 RIRPF). */
export const SPAIN_SAVINGS_WITHHOLDING_PCT = 19;

/** Withholding the country actually applies and where the figure comes from. */
export interface StatutoryDividendRate {
  readonly pct: number;
  readonly source: string;
}

export interface CountryDividendRates {
  /**
   * Maximum rate (%) the treaty with Spain allows the source country on dividends paid to a
   * Spanish resident («General» column, not parent-subsidiary). Source: DGT, «Límites de
   * imposición sobre dividendos, intereses y cánones resultantes de los CDI suscritos por España»
   * (update of 01/01/2018),
   * https://www.hacienda.gob.es/SGT/NormativaDoctrina/Tributaria/CDI/Documentacion/Limites_Imposicion_CDI.pdf
   * Only countries with a single rate and no footnote in that column are included; absent = no
   * confirmed figure. The table dates from 2018 and is cross-checked against later treaties:
   * - Japan: 5% since the 2018 treaty, in force on 01/05/2021 (BOE-A-2021-2977, art. 10.2).
   * - Ireland: 0%. Art. 10.1.c) of the treaty exempts in Ireland the dividends of a Spanish
   *   resident; the table's 15% is letter b) (tax-credit regime). What Ireland withholds (25%
   *   DWT) is not deductible in Spain: it is reclaimed from Revenue with form V2A.
   */
  readonly treatyPct?: number;
  /**
   * Withholding the country actually applies to an individual resident in Spain (cross-checked on
   * 2026-10-03). Countries where it depends on something we do not know are left out: Ireland
   * (25%, or 0% with the non-resident declaration) and Australia (30% or 0% depending on whether
   * the dividend is "franked").
   */
  readonly statutory?: StatutoryDividendRate;
  /**
   * Withholding at source the broker actually applies, matching the treaty, to untangle the mix
   * of withholdings in the Trade Republic export: US with the W-8BEN (confirmed with 21 real
   * dividends against TR's tax report) and the Netherlands (ASML).
   */
  readonly brokerAppliedPct?: number;
}

const PWC = (country: string) => `PwC Worldwide Tax Summaries, ${country}, withholding taxes`;

export const COUNTRY_DIVIDEND_RATES: Readonly<Record<string, CountryDividendRates>> = {
  AT: { treatyPct: 15 },
  AU: { treatyPct: 15 },
  BE: { treatyPct: 15, statutory: { pct: 30, source: PWC("Belgium") } },
  CA: { treatyPct: 15, statutory: { pct: 25, source: PWC("Canada") } },
  CH: { treatyPct: 15, statutory: { pct: 35, source: PWC("Switzerland") } },
  CN: {
    treatyPct: 10,
    statutory: { pct: 10, source: "Circular Guo Shui Han [2011] 348 (H shares); treaty BOE-A-2021-4911" },
  },
  DE: {
    treatyPct: 15,
    statutory: { pct: 26.375, source: `${PWC("Germany")}: 25% + 5.5% solidarity surcharge` },
  },
  // No treaty since 01/01/2009: see `NO_TREATY_COUNTRIES`.
  DK: { statutory: { pct: 27, source: PWC("Denmark") } },
  FI: {
    treatyPct: 15,
    statutory: { pct: 30, source: "Vero (Finnish Tax Administration), dividends to non-residents" },
  },
  FR: { treatyPct: 15, statutory: { pct: 12.8, source: `${PWC("France")}: 12.8% for individuals (art. 187 CGI)` } },
  GB: {
    treatyPct: 10,
    statutory: { pct: 0, source: "AEAT, folleto Residentes con rentas en Reino Unido; no domestic withholding" },
  },
  HK: { treatyPct: 10, statutory: { pct: 0, source: PWC("Hong Kong") } },
  IE: { treatyPct: 0 },
  IT: { treatyPct: 15, statutory: { pct: 26, source: PWC("Italy") } },
  JP: { treatyPct: 5, statutory: { pct: 15.315, source: `${PWC("Japan")}: 15% + 2.1% surcharge, listed shares` } },
  KR: { treatyPct: 15 },
  // No treaty: see `NO_TREATY_COUNTRIES`.
  KY: { statutory: { pct: 0, source: PWC("Cayman Islands") } },
  LU: { treatyPct: 15, statutory: { pct: 15, source: PWC("Luxembourg") } },
  NL: { treatyPct: 15, statutory: { pct: 15, source: PWC("Netherlands") }, brokerAppliedPct: 15 },
  NO: { treatyPct: 15, statutory: { pct: 25, source: PWC("Norway") } },
  PT: { treatyPct: 15 },
  SE: { treatyPct: 15, statutory: { pct: 30, source: PWC("Sweden") } },
  US: {
    treatyPct: 15,
    // With the W-8BEN that brokers file: the treaty rate. Without it, 30%.
    statutory: { pct: 15, source: "IRS, Tax Treaty Table 1 (Spain: 15% on dividends)" },
    brokerAppliedPct: 15,
  },
};

/** View of one registry column: the countries that have it, with their value. */
export function countryColumn<T>(pick: (rates: CountryDividendRates) => T | undefined): Readonly<Record<string, T>> {
  const column: Record<string, T> = {};
  for (const [country, rates] of Object.entries(COUNTRY_DIVIDEND_RATES)) {
    const value = pick(rates);
    if (value !== undefined) column[country] = value;
  }
  return column;
}
