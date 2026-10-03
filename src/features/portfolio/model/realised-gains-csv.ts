/**
 * CSV of the realised gains report: one row per SALE in the tax year, which is the level of detail
 * the tax return asks for (each disposal with its transfer and acquisition values). Amounts are in
 * the position's currency and in euros at the ECB rate on the sale date; without that rate, the
 * euro columns are left empty. Dialect, escaping and BOM: `src/shared/format/csv.ts`.
 */

import { buildCsv, type CsvCell } from "@/shared/format/csv";
import type { Locale } from "@/i18n/types";
import type { RealisedGainsYear } from "@sextante/core/fiscal/realised-gains";
import { roundCents } from "@sextante/core/money";

/** File columns, in order. It is also the order of `RealisedGainsCsvHeaders`. */
export const REALISED_GAINS_CSV_COLUMNS = [
  "date",
  "ticker",
  "name",
  "currency",
  "quantity",
  "price",
  "fees",
  "transferValue",
  "acquisitionValue",
  "gain",
  "exchangeRate",
  "transferValueEur",
  "acquisitionValueEur",
  "gainEur",
  "fxDifferenceEur",
  "deferredLossEur",
  "integratedLossEur",
  "computableGainEur",
] as const;

type RealisedGainsCsvColumn = (typeof REALISED_GAINS_CSV_COLUMNS)[number];

/** Headers ALREADY translated. */
export type RealisedGainsCsvHeaders = Readonly<Record<RealisedGainsCsvColumn, string>>;

/**
 * Headers translated with `t` from the `portfolio.realisedGains` namespace: each column is the key
 * `csv.<column>`. They live next to the CSV so a new column is not forgotten in the UI.
 */
export function realisedGainsCsvHeaders(t: (key: `csv.${RealisedGainsCsvColumn}`) => string): RealisedGainsCsvHeaders {
  const headers = {} as Record<RealisedGainsCsvColumn, string>;
  for (const column of REALISED_GAINS_CSV_COLUMNS) headers[column] = t(`csv.${column}`);
  return headers;
}

export function buildRealisedGainsCsv(
  year: RealisedGainsYear,
  headers: RealisedGainsCsvHeaders,
  locale: Locale,
): string {
  const rows: CsvCell[][] = year.sales.map((sale) => [
    // ISO date: every spreadsheet recognizes it and it sorts correctly as text.
    sale.tradedAt,
    sale.ticker,
    sale.name ?? "",
    sale.currency,
    sale.quantity,
    sale.price,
    sale.sellFees,
    roundCents(sale.transferValue),
    roundCents(sale.acquisitionValue),
    roundCents(sale.gain),
    sale.eur?.sellRate.unitsPerEur ?? null,
    sale.eur ? roundCents(sale.eur.transferValue) : null,
    sale.eur ? roundCents(sale.eur.acquisitionValue) : null,
    sale.eur ? roundCents(sale.eur.gain) : null,
    sale.eur?.fxDifference != null ? roundCents(sale.eur.fxDifference) : null,
    sale.eur ? roundCents(sale.eur.deferredLoss) : null,
    sale.eur ? roundCents(sale.eur.integratedLoss) : null,
    sale.eur ? roundCents(sale.eur.computableGain) : null,
  ]);
  return buildCsv(
    REALISED_GAINS_CSV_COLUMNS.map((column) => headers[column]),
    rows,
    locale,
  );
}
