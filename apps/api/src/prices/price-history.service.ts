import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, inArray, min, sql } from 'drizzle-orm';

import { addDays, MS_PER_DAY, todayUtc } from '../common/dates.js';
import { errorMessage } from '../common/errors.js';
import { DRIZZLE, type Database } from '../db/database.module.js';
import {
  instrumentDividends,
  instrumentPrices,
  instrumentSplitChecks,
  instrumentSplits,
  positionLots,
  positions,
} from '../db/schema.js';
import { FX_QUOTE, FX_SYMBOLS, fxSymbol } from './fx-symbols.js';
import {
  PRICE_PROVIDER,
  type DividendEvent,
  type PriceHistory,
  type PriceProvider,
  type Quote,
} from './price-provider.interface.js';
import { PriceReadService } from './price-read.service.js';
import { SYMBOL_RESOLVER, type SymbolResolver } from './symbol-resolver.js';

/** Wait cap of `primeSymbol`: guards against a new ISIN with a slow resolution so the POST does not time out the proxy. */
const PRIME_MAX_WAIT_MS = 9_000;
/** Rows per statement when caching a history. */
const UPSERT_CHUNK_SIZE = 200;
/** 5-year history: one call per symbol, and the cap of the snapshot rebuild. */
export const HISTORY_MAX_DAYS = 1825;
/** Slack in days: a weekend or holiday delays the first bar without anything missing. */
const COVERAGE_TOLERANCE_DAYS = 7;
/** Age (days) after which a symbol's splits are queried again. */
const SPLITS_REFRESH_DAYS = 7;
/** Cap per run of `refreshStaleSplits` (expirations all start on the same day). */
const SPLITS_REFRESH_MAX_PER_RUN = 40;
/** Pause between consecutive history requests: Yahoo rate-limits per IP (429). */
const HISTORY_REQUEST_DELAY_MS = 500;

/** `YYYY-MM-DD` (UTC) of `days` days ago. */
function daysAgo(days: number): string {
  return addDays(todayUtc(), -days);
}

/** The timer is `unref`ed so that, used as a cap in a `Promise.race`, it does not keep the process alive. */
const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms).unref();
  });

export interface RefreshSummary {
  symbols: number;
  fetched: number;
  missing: string[];
}

/**
 * WRITES to the price cache from the external source: quote refresh (cron), history when a symbol
 * is added (`primeSymbol`), coverage guard (`ensureHistory*`), and the splits and dividends that
 * come with the history. It is the only thing that talks to the provider; reads live in
 * `PriceReadService`.
 */
