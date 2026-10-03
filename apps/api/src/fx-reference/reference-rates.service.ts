import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, gte, inArray, sql } from 'drizzle-orm';

import {
  MAX_RATE_GAP_DAYS,
  TAX_CURRENCY,
  type ReferenceRatePoint,
  type ReferenceRates,
} from '@sextante/core/fiscal/fx-reference';
import { addDays, todayUtc } from '../common/dates.js';
import { DRIZZLE, type Database } from '../db/database.module.js';
import { fxReferenceCoverage, fxReferenceRates } from '../db/schema.js';
import { ECB_FIRST_DATE } from './constants.js';
import { REFERENCE_RATES_PROVIDER, type EcbRate, type ReferenceRatesProvider } from './ecb-reference-rates.provider.js';

/** How often, at most, the tail of the series is checked again. */
const TAIL_REFRESH_MS = 6 * 3_600_000;

const CURRENCY = /^[A-Z]{3}$/;
const INSERT_CHUNK = 1_000;

/**
 * ECB reference rates with a permanent DB cache: past publications never change, so each range is
 * downloaded only once. Only the tail of the series is requested again, at most every
 * `TAIL_REFRESH_MS`, to pick up new publications.
 */
@Injectable()
export class ReferenceRatesService {
  private readonly logger = new Logger(ReferenceRatesService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(REFERENCE_RATES_PROVIDER) private readonly provider: ReferenceRatesProvider,
  ) {}

  /**
   * Series for `currencies` from `from` to today, ready for `referenceRateOn`. It includes the
   * publications from the days before `from` needed for a transaction on a holiday. If the source
   * fails, it returns whatever is cached: the report flags what it cannot convert.
   */
  async getRates(currencies: readonly string[], from: string): Promise<ReferenceRates> {
    const wanted = [...new Set(currencies)].filter((c) => c !== TAX_CURRENCY && CURRENCY.test(c));
    if (wanted.length === 0) return {};
    const start = [addDays(from, -MAX_RATE_GAP_DAYS), ECB_FIRST_DATE].sort().at(-1) ?? ECB_FIRST_DATE;
    const end = todayUtc();
    if (start > end) return Object.fromEntries(wanted.map((c) => [c, []]));

    await this.ensureCoverage(wanted, start, end);

    const rows = await this.db
      .select({
        currency: fxReferenceRates.currency,
        date: fxReferenceRates.date,
        unitsPerEur: fxReferenceRates.unitsPerEur,
      })
      .from(fxReferenceRates)
      .where(and(inArray(fxReferenceRates.currency, wanted), gte(fxReferenceRates.date, start)))
      .orderBy(asc(fxReferenceRates.currency), asc(fxReferenceRates.date));

    const series: Record<string, ReferenceRatePoint[]> = Object.fromEntries(wanted.map((c) => [c, []]));
    // The query filters by `wanted`, so every row already has its series.
    for (const row of rows) series[row.currency]?.push({ date: row.date, unitsPerEur: Number(row.unitsPerEur) });
    return series;
  }

  /** Downloads each currency's missing ranges and records what is covered. */
  private async ensureCoverage(currencies: string[], start: string, end: string): Promise<void> {
    const coverage = new Map(
      (await this.db.select().from(fxReferenceCoverage).where(inArray(fxReferenceCoverage.currency, currencies))).map(
        (row) => [row.currency, row],
      ),
    );
    const now = Date.now();

    for (const currency of currencies) {
      const known = coverage.get(currency);
      const ranges: [string, string][] = [];
      if (!known) {
        ranges.push([start, end]);
      } else {
        if (start < known.fromDate) ranges.push([start, addDays(known.fromDate, -1)]);
        const stale = now - known.checkedAt.getTime() > TAIL_REFRESH_MS;
        // The last week is repeated in case that day's publication had not come out yet.
        if (known.toDate < end && stale) ranges.push([addDays(known.toDate, -MAX_RATE_GAP_DAYS), end]);
      }

      let fromDate = known?.fromDate;
      let toDate = known?.toDate;
      let fetched = false;
      for (const [rangeFrom, rangeTo] of ranges) {
        try {
          await this.store(await this.provider.getRates([currency], rangeFrom, rangeTo));
        } catch (error) {
          // Coverage is not recorded: the range will be retried on the next request.
          this.logger.warn(`Could not download the ${currency} rates ${rangeFrom}..${rangeTo}: ${String(error)}`);
          continue;
        }
        fetched = true;
        fromDate = fromDate === undefined || rangeFrom < fromDate ? rangeFrom : fromDate;
        toDate = toDate === undefined || rangeTo > toDate ? rangeTo : toDate;
      }
      if (!fetched || fromDate === undefined || toDate === undefined) continue;

      await this.db
        .insert(fxReferenceCoverage)
        .values({ currency, fromDate, toDate, checkedAt: new Date() })
        .onConflictDoUpdate({
          target: fxReferenceCoverage.currency,
          set: { fromDate, toDate, checkedAt: new Date() },
        });
    }
  }

  /** Inserts in chunks: a series since 1999 is ~7,000 rows and Postgres limits the parameters per statement. */
  private async store(rates: EcbRate[]): Promise<void> {
    for (let i = 0; i < rates.length; i += INSERT_CHUNK) {
      await this.db
        .insert(fxReferenceRates)
        .values(
          rates.slice(i, i + INSERT_CHUNK).map((r) => ({
            currency: r.currency,
            date: r.date,
            unitsPerEur: String(r.unitsPerEur),
            source: this.provider.name,
          })),
        )
        .onConflictDoUpdate({
          target: [fxReferenceRates.currency, fxReferenceRates.date],
          set: { unitsPerEur: sql`excluded.units_per_eur`, fetchedAt: new Date() },
        });
    }
  }
}
