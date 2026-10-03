/**
 * Portfolio export to CSV. Pure core (no React or DOM): it receives the same data the screen
 * already has (positions, last prices and FX rates) and returns the file's text. Dialect,
 * escaping and BOM come from `src/shared/format/csv.ts`.
 */

import { buildCsv, type CsvCell } from "@/shared/format/csv";
import { convertCurrency } from "@sextante/core/fx";
import type { Locale } from "@/i18n/types";
import { roundCents } from "@sextante/core/money";

/** File columns, in order. It is also the order of `PortfolioCsvHeaders`. */
export const CSV_COLUMNS = [
  "ticker",
  "name",
  "quantity",
  "avgPrice",
  "currency",
  "broker",
  "lastPrice",
  "priceCurrency",
  "priceDate",
  "marketValue",
] as const;

/** Headers ALREADY translated by the caller: the core does not translate (same rule as elsewhere). */
export type PortfolioCsvHeaders = Readonly<Record<(typeof CSV_COLUMNS)[number], string>>;

export interface PortfolioCsvInput {
  positions: readonly {
    ticker: string;
    name: string | null;
    quantity: number;
    avgPrice: number;
    broker: string | null;
    currency: string;
  }[];
  /** Last price per ticker, each in its native currency. */
  prices: Record<string, { close: number; currency: string; date: string }>;
  /** USD per unit of each currency (USD = 1). */
  rates: Record<string, number>;
  /** Currency the valuation is expressed in (the one chosen in the portfolio). */
  display: string;
  headers: PortfolioCsvHeaders;
  locale: Locale;
}

/**
 * Builds the portfolio CSV. A position with no known price, or whose price cannot be converted
 * into the chosen currency, is still exported: only the cells that cannot be computed are left
 * empty (last price and/or valuation).
 */
export function buildPortfolioCsv({ positions, prices, rates, display, headers, locale }: PortfolioCsvInput): string {
  const rows: CsvCell[][] = positions.map((position) => {
    const price = prices[position.ticker];
    const rawValue = price ? convertCurrency(position.quantity * price.close, price.currency, display, rates) : null;
    // The valuation is the ONLY amount computed here (quantity × price plus a currency
    // conversion on top): it is rounded to cents so the binary floating-point noise
    // ("1999,9999999999998") does not end up in a spreadsheet. Every other amount comes
    // straight from the database.
    const marketValue = rawValue === null ? null : roundCents(rawValue);

    return [
      position.ticker,
      position.name ?? "",
      position.quantity,
      position.avgPrice,
      position.currency,
      position.broker ?? "",
      price ? price.close : null,
      price ? price.currency : "",
      // ISO date (`YYYY-MM-DD`), not localized: it is the form every spreadsheet recognizes
      // as a date and the one that sorts correctly as text.
      price ? price.date : "",
      marketValue,
    ];
  });

  return buildCsv(
    CSV_COLUMNS.map((column) => headers[column]),
    rows,
    locale,
  );
}
