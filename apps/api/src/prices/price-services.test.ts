import { asc, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { firstItem, itemAt } from '@sextante/core/arrays';

import type { Database } from '../db/database.module.js';
import { instrumentPrices, instrumentSplitChecks, instrumentSplits, positionLots, positions } from '../db/schema.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import type { PriceHistory, PriceProvider, Quote, SplitEvent } from './price-provider.interface.js';
import { PriceHistoryService } from './price-history.service.js';
import { PriceReadService } from './price-read.service.js';
import type { SymbolResolver } from './symbol-resolver.js';

/** Identity resolver: the ticker IS the symbol (the search-box case, without OpenFIGI). */
const identityResolver: SymbolResolver = {
  resolve: (ticker) => Promise.resolve(ticker),
  resolveCached: (ticker) => Promise.resolve(ticker),
  resolveManyCached: (tickers) => Promise.resolve(new Map(tickers.map((ticker) => [ticker, ticker]))),
};

/**
 * Test provider with programmable history and quotes that also COUNTS the calls: this checks
 * that `primeSymbol` requests the history only once and only falls back to `getQuotes` when the
 * history comes back empty.
 */
class StubProvider implements PriceProvider {
  readonly name = 'stub';
  history: Quote[] = [];
  splits: SplitEvent[] = [];
  quotes: Quote[] = [];
  historyCalls: string[] = [];
  quoteCalls: string[][] = [];

  getQuotes(symbols: string[]): Promise<Map<string, Quote>> {
    this.quoteCalls.push(symbols);
    const wanted = new Set(symbols);
    return Promise.resolve(new Map(this.quotes.filter((q) => wanted.has(q.symbol)).map((q) => [q.symbol, q])));
  }

  getHistory(symbol: string): Promise<PriceHistory> {
    this.historyCalls.push(symbol);
    return Promise.resolve({
      quotes: this.history.filter((q) => q.symbol === symbol),
      splits: this.splits.filter((e) => e.symbol === symbol),
      dividends: [],
    });
  }
}

/** Shortcut to build a quote. */
const quote = (symbol: string, date: string, close: number, currency = 'EUR'): Quote => ({
  symbol,
  date,
  close,
  currency,
});

/** Date (YYYY-MM-DD) of `days` days ago, to test coverage/backfill without fixed dates. */
const daysAgo = (days: number): string => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

describe('PriceReadService + PriceHistoryService — history cache (Postgres integration)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let provider: StubProvider;
  let reads: PriceReadService;
  let history: PriceHistoryService;

  beforeAll(() => {
    ({ db, close } = createTestDb());
  });

  // Frozen clock (`Date` only) so relative dates do not drift across UTC midnight.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date() });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await resetDb(db);
  });

  afterAll(async () => {
    await close();
  });

  /**
   * A NEW service and provider for each test: the call counters must start at zero, so they
   * cannot be shared from `beforeAll`.
   */
  function makeService(): void {
    provider = new StubProvider();
    reads = new PriceReadService(db, identityResolver);
    history = new PriceHistoryService(db, provider, identityResolver, reads);
    history.historyRequestDelayMs = 0;
  }

  /** Cached rows of a symbol, in chronological order. */
  function cachedRows(symbol: string) {
    return db
      .select()
      .from(instrumentPrices)
      .where(eq(instrumentPrices.symbol, symbol))
      .orderBy(asc(instrumentPrices.date));
  }

  it('when a symbol is added it caches its WHOLE series, not just the latest close', async () => {
    makeService();
    provider.history = [
      quote('IWDA', '2026-03-13', 95.1),
      quote('IWDA', '2026-03-14', 96.2),
      quote('IWDA', '2026-03-15', 97.3),
    ];

    await history.primeSymbol('IWDA', 'EUR');

    const rows = await cachedRows('IWDA');
    expect(rows.map((r) => r.date)).toEqual(['2026-03-13', '2026-03-14', '2026-03-15']);
    expect(rows.map((r) => r.close)).toEqual(['95.10000000', '96.20000000', '97.30000000']);
    expect(itemAt(rows, 0).source).toBe('stub');
    // A single history request per symbol: it is not repeated for each close.
    expect(provider.historyCalls.filter((symbol) => symbol === 'IWDA')).toEqual(['IWDA']);
  });

  it('re-priming the same symbol UPDATES the closes instead of duplicating rows', async () => {
    makeService();
    provider.history = [quote('IWDA', '2026-03-13', 95.1), quote('IWDA', '2026-03-14', 96.2)];
    await history.primeSymbol('IWDA');

    // The source corrects the close of the 14th (revised data) and adds the 15th.
    provider.history = [
      quote('IWDA', '2026-03-13', 95.1),
      quote('IWDA', '2026-03-14', 96.99),
      quote('IWDA', '2026-03-15', 97.3),
    ];
    await history.primeSymbol('IWDA');

    const rows = await cachedRows('IWDA');
    expect(rows).toHaveLength(3);
    expect(itemAt(rows, 1).close).toBe('96.99000000');
  });

  it('also caches the HISTORY of the FX pair of the position currency, not just the latest close', async () => {
    makeService();
    provider.history = [
      quote('AAPL', '2026-03-13', 180, 'USD'),
      quote('EURUSD=X', '2026-03-11', 1.08, 'USD'),
      quote('EURUSD=X', '2026-03-12', 1.09, 'USD'),
      quote('EURUSD=X', '2026-03-13', 1.1, 'USD'),
    ];

    await history.primeSymbol('AAPL', 'EUR');

    const fx = await reads.getFxRates();
    expect(fx.rates.EUR).toBe(1.1);
    // History is requested for both the instrument and the FX pair (the snapshot backfill also
    // needs to re-express PAST days in the position currency, not just today).
    expect(provider.historyCalls).toEqual(['AAPL', 'EURUSD=X']);
    expect(await cachedRows('EURUSD=X')).toHaveLength(3);
    // Since the history covered the requested days, there is no need to fall back to the latest close.
    expect(provider.quoteCalls).toEqual([]);
  });

  it('if the source gives no FX pair history, it still falls back to the latest close', async () => {
    makeService();
    provider.history = [quote('AAPL', '2026-03-13', 180, 'USD')];
    provider.quotes = [quote('EURUSD=X', '2026-03-13', 1.1, 'USD')];

    await history.primeSymbol('AAPL', 'EUR');

    const fx = await reads.getFxRates();
    expect(fx.rates.EUR).toBe(1.1);
    expect(provider.quoteCalls).toEqual([['EURUSD=X']]);
  });

  it('with a USD position it does not request a USDUSD pair: only EUR, the snapshot base', async () => {
    makeService();
    provider.history = [quote('AAPL', '2026-03-13', 180, 'USD'), quote('EURUSD=X', '2026-03-13', 1.1, 'USD')];

    await history.primeSymbol('AAPL', 'USD');

    expect(provider.historyCalls).toEqual(['AAPL', 'EURUSD=X']);
  });

  it('if the source gives no history, it falls back to the latest close and the position keeps a price', async () => {
    makeService();
    provider.history = [];
    provider.quotes = [quote('RARO', '2026-03-15', 12.5)];

    await history.primeSymbol('RARO');

    const rows = await cachedRows('RARO');
    expect(rows).toHaveLength(1);
    expect(itemAt(rows, 0).close).toBe('12.50000000');
    // And, like every new position, it ensures the EUR rate (the snapshot base): with no pair
    // history, it also falls back to its latest close.
    expect(provider.quoteCalls).toEqual([['RARO'], ['EURUSD=X']]);
  });

  it('a source failure does not propagate the error (creating the position does not break)', async () => {
    makeService();
    provider.getHistory = () => Promise.reject(new Error('Yahoo down'));

    await expect(history.primeSymbol('IWDA')).resolves.toBeUndefined();
    expect(await cachedRows('IWDA')).toHaveLength(0);
  });

  it('caches a series larger than the upsert chunk size', async () => {
    makeService();
    // 250 closes ≈ one trading year: crosses the 200-rows-per-statement chunk.
    provider.history = Array.from({ length: 250 }, (_, i) =>
      quote('IWDA', new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), 100 + i),
    );

    await history.primeSymbol('IWDA');

    const rows = await cachedRows('IWDA');
    expect(rows).toHaveLength(250);
    expect(itemAt(rows, 249).close).toBe('349.00000000');
  });

  it('getPrices returns the MOST RECENT close of the cached series', async () => {
    makeService();
    provider.history = [
      quote('IWDA', '2026-03-13', 95.1),
      quote('IWDA', '2026-03-15', 97.3),
      quote('IWDA', '2026-03-14', 96.2),
    ];
    await history.primeSymbol('IWDA');

    const prices = await reads.getPrices(['IWDA']);

    expect(prices.get('IWDA')).toMatchObject({ close: 97.3, date: '2026-03-15' });
  });

  it('getPrices includes the previous close for the day change', async () => {
    makeService();
    provider.history = [quote('IWDA', '2026-03-13', 95.1), quote('IWDA', '2026-03-16', 97.3)];
    await history.primeSymbol('IWDA');

    // The previous one is the prior session in the series, even with a weekend in between.
    expect((await reads.getPrices(['IWDA'])).get('IWDA')).toMatchObject({ close: 97.3, previousClose: 95.1 });
  });

  it('getPrices leaves the previous close null when there is only one data point', async () => {
    makeService();
    provider.history = [quote('IWDA', '2026-03-16', 97.3)];
    await history.primeSymbol('IWDA');

    expect((await reads.getPrices(['IWDA'])).get('IWDA')?.previousClose).toBeNull();
  });

  it('getPrices takes, for each symbol separately, its latest close and the previous one', async () => {
    makeService();
    const row = (symbol: string, date: string, close: string) => ({
      symbol,
      date,
      close,
      currency: 'EUR',
      source: 'stub',
      fetchedAt: new Date(`${date}T18:00:00Z`),
    });
    await db
      .insert(instrumentPrices)
      .values([
        row('IWDA', '2026-03-10', '90'),
        row('IWDA', '2026-03-12', '92'),
        row('IWDA', '2026-03-11', '91'),
        row('EUNL', '2026-03-13', '50'),
        row('EUNL', '2026-03-09', '48'),
        row('SOLO', '2026-03-01', '7'),
      ]);

    const prices = await reads.getPrices(['IWDA', 'EUNL', 'SOLO', 'SIN-DATOS']);

    expect(prices.get('IWDA')).toMatchObject({ close: 92, previousClose: 91, date: '2026-03-12' });
    expect(prices.get('EUNL')).toMatchObject({ close: 50, previousClose: 48, date: '2026-03-13' });
    expect(prices.get('SOLO')).toMatchObject({ close: 7, previousClose: null });
    expect(prices.get('IWDA')?.fetchedAt).toBe('2026-03-12T18:00:00.000Z');
    expect(prices.has('SIN-DATOS')).toBe(false);
  });

  it('getPrices exposes when the price was fetched (fetchedAt), for the "updated … ago" label', async () => {
    makeService();
    provider.history = [quote('IWDA', '2026-03-15', 97.3)];
    const before = Date.now();
    await history.primeSymbol('IWDA');

    const fetchedAt = (await reads.getPrices(['IWDA'])).get('IWDA')?.fetchedAt;

    expect(fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Date.parse(fetchedAt ?? '')).toBeGreaterThanOrEqual(before - 1000);
  });

  describe('getSeriesSince — series to rebuild the history', () => {
    it('returns the series of each ticker and each currency with a close, in one pass', async () => {
      makeService();
      provider.history = [
        quote('IWDA', daysAgo(3), 90),
        quote('IWDA', daysAgo(2), 92),
        quote('EURUSD=X', daysAgo(2), 1.1, 'USD'),
      ];
      await history.ensureHistory(
        new Map([
          ['IWDA', daysAgo(3)],
          ['EURUSD=X', daysAgo(3)],
        ]),
      );

      const { prices, fx } = await reads.getSeriesSince(
        await reads.resolveCachedTickers(['IWDA', 'DESCONOCIDO']),
        daysAgo(3),
      );

      expect(prices.IWDA?.map((p) => p.close)).toEqual([90, 92]);
      expect(prices.IWDA?.[0]).toEqual({ date: daysAgo(3), close: 90, currency: 'EUR' });
      expect(prices.DESCONOCIDO).toBeUndefined();
      expect(fx.EUR).toEqual([{ date: daysAgo(2), rate: 1.1 }]);
      expect(fx.GBP).toBeUndefined();
    });

    it('includes a few days BEFORE `from` so the previous close can be carried forward', async () => {
      makeService();
      provider.history = [quote('IWDA', daysAgo(25), 80), quote('IWDA', daysAgo(8), 90), quote('IWDA', daysAgo(1), 95)];
      await history.ensureHistory(new Map([['IWDA', daysAgo(25)]]));

      const { prices } = await reads.getSeriesSince(await reads.resolveCachedTickers(['IWDA']), daysAgo(5));

      // `daysAgo(8)` is included (carry-forward margin); `daysAgo(25)` is left out.
      expect(prices.IWDA?.map((p) => p.close)).toEqual([90, 95]);
    });

    it('with no tickers or symbols with data it returns empty series without failing', async () => {
      makeService();

      await expect(reads.getSeriesSince(new Map(), daysAgo(5))).resolves.toEqual({ prices: {}, fx: {}, splits: {} });
    });
  });

  describe('splits', () => {
    it('caches the splits with the history and getSeriesSince returns them per ticker', async () => {
      makeService();
      provider.history = [quote('NVDA', daysAgo(2), 100, 'USD')];
      provider.splits = [{ symbol: 'NVDA', date: daysAgo(5), ratio: 10 }];

      await history.primeSymbol('NVDA', 'USD');
      // Re-priming does not duplicate the split (PK symbol+date).
      await history.primeSymbol('NVDA', 'USD');

      const { splits } = await reads.getSeriesSince(await reads.resolveCachedTickers(['NVDA']), daysAgo(10));
      expect(splits).toEqual({ NVDA: [{ date: daysAgo(5), ratio: 10 }] });
    });
  });

  describe('split check marker', () => {
    /** Symbol cached BEFORE splits existed: prices with coverage, no splits and no marker. */
    async function seedLegacySymbol(): Promise<void> {
      const userId = await insertUser(db, 'legacy@example.com');
      const position = firstItem(
        await db
          .insert(positions)
          .values({ userId, ticker: 'NVDA', quantity: '10', avgPrice: '100', currency: 'USD' })
          .returning(),
      );
      await db.insert(positionLots).values({
        positionId: position.id,
        userId,
        kind: 'buy',
        quantity: '10',
        price: '100',
        tradedAt: daysAgo(30),
      });
      await db.insert(instrumentPrices).values({
        symbol: 'NVDA',
        date: daysAgo(30),
        close: '100',
        currency: 'USD',
        source: 'stub',
      });
    }

    it('startup re-queries a symbol with enough coverage but no marker, and loads its splits', async () => {
      makeService();
      await seedLegacySymbol();
      provider.history = [quote('NVDA', daysAgo(30), 100, 'USD')];
      provider.splits = [{ symbol: 'NVDA', date: daysAgo(10), ratio: 10 }];

      await history.ensureHistoryForActivePositions();

      expect(provider.historyCalls).toContain('NVDA');
      expect(await db.select().from(instrumentSplits)).toHaveLength(1);
      expect(await db.select().from(instrumentSplitChecks)).toHaveLength(1);
    });

    it('with a recent marker it requests nothing again (even without splits)', async () => {
      makeService();
      await seedLegacySymbol();
      provider.history = [quote('NVDA', daysAgo(30), 100, 'USD')];
      await history.ensureHistoryForActivePositions();
      provider.historyCalls = [];

      await history.ensureHistoryForActivePositions();

      expect(provider.historyCalls).not.toContain('NVDA');
    });

    it('if the source fails (empty history), the marker is not written', async () => {
      makeService();
      await seedLegacySymbol();
      provider.history = []; // Yahoo down: `getHistory` returns empty

      await history.ensureHistoryForActivePositions();

      expect(await db.select().from(instrumentSplitChecks)).toEqual([]);
    });

    it('refreshStaleSplits honours the per-run cap and starts with the oldest marker', async () => {
      makeService();
      const userId = await insertUser(db, 'muchos@example.com');
      const tickers = Array.from({ length: 45 }, (_, i) => `T${String(i).padStart(2, '0')}`);
      await db.insert(positions).values(tickers.map((ticker) => ({ userId, ticker, quantity: '1', avgPrice: '1' })));
      // T44 is the oldest of all; the rest are expired markers from the same day.
      await db.insert(instrumentSplitChecks).values(
        tickers.map((symbol, i) => ({
          symbol,
          checkedAt: new Date(Date.now() - (i === 44 ? 30 : 8) * 86_400_000),
        })),
      );
      provider.history = tickers.map((symbol) => quote(symbol, daysAgo(1), 1));

      await history.refreshStaleSplits();

      expect(provider.historyCalls).toHaveLength(40);
      expect(provider.historyCalls[0]).toBe('T44');
    });

    it('refreshStaleSplits re-queries only symbols whose marker is older than 7 days', async () => {
      makeService();
      await seedLegacySymbol();
      provider.history = [quote('NVDA', daysAgo(30), 100, 'USD')];
      await history.ensureHistoryForActivePositions();
      provider.historyCalls = [];

      await history.refreshStaleSplits();
      expect(provider.historyCalls).toEqual([]);

      await db.update(instrumentSplitChecks).set({ checkedAt: new Date(Date.now() - 8 * 86_400_000) });
      provider.splits = [{ symbol: 'NVDA', date: daysAgo(2), ratio: 4 }];
      await history.refreshStaleSplits();

      expect(provider.historyCalls).toEqual(['NVDA']);
      expect((await db.select().from(instrumentSplits)).map((r) => r.ratio)).toEqual(['4.00000000']);
    });
  });

  describe('ensureHistoryForTicker', () => {
    it('requests history only if coverage does not reach the lot date', async () => {
      makeService();
      provider.history = [quote('IWDA', daysAgo(100), 90), quote('IWDA', daysAgo(1), 100)];
      await history.ensureHistoryForTicker('IWDA', daysAgo(100));
      provider.historyCalls = [];

      await history.ensureHistoryForTicker('IWDA', daysAgo(50)); // already covered
      expect(provider.historyCalls).not.toContain('IWDA');

      await history.ensureHistoryForTicker('IWDA', daysAgo(300)); // older lot
      expect(provider.historyCalls).toContain('IWDA');
    });
  });

  describe('ensureHistory — coverage guard', () => {
    it('does not request history again if the symbol already reaches the required date', async () => {
      makeService();
      provider.history = [quote('IWDA', daysAgo(1), 100), quote('IWDA', daysAgo(400), 90)];
      const required = new Map([['IWDA', daysAgo(395)]]);
      await history.ensureHistory(required);
      expect(provider.historyCalls).toEqual(['IWDA']);

      provider.historyCalls = [];
      await history.ensureHistory(required);

      expect(provider.historyCalls).toEqual([]);
    });

    it('tolerates the first bar falling a few days after the date (weekend)', async () => {
      makeService();
      provider.history = [quote('IWDA', daysAgo(97), 90), quote('IWDA', daysAgo(1), 100)];
      await history.ensureHistory(new Map([['IWDA', daysAgo(100)]]));
      provider.historyCalls = [];

      await history.ensureHistory(new Map([['IWDA', daysAgo(100)]]));

      expect(provider.historyCalls).toEqual([]);
    });

    it('requests history again if coverage does not reach the required date', async () => {
      makeService();
      provider.history = [quote('IWDA', daysAgo(2), 100)];
      await history.ensureHistory(new Map([['IWDA', daysAgo(30)]]));
      expect(provider.historyCalls).toEqual(['IWDA']);

      provider.historyCalls = [];
      await history.ensureHistory(new Map([['IWDA', daysAgo(30)]]));

      // The stub adds no more history between calls: coverage is still missing.
      expect(provider.historyCalls).toEqual(['IWDA']);
    });

    it('a symbol with no cached rows at all also counts as lacking coverage', async () => {
      makeService();
      provider.history = [quote('IWDA', daysAgo(1), 100)];

      await history.ensureHistory(new Map([['IWDA', daysAgo(1)]]));

      expect(provider.historyCalls).toEqual(['IWDA']);
      expect(await cachedRows('IWDA')).toHaveLength(1);
    });

    it('each symbol is checked against its own date: only those falling short are requested', async () => {
      makeService();
      provider.history = [quote('AAA', daysAgo(200), 1), quote('BBB', daysAgo(5), 1)];
      await history.ensureHistory(
        new Map([
          ['AAA', daysAgo(200)],
          ['BBB', daysAgo(5)],
        ]),
      );
      provider.historyCalls = [];

      await history.ensureHistory(
        new Map([
          ['AAA', daysAgo(190)],
          ['BBB', daysAgo(100)],
        ]),
      );

      expect(provider.historyCalls).toEqual(['BBB']);
    });

    it('a source failure on one symbol does not prevent requesting the next', async () => {
      makeService();
      provider.history = [quote('BBB', daysAgo(1), 1)];
      const original = provider.getHistory.bind(provider);
      provider.getHistory = (symbol) => (symbol === 'AAA' ? Promise.reject(new Error('Yahoo down')) : original(symbol));

      await history.ensureHistory(
        new Map([
          ['AAA', daysAgo(1)],
          ['BBB', daysAgo(1)],
        ]),
      );

      expect(await cachedRows('BBB')).toHaveLength(1);
    });
  });

  describe('ensureHistoryForActivePositions', () => {
    /** Position with a single buy lot on `tradedAt`. */
    async function insertPositionWithLot(ticker: string, currency: string, tradedAt: string): Promise<void> {
      const userId = await insertUser(db, `${ticker}@example.com`);
      const position = firstItem(
        await db.insert(positions).values({ userId, ticker, quantity: '10', avgPrice: '150', currency }).returning(),
      );
      await db.insert(positionLots).values({
        positionId: position.id,
        userId,
        kind: 'buy',
        quantity: '10',
        price: '150',
        tradedAt,
      });
    }

    it('requests history for the symbols in use and every supported FX pair', async () => {
      makeService();
      await insertPositionWithLot('AAPL', 'USD', daysAgo(30));
      provider.history = [quote('AAPL', daysAgo(30), 180, 'USD')];

      await history.ensureHistoryForActivePositions();

      expect(await cachedRows('AAPL')).toHaveLength(1);
      // The EUR/USD pair is ALWAYS ensured (for the aggregated total), even if no position is
      // in EUR: any user can pick that display currency.
      expect(provider.historyCalls).toEqual(expect.arrayContaining(['AAPL', 'EURUSD=X']));
    });

    it('requests nothing again when the history already reaches the first trade', async () => {
      makeService();
      await insertPositionWithLot('AAPL', 'USD', daysAgo(30));
      provider.history = [quote('AAPL', daysAgo(30), 180, 'USD'), quote('EURUSD=X', daysAgo(30), 1.1, 'USD')];
      await history.ensureHistoryForActivePositions();
      provider.historyCalls = [];

      await history.ensureHistoryForActivePositions();

      // Pairs without data in the stub (GBP, JPY…) are retried; the instrument and EUR are not.
      expect(provider.historyCalls).not.toContain('AAPL');
      expect(provider.historyCalls).not.toContain('EURUSD=X');
    });

    it('with a trade older than the cached history, it requests it again', async () => {
      makeService();
      await insertPositionWithLot('AAPL', 'USD', daysAgo(400));
      await db.insert(instrumentPrices).values({
        symbol: 'AAPL',
        date: daysAgo(365),
        close: '170',
        currency: 'USD',
        source: 'stub',
      });
      provider.history = [quote('AAPL', daysAgo(400), 150, 'USD')];

      await history.ensureHistoryForActivePositions();

      expect(provider.historyCalls).toContain('AAPL');
      expect((await cachedRows('AAPL')).map((r) => r.date)).toContain(daysAgo(400));
    });

    it('a position without lots is included too, with its creation date as first trade', async () => {
      makeService();
      const userId = await insertUser(db, 'sinlotes@example.com');
      await db.insert(positions).values({ userId, ticker: 'MSFT', quantity: '1', avgPrice: '1', currency: 'USD' });
      provider.history = [quote('MSFT', daysAgo(0), 400, 'USD')];

      await history.ensureHistoryForActivePositions();

      expect(provider.historyCalls).toContain('MSFT');
    });

    it('with no positions, it requests no instrument history but does request the FX pairs', async () => {
      makeService();

      await history.ensureHistoryForActivePositions();

      expect(provider.historyCalls).toEqual(expect.arrayContaining(['EURUSD=X']));
      expect(provider.historyCalls).not.toContain('AAPL');
    });
  });
});