@Injectable()
export class PriceHistoryService {
  private readonly logger = new Logger(PriceHistoryService.name);
  /** Public so tests can set it to 0. */
  historyRequestDelayMs = HISTORY_REQUEST_DELAY_MS;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PRICE_PROVIDER) private readonly provider: PriceProvider,
    @Inject(SYMBOL_RESOLVER) private readonly resolver: SymbolResolver,
    private readonly reads: PriceReadService,
  ) {}

  /** Refreshes the symbols in use from the external source (daily cron; never while browsing). One failure does not break the rest. */
  async refreshAll(): Promise<RefreshSummary> {
    const tickers = await this.distinctTickers();
    const instrumentSymbols = await this.resolveSymbols(tickers);
    // FX pairs always: the aggregated portfolio total needs them to convert.
    const symbols = [...new Set([...instrumentSymbols, ...FX_SYMBOLS])];

    if (symbols.length === 0) {
      this.logger.log('Price refresh: no symbols to update');
      return { symbols: 0, fetched: 0, missing: [] };
    }

    const quotes = await this.provider.getQuotes(symbols);
    await this.upsertQuotes(quotes);

    const missing = symbols.filter((s) => !quotes.has(s));
    const detail =
      `(${this.provider.name}): ${quotes.size}/${symbols.length} symbols` +
      (missing.length ? ` — no data: ${missing.join(', ')}` : '');

    if (quotes.size === 0) {
      // Zero out of N requested symbols is not a bad symbol but a source outage, rate limit or
      // network failure: it is logged as an error so stale prices are not left silently.
      this.logger.error(`Price refresh with NO data at all ${detail}`);
    } else {
      this.logger.log(`Price refresh ${detail}`);
    }
    return { symbols: symbols.length, fetched: quotes.size, missing };
  }

  /**
   * Resolves and caches the price of a newly added or edited ticker so it is valued right away;
   * it is the only user path that deliberately triggers an external fetch. It does not propagate
   * errors: the price arrives with the next refresh.
   *
   * Creating a position awaits it because the frontend only re-requests prices when the set of
   * tickers changes. If a new ISIN is slow (OpenFIGI), `PRIME_MAX_WAIT_MS` caps the wait and the
   * resolution finishes in the background (and stays cached).
   *
   * @param currency the position's currency; if it is not USD, its FX pair is refreshed too.
   */
  async primeSymbol(ticker: string, currency?: string): Promise<void> {
    // The whole job is started; only how long we wait is capped.
    await Promise.race([this.primeNow(ticker, currency), delay(PRIME_MAX_WAIT_MS)]);
  }

  /** Ensures history up to each symbol's date, requesting only those not covered; `alsoSymbols` are requested too. One failure does not block the rest. */
  async ensureHistory(required: ReadonlyMap<string, string>, alsoSymbols: readonly string[] = []): Promise<void> {
    const missing = [...new Set([...(await this.symbolsNeedingHistory(required)), ...alsoSymbols])];
    for (const [i, symbol] of missing.entries()) {
      if (i > 0 && this.historyRequestDelayMs > 0) await delay(this.historyRequestDelayMs);
      try {
        await this.primeHistory(symbol);
      } catch (error) {
        this.logger.warn(`History of "${symbol}" could not be completed: ${errorMessage(error)}`);
      }
    }
  }

  /**
   * Startup pass: history of every symbol in use since any user's first trade (capped at 5
   * years) and of the FX pairs since the oldest one. Cheap if it already exists; repairs positions
   * whose `primeSymbol` failed without waiting for the cron.
   */
  async ensureHistoryForActivePositions(): Promise<void> {
    const floor = daysAgo(HISTORY_MAX_DAYS);
    // Left join: a position without lots is included too, with its creation date as first trade.
    const rows = await this.db
      .select({
        ticker: positions.ticker,
        firstTrade: min(sql<string>`coalesce(${positionLots.tradedAt}, ${positions.createdAt}::date)`),
      })
      .from(positions)
      .leftJoin(positionLots, eq(positions.id, positionLots.positionId))
      .groupBy(positions.ticker);

    const required = new Map<string, string>();
    let earliest: string | null = null;
    for (const { ticker, firstTrade } of rows) {
      const since = firstTrade && firstTrade > floor ? firstTrade : floor;
      if (earliest === null || since < earliest) earliest = since;
      const symbol = await this.resolver.resolve(ticker);
      if (!symbol) continue;
      const current = required.get(symbol);
      if (current === undefined || since < current) required.set(symbol, since);
    }
    for (const pair of FX_SYMBOLS) required.set(pair, earliest ?? floor);

    // Symbols with no (or an expired) split check are queried again even if the date coverage
    // is enough: it is the only way to load their splits.
    const stale = await this.symbolsWithStaleSplits(
      [...required.keys()].filter((symbol) => !FX_SYMBOLS.includes(symbol)),
    );
    await this.ensureHistory(required, stale);
  }

  /** History of a ticker back to `since` (capped at 5 years) when adding a lot older than the cache; cached resolution only (`primeSymbol` handles an unresolved ticker). */
  async ensureHistoryForTicker(ticker: string, since: string): Promise<void> {
    const symbol = await this.resolver.resolveCached(ticker);
    if (!symbol) return;
    const floor = daysAgo(HISTORY_MAX_DAYS);
    const required = new Map([[symbol, since > floor ? since : floor]]);
    // The FX pairs must reach that date too, to convert the older days.
    for (const pair of FX_SYMBOLS) required.set(pair, since > floor ? since : floor);
    await this.ensureHistory(required);
  }

  /**
   * Re-queries expired splits (oldest first, capped to stagger them) from the nightly cron. The
   * upsert is `DO UPDATE`: old closes are readjusted after a split.
   */
  async refreshStaleSplits(): Promise<void> {
    const tickerToSymbol = await this.reads.resolveCachedTickers(await this.distinctTickers());
    const stale = await this.symbolsWithStaleSplits([...new Set(tickerToSymbol.values())]);
    await this.ensureHistory(new Map(), stale.slice(0, SPLITS_REFRESH_MAX_PER_RUN));
  }

  /**
   * Resolution + 5-year history of the instrument (an import brings old purchases); only here or
   * when coverage is missing, never in the daily refresh. It also ensures the position's currency
   * and EUR (the snapshot base): without historical rates past days would not be convertible.
   */
  private async primeNow(ticker: string, currency?: string): Promise<void> {
    try {
      const symbol = await this.resolver.resolve(ticker);
      if (symbol) await this.primeHistory(symbol);

      const fxCurrencies = new Set([currency, 'EUR']);
      const fxPairs = [...fxCurrencies].filter((c): c is string => !!c && c !== FX_QUOTE).map(fxSymbol);
      await this.ensureHistory(new Map(fxPairs.map((pair) => [pair, daysAgo(HISTORY_MAX_DAYS)])));
    } catch (error) {
      this.logger.warn(`Prime of "${ticker}" failed (will be retried on the refresh): ${errorMessage(error)}`);
    }
  }

  /**
   * Symbols whose history does not reach their required date (the first trade, not always 5
   * years). Known limitation: one listed for less time than requested is requested again on every
   * pass (one call per symbol, only at startup and when adding a position).
   */
  private async symbolsNeedingHistory(required: ReadonlyMap<string, string>): Promise<string[]> {
    if (required.size === 0) return [];

    const rows = await this.db
      .select({ symbol: instrumentPrices.symbol, minDate: min(instrumentPrices.date) })
      .from(instrumentPrices)
      .where(inArray(instrumentPrices.symbol, [...required.keys()]))
      .groupBy(instrumentPrices.symbol);

    const earliest = new Map(rows.map((r) => [r.symbol, r.minDate]));
    return [...required]
      .filter(([symbol, since]) => {
        const minDate = earliest.get(symbol);
        if (!minDate) return true;
        const limit = addDays(since, COVERAGE_TOLERANCE_DAYS);
        return minDate > limit;
      })
      .map(([symbol]) => symbol);
  }

  /** Caches the history; if the source returns no series it falls back to the latest close so the position is not left without a price. */
  private async primeHistory(symbol: string): Promise<void> {
    const { quotes, splits, dividends }: PriceHistory = await this.provider.getHistory(symbol);
    if (quotes.length > 0) {
      await this.upsertQuoteList(quotes);
      await this.upsertSplits(splits);
      await this.upsertDividends(dividends);
      await this.markSplitsChecked(symbol);
      this.logger.log(
        `History of ${symbol}: cached ${quotes.length} closes, ${splits.length} splits and ${dividends.length} dividends`,
      );
      return;
    }
    await this.upsertQuotes(await this.provider.getQuotes([symbol]));
  }

  /** Records that the symbol's splits were checked now (even if it has none). */
  private async markSplitsChecked(symbol: string): Promise<void> {
    await this.db
      .insert(instrumentSplitChecks)
      .values({ symbol })
      .onConflictDoUpdate({ target: instrumentSplitChecks.symbol, set: { checkedAt: new Date() } });
  }

  /** Symbols whose splits were never checked or not checked for more than `SPLITS_REFRESH_DAYS`. */
  private async symbolsWithStaleSplits(symbols: readonly string[]): Promise<string[]> {
    if (symbols.length === 0) return [];
    const cutoff = new Date(Date.now() - SPLITS_REFRESH_DAYS * MS_PER_DAY);
    const rows = await this.db
      .select()
      .from(instrumentSplitChecks)
      .where(inArray(instrumentSplitChecks.symbol, [...symbols]));
    const checkedAt = new Map(rows.map((r) => [r.symbol, r.checkedAt]));
    // Never-checked ones first, then those with the oldest check.
    const time = (symbol: string): number => checkedAt.get(symbol)?.getTime() ?? 0;
    return symbols.filter((symbol) => time(symbol) < cutoff.getTime()).sort((a, b) => time(a) - time(b));
  }

  /** Upsert of a symbol's splits (PK `(symbol, date)`): re-priming does not duplicate rows. */
  private async upsertSplits(splits: readonly { symbol: string; date: string; ratio: number }[]): Promise<void> {
    if (splits.length === 0) return;
    await this.db
      .insert(instrumentSplits)
      .values(splits.map((s) => ({ symbol: s.symbol, date: s.date, ratio: s.ratio.toString() })))
      .onConflictDoUpdate({
        target: [instrumentSplits.symbol, instrumentSplits.date],
        set: { ratio: sql`excluded.ratio` },
      });
  }

  /**
   * Upsert of a symbol's per-share dividends (PK `(symbol, ex_date)`). `DO UPDATE`: Yahoo
   * readjusts past amounts after a split, just like the closes.
   */
  private async upsertDividends(dividends: readonly DividendEvent[]): Promise<void> {
    if (dividends.length === 0) return;
    await this.db
      .insert(instrumentDividends)
      .values(
        dividends.map((d) => ({
          symbol: d.symbol,
          exDate: d.exDate,
          amount: d.amount.toString(),
          currency: d.currency,
        })),
      )
      .onConflictDoUpdate({
        target: [instrumentDividends.symbol, instrumentDividends.exDate],
        set: { amount: sql`excluded.amount`, currency: sql`excluded.currency` },
      });
  }

  private upsertQuotes(quotes: Map<string, Quote>): Promise<void> {
    return this.upsertQuoteList([...quotes.values()]);
  }

  /**
   * Chunked upsert: a 5-year history is ~1,280 rows per symbol, and one statement per row would
   * multiply DB round trips by 200 on a synchronous user path (adding a position).
   */
  private async upsertQuoteList(quotes: readonly Quote[]): Promise<void> {
    const fetchedAt = new Date();
    const rows = quotes.map((quote) => ({
      symbol: quote.symbol,
      date: quote.date,
      close: quote.close.toString(),
      currency: quote.currency,
      source: this.provider.name,
      fetchedAt,
    }));

    for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
      const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE);
      await this.db
        .insert(instrumentPrices)
        .values(chunk)
        .onConflictDoUpdate({
          target: [instrumentPrices.symbol, instrumentPrices.date],
          set: {
            close: sql`excluded.close`,
            currency: sql`excluded.currency`,
            source: sql`excluded.source`,
            fetchedAt: sql`excluded.fetched_at`,
          },
        });
    }
  }

  /** Distinct `ticker`s across all positions (symbols in use, shared between users). */
  private async distinctTickers(): Promise<string[]> {
    const rows = await this.db.selectDistinct({ ticker: positions.ticker }).from(positions);
    return rows.map((r) => r.ticker);
  }

  /** Resolves tickers to source symbols, without duplicates or nulls. */
  private async resolveSymbols(tickers: string[]): Promise<string[]> {
    const symbols = new Set<string>();
    for (const ticker of tickers) {
      const symbol = await this.resolver.resolve(ticker);
      if (symbol) symbols.add(symbol);
    }
    return [...symbols];
  }
}
