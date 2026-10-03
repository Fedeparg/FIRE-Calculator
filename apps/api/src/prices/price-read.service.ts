import { Inject, Injectable } from '@nestjs/common';
import { and, gte, inArray, lte, sql } from 'drizzle-orm';
import {
  MAX_CARRY_FORWARD_DAYS,
  type FxPoint,
  type PricePoint,
  type SplitPoint,
} from '@sextante/core/portfolio/history-reconstruction';

import { addDays } from '../common/dates.js';
import { DRIZZLE, type Database } from '../db/database.module.js';
import { instrumentPrices, instrumentSplits } from '../db/schema.js';
import type { DatabaseOrTransaction } from '../positions/position-access.js';
import { FX_CURRENCY_BY_SYMBOL, FX_QUOTE } from './fx-symbols.js';
import { SYMBOL_RESOLVER, type SymbolResolver } from './symbol-resolver.js';

/** Price of an instrument as the frontend consumes it (read from our DB). */
export interface PriceInfo {
  symbol: string;
  close: number;
  currency: string;
  date: string;
  /** Instant (ISO) of the fetch: the intraday refresh rewrites the day's row. */
  fetchedAt: string;
  /** Close before `date` (`null` for the first data point), for the day's change. */
  previousClose: number | null;
}

/**
 * Exchange rates for the aggregated portfolio total. `rates[CCY]` = USD per unit of that
 * currency (USD = 1), so converting A→B is `amount * rates[A] / rates[B]`.
 */
export interface FxRates {
  rates: Record<string, number>;
  /** Date (YYYY-MM-DD) of the most recent rate, or null if there are none. */
  asOf: string | null;
}

/**
 * READS from the price cache (`instrument_prices`, `instrument_splits`): latest close, FX rates
 * and series to rebuild the history. It never calls the external source nor resolves new symbols
 * (only the resolver's cache): it is the hot path of valuation, snapshots and alerts. Whatever
 * fetches external data lives in `PriceHistoryService`.
 */
