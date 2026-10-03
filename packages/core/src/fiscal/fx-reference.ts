// ECB reference exchange rates to convert foreign-currency transactions to euros. Pure core
// module: the API downloads and caches the series (`apps/api/src/fx-reference/`). Tax criterion
// and sources: see ./README.md, section `fx-reference.ts`.

import { itemAt } from "../arrays.js";
import { daysBetween } from "../dates.js";

/** Currency in which IRPF is reported. */
export const TAX_CURRENCY = "EUR";

/**
 * Maximum days between the requested date and the last earlier publication. The ECB does not
 * publish on weekends or TARGET2 holidays (the longest gap is Good Friday + Easter Monday:
 * Thursday to Tuesday, 5 days); beyond that, the series is missing, it is not a holiday.
 */
export const MAX_RATE_GAP_DAYS = 7;

/** An ECB publication: units of the currency per 1 euro (1 EUR = 1.1225 USD). */
export interface ReferenceRatePoint {
  /** Published day (`YYYY-MM-DD`). */
  date: string;
  unitsPerEur: number;
}

/** Series by currency (ISO 4217 code), each in ascending date order. */
export type ReferenceRates = Readonly<Record<string, readonly ReferenceRatePoint[]>>;

/** Rate applied to a transaction, with the publication it comes from (traceability). */
export interface AppliedRate {
  currency: string;
  unitsPerEur: number;
  /** Day of the publication used: the transaction's or the last business day before it. */
  date: string;
}

/**
 * Reference rate in force on `date` for `currency`: the one published that day or, if there was
 * no publication (weekend, holiday), the last one before it. `null` if the currency has no series,
 * if there is no earlier publication or if the last one is more than `MAX_RATE_GAP_DAYS` old:
 * better no figure than a rate that does not belong to the date.
 */
export function referenceRateOn(rates: ReferenceRates, currency: string, date: string): AppliedRate | null {
  if (currency === TAX_CURRENCY) return { currency, unitsPerEur: 1, date };
  const series = rates[currency];
  if (!series || series.length === 0) return null;

  // Binary search for the last publication dated <= `date`.
  let lo = 0;
  let hi = series.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (itemAt(series, mid).date <= date) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found < 0) return null;

  const point = itemAt(series, found);
  if (!Number.isFinite(point.unitsPerEur) || point.unitsPerEur <= 0) return null;
  if (daysBetween(point.date, date) > MAX_RATE_GAP_DAYS) return null;
  return { currency, unitsPerEur: point.unitsPerEur, date: point.date };
}

/** Foreign-currency amount → euros with an already chosen rate. */
export function toEur(amount: number, rate: AppliedRate): number {
  return amount / rate.unitsPerEur;
}