@Injectable()
export class PriceReadService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(SYMBOL_RESOLVER) private readonly resolver: SymbolResolver,
  ) {}

  /** Latest cached price of each requested ticker, keyed by the original ticker. */
  async getPrices(tickers: string[]): Promise<Map<string, PriceInfo>> {
    const tickerToSymbol = await this.resolveCachedTickers(tickers);
    const latest = await this.latestBySymbol([...new Set(tickerToSymbol.values())]);

    const out = new Map<string, PriceInfo>();
    for (const [ticker, symbol] of tickerToSymbol) {
      const price = latest.get(symbol);
      if (price) out.set(ticker, price);
    }
    return out;
  }

  /** Cached FX rates (USD per unit, USD = 1); a currency without a rate is absent and the frontend excludes those positions. */
  async getFxRates(): Promise<FxRates> {
    const rates: Record<string, number> = { [FX_QUOTE]: 1 };
    let asOf: string | null = null;

    const latest = await this.latestBySymbol([...FX_CURRENCY_BY_SYMBOL.keys()]);
    for (const [symbol, price] of latest) {
      const currency = FX_CURRENCY_BY_SYMBOL.get(symbol);
      if (currency && Number.isFinite(price.close) && price.close > 0) {
        rates[currency] = price.close;
        if (asOf === null || price.date > asOf) asOf = price.date;
      }
    }
    return { rates, asOf };
  }

  /** Ticker → resolved symbol, from the cache only (never triggers OpenFIGI or the external source), in one query. */
  async resolveCachedTickers(tickers: string[]): Promise<Map<string, string>> {
    const resolved = await this.resolver.resolveManyCached(tickers);
    const out = new Map<string, string>();
    for (const [ticker, symbol] of resolved) {
      if (symbol) out.set(ticker, symbol);
    }
    return out;
  }

  /**
   * Close, FX and split series since `from` for `backfillUser`. `tickerToSymbol` arrives already
   * resolved so no other connection is requested inside a transaction. `MAX_CARRY_FORWARD_DAYS`
   * extra days are read so the first day can carry forward the previous close.
   */
  async getSeriesSince(
    tickerToSymbol: ReadonlyMap<string, string>,
    from: string,
    executor: DatabaseOrTransaction = this.db,
  ): Promise<{
    prices: Record<string, PricePoint[]>;
    fx: Record<string, FxPoint[]>;
    splits: Record<string, SplitPoint[]>;
  }> {
    const symbols = [...new Set([...tickerToSymbol.values(), ...FX_CURRENCY_BY_SYMBOL.keys()])];

    const start = addDays(from, -MAX_CARRY_FORWARD_DAYS);
    const rows =
      symbols.length === 0
        ? []
        : await executor
            .select()
            .from(instrumentPrices)
            .where(and(inArray(instrumentPrices.symbol, symbols), gte(instrumentPrices.date, start)))
            .orderBy(instrumentPrices.symbol, instrumentPrices.date);

    const bySymbol = new Map<string, PricePoint[]>();
    for (const row of rows) {
      const close = Number(row.close);
      if (!Number.isFinite(close) || close <= 0) continue;
      const list = bySymbol.get(row.symbol) ?? [];
      list.push({ date: row.date, close, currency: row.currency });
      bySymbol.set(row.symbol, list);
    }

    const prices: Record<string, PricePoint[]> = {};
    for (const [ticker, symbol] of tickerToSymbol) {
      const series = bySymbol.get(symbol);
      if (series) prices[ticker] = series;
    }
    const fx: Record<string, FxPoint[]> = {};
    for (const [symbol, currency] of FX_CURRENCY_BY_SYMBOL) {
      const series = bySymbol.get(symbol);
      if (series) fx[currency] = series.map(({ date, close }) => ({ date, rate: close }));
    }

    // Splits are read in full, not from `from`: a lot before the window can predate a split
    // inside it. There are few rows per symbol.
    const splitRows =
      tickerToSymbol.size === 0
        ? []
        : await executor
            .select()
            .from(instrumentSplits)
            .where(inArray(instrumentSplits.symbol, [...new Set(tickerToSymbol.values())]))
            .orderBy(instrumentSplits.symbol, instrumentSplits.date);
    const splitsBySymbol = new Map<string, SplitPoint[]>();
    for (const row of splitRows) {
      const list = splitsBySymbol.get(row.symbol) ?? [];
      list.push({ date: row.date, ratio: Number(row.ratio) });
      splitsBySymbol.set(row.symbol, list);
    }
    const splits: Record<string, SplitPoint[]> = {};
    for (const [ticker, symbol] of tickerToSymbol) {
      const list = splitsBySymbol.get(symbol);
      if (list) splits[ticker] = list;
    }
    return { prices, fx, splits };
  }

  /**
   * Latest known close per symbol (and the previous one, for `previousClose`). This is the hot
   * path (prices, FX, valuation, snapshots, alerts): `ROW_NUMBER()` per symbol lets Postgres read
   * only the TWO most recent rows of each through the PK `(symbol, date)`, instead of fetching
   * years of history to keep two.
   */
  private async latestBySymbol(symbols: string[]): Promise<Map<string, PriceInfo>> {
    const out = new Map<string, PriceInfo>();
    if (symbols.length === 0) return out;

    const ranked = this.db
      .select({
        symbol: instrumentPrices.symbol,
        close: instrumentPrices.close,
        currency: instrumentPrices.currency,
        date: instrumentPrices.date,
        fetchedAt: instrumentPrices.fetchedAt,
        rank: sql<number>`row_number() over (partition by ${instrumentPrices.symbol} order by ${instrumentPrices.date} desc)`.as(
          'rank',
        ),
      })
      .from(instrumentPrices)
      .where(inArray(instrumentPrices.symbol, symbols))
      .as('ranked');
    const rows = await this.db.select().from(ranked).where(lte(ranked.rank, 2)).orderBy(ranked.symbol, ranked.rank);

    // Per symbol, newest to oldest: the first row is the current price and the second (if any)
    // the previous close. The PK rules out two rows with the same date.
    for (const row of rows) {
      const current = out.get(row.symbol);
      if (!current) {
        out.set(row.symbol, {
          symbol: row.symbol,
          close: Number(row.close),
          currency: row.currency,
          date: row.date,
          fetchedAt: row.fetchedAt.toISOString(),
          previousClose: null,
        });
      } else {
        current.previousClose = Number(row.close);
      }
    }
    return out;
  }
}
