import { EventEmitter2 } from '@nestjs/event-emitter';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { firstItem, itemAt } from '@sextante/core/arrays';

import type { Database } from '../db/database.module.js';
import {
  instrumentPrices,
  instrumentSplits,
  portfolioSnapshots,
  positionLots,
  positions as positionsTable,
} from '../db/schema.js';
import { LOT_CHANGED_EVENT } from '../positions/position-events.js';
import type { PositionsService } from '../positions/positions.service.js';
import type { PriceProvider } from '../prices/price-provider.interface.js';
import { PriceHistoryService } from '../prices/price-history.service.js';
import { PriceReadService } from '../prices/price-read.service.js';
import type { SymbolResolver } from '../prices/symbol-resolver.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import { buildPositionsStack } from '../../test/positions-stack.js';
import { SnapshotRepository } from './snapshot.repository.js';
import { PortfolioSnapshotsService } from './portfolio-snapshots.service.js';
import { PortfolioValuationService } from './portfolio-valuation.service.js';

/**
 * Identity resolver: the ticker IS the symbol. Avoids calling OpenFIGI in tests, just like the
 * real resolver does when the user types an exact symbol.
 */
const identityResolver: SymbolResolver = {
  resolve: (ticker) => Promise.resolve(ticker),
  resolveCached: (ticker) => Promise.resolve(ticker),
  resolveManyCached: (tickers) => Promise.resolve(new Map(tickers.map((ticker) => [ticker, ticker]))),
};

/** Silent provider: snapshots read prices from OUR database, never from the source. */
const silentProvider: PriceProvider = {
  name: 'test',
  getQuotes: () => Promise.resolve(new Map()),
  getHistory: () => Promise.resolve({ quotes: [], splits: [], dividends: [] }),
};

/** Today's date in UTC, the one the capture uses (with the frozen clock: see `beforeEach`). */
const today = (): string => new Date().toISOString().slice(0, 10);

describe('PortfolioSnapshotsService (Postgres integration)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let snapshots: PortfolioSnapshotsService;
  let positions: PositionsService;
  let prices: PriceReadService;
  let priceHistory: PriceHistoryService;

  beforeAll(() => {
    ({ db, close } = createTestDb());
    prices = new PriceReadService(db, identityResolver);
    priceHistory = new PriceHistoryService(db, silentProvider, identityResolver, prices);
    positions = buildPositionsStack(db, { prices: priceHistory }).positions;
    snapshots = new PortfolioSnapshotsService(
      db,
      new PortfolioValuationService(positions, prices),
      prices,
      priceHistory,
      positions,
      new SnapshotRepository(db),
    );
  });

  // Frozen clock (`Date` only): a run that crosses UTC midnight must not change "today" halfway
  // through a test, nor shift the relative dates (`daysAgo`).
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

  /** Caches a close for a symbol, as the daily refresh would. */
  async function cachePrice(symbol: string, close_: string, currency: string): Promise<void> {
    await cachePriceOn(symbol, today(), close_, currency);
  }

  /** Same as `cachePrice`, but on a given date (to seed past history). */
  async function cachePriceOn(symbol: string, date: string, close_: string, currency: string): Promise<void> {
    await db.insert(instrumentPrices).values({ symbol, date, close: close_, currency, source: 'test' });
  }

  /** The date `days` days ago, in UTC. */
  const daysAgo = (days: number): string => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  it("stores the valuation in EUR along with the day's FX rates", async () => {
    const userId = await insertUser(db, 'a@example.com');
    await positions.create(userId, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });
    await cachePrice('IWDA', '120', 'EUR');
    // The day's EUR→USD rate: the one that will allow re-expressing the history later.
    await cachePrice('EURUSD=X', '1.10', 'USD');

    await snapshots.captureUser(userId);

    const row = firstItem(await db.select().from(portfolioSnapshots));
    expect(row).toMatchObject({
      userId,
      date: today(),
      invested: '1000.00000000',
      marketValue: '1200.00000000',
      valuedPositions: 1,
      totalPositions: 1,
    });
    expect(row.fxRates).toMatchObject({ USD: 1, EUR: 1.1 });
  });

  it('is idempotent: capturing twice on the same day UPDATES the row, it does not duplicate it', async () => {
    const userId = await insertUser(db, 'a@example.com');
    await positions.create(userId, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });
    await cachePrice('IWDA', '120', 'EUR');

    await snapshots.captureAll();
    // The price rises between runs: the second one must overwrite.
    await db.update(instrumentPrices).set({ close: '130' });
    const summary = await snapshots.captureAll();

    const rows = await db.select().from(portfolioSnapshots);
    expect(rows).toHaveLength(1);
    expect(itemAt(rows, 0).marketValue).toBe('1300.00000000');
    expect(summary).toMatchObject({ users: 1, captured: 1, failed: 0 });
  });

  it('reads prices and FX ONCE per pass, not per user, and values each user with their own', async () => {
    const ana = await insertUser(db, 'ana@example.com');
    const bea = await insertUser(db, 'bea@example.com');
    await positions.create(ana, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });
    await positions.create(bea, { ticker: 'AAPL', quantity: 2, avgPrice: 150, currency: 'USD' });
    await cachePrice('IWDA', '120', 'EUR');
    await cachePrice('AAPL', '200', 'USD');
    await cachePrice('EURUSD=X', '1.25', 'USD');
    const getPrices = vi.spyOn(prices, 'getPrices');
    const getFxRates = vi.spyOn(prices, 'getFxRates');

    await snapshots.captureAll();

    expect(getPrices).toHaveBeenCalledTimes(1);
    expect(getFxRates).toHaveBeenCalledTimes(1);
    const rows = await db.select().from(portfolioSnapshots);
    expect(rows.find((row) => row.userId === ana)?.marketValue).toBe('1200.00000000');
    // 2 × 200 USD at 1.25 USD/EUR = 320 EUR.
    expect(rows.find((row) => row.userId === bea)?.marketValue).toBe('320.00000000');
    getPrices.mockRestore();
    getFxRates.mockRestore();
  });

  it('skips users without positions (does not pollute the series with zero rows)', async () => {
    await insertUser(db, 'no-positions@example.com');

    const summary = await snapshots.captureAll();

    expect(summary).toMatchObject({ users: 0, captured: 0, failed: 0 });
    expect(await db.select().from(portfolioSnapshots)).toHaveLength(0);
  });

  it('a failing user does not prevent capturing the rest', async () => {
    const ok = await insertUser(db, 'ok@example.com');
    const broken = await insertUser(db, 'roto@example.com');
    await positions.create(ok, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });
    // Overflowing valuation (10¹² · 10¹²): it does not fit in numeric(20,8) and fails THAT user's capture.
    await positions.create(broken, {
      ticker: 'HUGE',
      quantity: 999_999_999_999,
      avgPrice: 999_999_999_999,
    });
    await cachePrice('IWDA', '120', 'EUR');
    await cachePrice('HUGE', '1', 'EUR');

    const summary = await snapshots.captureAll();

    expect(summary).toMatchObject({ users: 2, captured: 1, failed: 1 });
    const rows = await db.select().from(portfolioSnapshots);
    expect(rows).toHaveLength(1);
    expect(itemAt(rows, 0).userId).toBe(ok);
  });

  describe('backfillUser / backfillAll', () => {
    /**
     * Creates a position with its initial lot DATED `tradedAt` (a normal creation dates it today):
     * this starts from a portfolio with history, like one from a broker import.
     */
    async function createBoughtOn(
      userId: string,
      ticker: string,
      quantity: number,
      avgPrice: number,
      tradedAt: string,
      currency: 'EUR' | 'USD' = 'EUR',
    ): Promise<string> {
      const { id } = await positions.create(userId, { ticker, quantity, avgPrice, currency });
      await db.update(positionLots).set({ tradedAt }).where(eq(positionLots.positionId, id));
      return id;
    }

    /** Adds a trade to a position, through the DB (creation order breaks same-day ties). */
    async function addLot(
      userId: string,
      positionId: string,
      kind: 'buy' | 'sell',
      quantity: string,
      price: string,
      tradedAt: string,
    ): Promise<void> {
      await db.insert(positionLots).values({ positionId, userId, kind, quantity, price, tradedAt });
    }

    async function rowsOf(userId: string) {
      return db
        .select()
        .from(portfolioSnapshots)
        .where(eq(portfolioSnapshots.userId, userId))
        .orderBy(portfolioSnapshots.date);
    }

    it("rebuilds from the first trade with EACH day's quantity, not the current one", async () => {
      const userId = await insertUser(db, 'a@example.com');
      const id = await createBoughtOn(userId, 'IWDA', 10, 100, daysAgo(5));
      await addLot(userId, id, 'buy', '10', '120', daysAgo(3));
      for (const days of [6, 5, 4, 3, 2, 1]) await cachePriceOn('IWDA', daysAgo(days), '100', 'EUR');

      await snapshots.backfillUser(userId);

      const rows = await rowsOf(userId);
      // Nothing before the first buy (5 days ago): the close from 6 days ago produces no row.
      expect(rows.map((r) => r.date)).toEqual([5, 4, 3, 2, 1].map(daysAgo));
      // 10 units until the second buy, 20 afterwards.
      expect(rows.map((r) => r.marketValue)).toEqual([
        '1000.00000000',
        '1000.00000000',
        '2000.00000000',
        '2000.00000000',
        '2000.00000000',
      ]);
      // Cost at each day's quantity: 10·100, and 10·100 + 10·120 after the second buy.
      expect(rows.map((r) => r.invested)).toEqual([
        '1000.00000000',
        '1000.00000000',
        '2200.00000000',
        '2200.00000000',
        '2200.00000000',
      ]);
      expect(rows.every((r) => r.estimated)).toBe(true);
    });

    it('reaches further back than a week and does not fill long price gaps with a stale close', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await createBoughtOn(userId, 'IWDA', 10, 100, daysAgo(400));
      for (const days of [400, 399, 200, 100, 1]) {
        await cachePriceOn('IWDA', daysAgo(days), '100', 'EUR');
      }

      await snapshots.backfillUser(userId);

      // Each close covers its day and the next 10 (carry-forward margin); the rest is a gap.
      const covered = (from: number, to: number) => Array.from({ length: from - to + 1 }, (_, i) => daysAgo(from - i));
      expect((await rowsOf(userId)).map((r) => r.date)).toEqual([
        ...covered(400, 389), // closes from 400 and 399 days ago
        ...covered(200, 190),
        ...covered(100, 90),
        daysAgo(1),
      ]);
    });

    it('after a full sale there is no snapshot, and it reappears with the buy-back', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const id = await createBoughtOn(userId, 'IWDA', 10, 100, daysAgo(5));
      await addLot(userId, id, 'sell', '10', '110', daysAgo(3));
      await addLot(userId, id, 'buy', '4', '90', daysAgo(1));
      for (const days of [5, 4, 3, 2, 1]) await cachePriceOn('IWDA', daysAgo(days), '100', 'EUR');

      await snapshots.backfillUser(userId);

      expect((await rowsOf(userId)).map((r) => r.date)).toEqual([daysAgo(5), daysAgo(4), daysAgo(1)]);
    });

    it('a day without an EUR rate for a USD position is skipped; with a rate, it is converted', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await createBoughtOn(userId, 'AAPL', 1, 100, daysAgo(4), 'USD');
      for (const days of [3, 2]) await cachePriceOn('AAPL', daysAgo(days), '200', 'USD');
      // The EUR rate only appears from 2 days ago.
      await cachePriceOn('EURUSD=X', daysAgo(2), '1.25', 'USD');

      await snapshots.backfillUser(userId);

      const rows = await rowsOf(userId);
      expect(rows.map((r) => r.date)).toEqual([daysAgo(2), daysAgo(1)]);
      expect(Number(itemAt(rows, 0).marketValue)).toBeCloseTo(160, 6); // 200 USD / 1.25
      expect(itemAt(rows, 0).fxRates).toMatchObject({ USD: 1, EUR: 1.25 });
    });

    it('never writes a row for TODAY: that belongs solely to the real capture', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await createBoughtOn(userId, 'IWDA', 10, 100, daysAgo(2));
      await cachePriceOn('IWDA', daysAgo(1), '100', 'EUR');
      // TODAY's price is available: if the backfill included it, it would write an `estimated: true`
      // row for today even though the nightly cron has not captured the real day yet.
      await cachePrice('IWDA', '999', 'EUR');

      await snapshots.backfillUser(userId);

      expect((await rowsOf(userId)).some((r) => r.date === today())).toBe(false);
    });

    it('never overwrites an existing real capture', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await createBoughtOn(userId, 'IWDA', 10, 100, daysAgo(3));
      await cachePriceOn('IWDA', daysAgo(1), '150', 'EUR');
      // REAL capture already stored by the cron for that day, with a value different from what
      // the backfill would compute (10 · 150 = 1500).
      await db.insert(portfolioSnapshots).values({
        userId,
        date: daysAgo(1),
        invested: '1000.00000000',
        marketValue: '999.00000000',
        valuedPositions: 1,
        totalPositions: 1,
        fxRates: { USD: 1 },
        estimated: false,
      });

      await snapshots.backfillUser(userId);

      const row = firstItem((await rowsOf(userId)).filter((r) => r.date === daysAgo(1)));
      expect(row.marketValue).toBe('999.00000000');
      expect(row.estimated).toBe(false);
    });

    describe('stale real captures', () => {
      /** When the cron wrote the capture for `date` (22:30 that day). */
      const capturedAt = (date: string): Date => new Date(`${date}T22:30:00Z`);

      /** A real capture with its own day's timestamps (a capture is not born "now"). */
      async function insertReal(userId: string, date: string, invested: string): Promise<void> {
        await db.insert(portfolioSnapshots).values({
          userId,
          date,
          invested,
          marketValue: invested,
          valuedPositions: 1,
          totalPositions: 1,
          fxRates: { USD: 1 },
          estimated: false,
          createdAt: capturedAt(date),
          updatedAt: capturedAt(date),
        });
      }

      /** A position with an old lot (A), created and recorded long before the captures. */
      async function createWithOldLot(userId: string, tradedAt: string): Promise<string> {
        const { id } = await positions.create(userId, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });
        const old = capturedAt(daysAgo(40));
        await db
          .update(positionLots)
          .set({ tradedAt, createdAt: old, updatedAt: old })
          .where(eq(positionLots.positionId, id));
        return id;
      }

      async function cacheFlatPrices(fromDaysAgo: number): Promise<void> {
        for (let days = fromDaysAgo; days >= 1; days--) await cachePriceOn('IWDA', daysAgo(days), '100', 'EUR');
      }

      it('repairs the production case: lot imported after the captures → later real rows become estimated, with no step', async () => {
        const userId = await insertUser(db, 'a@example.com');
        const id = await createWithOldLot(userId, daysAgo(20));
        await cacheFlatPrices(21);
        // Initial production state: estimates up to daysAgo(11) and real captures from
        // daysAgo(10) to daysAgo(1) with the cost from BEFORE the import (1,000 €).
        await snapshots.backfillUser(userId);
        for (let days = 10; days >= 1; days--) {
          await db.delete(portfolioSnapshots).where(eq(portfolioSnapshots.date, daysAgo(days)));
          await insertReal(userId, daysAgo(days), '1000.00000000');
        }
        // TODAY a back-dated buy is imported (earlier than several captures, not all of them).
        await addLot(userId, id, 'buy', '5', '100', daysAgo(8));

        await snapshots.backfillUser(userId);

        const rows = await rowsOf(userId);
        for (const row of rows) {
          const expected = row.date >= daysAgo(8) ? '1500.00000000' : '1000.00000000';
          expect(row.invested, row.date).toBe(expected);
        }
        // Real rows after the lot become estimated; earlier ones stay real.
        for (const row of rows.filter((r) => r.date >= daysAgo(8))) expect(row.estimated, row.date).toBe(true);
        for (const row of rows.filter((r) => r.date >= daysAgo(10) && r.date < daysAgo(8))) {
          expect(row.estimated, row.date).toBe(false);
          expect(row.updatedAt.toISOString(), row.date).toBe(capturedAt(row.date).toISOString());
        }
        // No step: the cost only rises on the lot's day and never drops.
        const series = rows.map((r) => Number(r.invested));
        expect(series.every((v, i) => i === 0 || v >= itemAt(series, i - 1))).toBe(true);
      });

      it('is idempotent: a second pass does not rewrite the already repaired rows', async () => {
        const userId = await insertUser(db, 'a@example.com');
        const id = await createWithOldLot(userId, daysAgo(10));
        await cacheFlatPrices(11);
        for (let days = 5; days >= 1; days--) await insertReal(userId, daysAgo(days), '1000.00000000');
        await addLot(userId, id, 'buy', '5', '100', daysAgo(7));
        await snapshots.backfillUser(userId);
        const first = await rowsOf(userId);

        await snapshots.backfillUser(userId);

        expect(await rowsOf(userId)).toEqual(first);
      });

      it('a lot dated today invalidates no real capture', async () => {
        const userId = await insertUser(db, 'a@example.com');
        const id = await createWithOldLot(userId, daysAgo(10));
        await cacheFlatPrices(11);
        for (let days = 5; days >= 1; days--) await insertReal(userId, daysAgo(days), '999.00000000');
        await addLot(userId, id, 'buy', '5', '100', today());

        await snapshots.backfillUser(userId);

        for (const row of (await rowsOf(userId)).filter((r) => r.date >= daysAgo(5))) {
          expect(row.estimated, row.date).toBe(false);
          expect(row.invested, row.date).toBe('999.00000000');
        }
      });

      it('a real capture written AFTER the lot change is faithful and is kept', async () => {
        const userId = await insertUser(db, 'a@example.com');
        const id = await createWithOldLot(userId, daysAgo(10));
        await cacheFlatPrices(11);
        await addLot(userId, id, 'buy', '5', '100', daysAgo(8)); // createdAt = now
        await db.insert(portfolioSnapshots).values({
          userId,
          date: daysAgo(3),
          invested: '999.00000000',
          marketValue: '999.00000000',
          valuedPositions: 1,
          totalPositions: 1,
          fxRates: { USD: 1 },
          estimated: false,
          updatedAt: new Date(Date.now() + 60_000), // after the lot
        });

        await snapshots.backfillUser(userId);

        const row = (await rowsOf(userId)).find((r) => r.date === daysAgo(3));
        expect(row).toMatchObject({ estimated: false, invested: '999.00000000' });
      });

      it('editing only the name or broker (the form resends amounts) does not invalidate real rows', async () => {
        const userId = await insertUser(db, 'a@example.com');
        const id = await createWithOldLot(userId, daysAgo(10));
        await cacheFlatPrices(11);
        for (let days = 5; days >= 1; days--) await insertReal(userId, daysAgo(days), '999.00000000');
        const events = new EventEmitter2();
        const emitted: unknown[] = [];
        events.on(LOT_CHANGED_EVENT, (payload: unknown) => emitted.push(payload));
        const editor = buildPositionsStack(db, { prices: priceHistory, positionsEvents: events }).positions;

        // Same amounts the position already has, as `PositionForm` does.
        await editor.update(userId, id, { name: 'Renamed', broker: 'Other', quantity: 10, avgPrice: 100 });
        await snapshots.backfillUser(userId);

        expect(emitted).toEqual([]);
        for (const row of (await rowsOf(userId)).filter((r) => r.date >= daysAgo(5))) {
          expect(row, row.date).toMatchObject({ estimated: false, invested: '999.00000000' });
        }
      });

      it('a lot edited after the capture invalidates it (e.g. corrected quantity)', async () => {
        const userId = await insertUser(db, 'a@example.com');
        const id = await createWithOldLot(userId, daysAgo(10));
        await cacheFlatPrices(11);
        for (let days = 5; days >= 1; days--) await insertReal(userId, daysAgo(days), '1000.00000000');
        // Lot edit (like `declareState` or the lots PATCH): `updatedAt` = now.
        await db
          .update(positionLots)
          .set({ quantity: '20', updatedAt: new Date() })
          .where(eq(positionLots.positionId, id));

        await snapshots.backfillUser(userId);

        for (const row of (await rowsOf(userId)).filter((r) => r.date >= daysAgo(5))) {
          expect(row, row.date).toMatchObject({ estimated: true, invested: '2000.00000000' });
        }
      });

      it('onLotChanged with invalidateFrom (deleted lot) redoes real rows from that date', async () => {
        const userId = await insertUser(db, 'a@example.com');
        const id = await createWithOldLot(userId, daysAgo(10));
        await cacheFlatPrices(11);
        // The captures included a lot that was later deleted (invested 1,500 €, no longer there).
        for (let days = 5; days >= 1; days--) await insertReal(userId, daysAgo(days), '1500.00000000');

        await snapshots.onLotChanged({ userId, positionId: id, invalidateFrom: daysAgo(3) });

        const rows = await rowsOf(userId);
        for (const row of rows.filter((r) => r.date >= daysAgo(3))) {
          expect(row, row.date).toMatchObject({ estimated: true, invested: '1000.00000000' });
        }
        for (const row of rows.filter((r) => r.date >= daysAgo(5) && r.date < daysAgo(3))) {
          expect(row, row.date).toMatchObject({ estimated: false, invested: '1500.00000000' });
        }
      });

      it('a stale row the rebuild cannot redo (no price) keeps the real value', async () => {
        const userId = await insertUser(db, 'a@example.com');
        const id = await createWithOldLot(userId, daysAgo(30));
        // The last close is from 25 days ago: past the carry-forward margin, there is no price 5 days ago.
        for (let days = 31; days >= 25; days--) await cachePriceOn('IWDA', daysAgo(days), '100', 'EUR');
        await insertReal(userId, daysAgo(5), '1000.00000000');
        await addLot(userId, id, 'buy', '5', '100', daysAgo(28));

        await snapshots.backfillUser(userId);

        const row = (await rowsOf(userId)).find((r) => r.date === daysAgo(5));
        expect(row).toMatchObject({ estimated: false, invested: '1000.00000000' });
      });

      describe('estimated = before tracking started in Sextante', () => {
        /** Sets the day the user started recording their portfolio (`created_at` of their positions). */
        async function trackedSince(userId: string, date: string): Promise<void> {
          await db
            .update(positionsTable)
            .set({ createdAt: new Date(`${date}T10:00:00Z`) })
            .where(eq(positionsTable.userId, userId));
        }

        /** Production state: a user since `daysAgo(20)` who TODAY imports a lot from 30 days ago. */
        async function seedImportedToday(userId: string): Promise<void> {
          await createBoughtOn(userId, 'IWDA', 10, 100, daysAgo(30));
          await trackedSince(userId, daysAgo(20));
          await cacheFlatPrices(31);
        }

        it('the rebuild before tracking started is estimated and the one after is not', async () => {
          const userId = await insertUser(db, 'a@example.com');
          await seedImportedToday(userId);

          await snapshots.backfillUser(userId);

          const rows = await rowsOf(userId);
          expect(itemAt(rows, 0).date).toBe(daysAgo(30));
          for (const row of rows) expect(row.estimated, row.date).toBe(row.date < daysAgo(20));
        });

        it('repairs the production state: rows after the start, marked estimated by #77, become real with the same values', async () => {
          const userId = await insertUser(db, 'a@example.com');
          await seedImportedToday(userId);
          await snapshots.backfillUser(userId);
          const expected = await rowsOf(userId);
          // What #77 left behind: the WHOLE rebuilt series marked as estimated.
          await db.update(portfolioSnapshots).set({ estimated: true }).where(eq(portfolioSnapshots.userId, userId));

          await snapshots.backfillUser(userId);

          const rows = await rowsOf(userId);
          expect(rows.filter((r) => r.date >= daysAgo(20)).length).toBeGreaterThan(0);
          for (const row of rows) expect(row.estimated, row.date).toBe(row.date < daysAgo(20));
          const values = (list: typeof rows) =>
            list.map((r) => [r.date, r.invested, r.marketValue, r.valuedPositions, r.totalPositions]);
          expect(values(rows)).toEqual(values(expected));
        });

        it('a replaced stale real row stays real (estimated = false) if it is after the start', async () => {
          const userId = await insertUser(db, 'a@example.com');
          const id = await createWithOldLot(userId, daysAgo(30));
          await trackedSince(userId, daysAgo(20));
          await cacheFlatPrices(31);
          await snapshots.backfillUser(userId);
          for (let days = 10; days >= 1; days--) {
            await db.delete(portfolioSnapshots).where(eq(portfolioSnapshots.date, daysAgo(days)));
            await insertReal(userId, daysAgo(days), '1000.00000000');
          }
          await addLot(userId, id, 'buy', '5', '100', daysAgo(8));

          await snapshots.backfillUser(userId);

          const rows = await rowsOf(userId);
          for (const row of rows.filter((r) => r.date >= daysAgo(8))) {
            expect(row.invested, row.date).toBe('1500.00000000');
          }
          for (const row of rows) expect(row.estimated, row.date).toBe(row.date < daysAgo(20));
        });

        it('a real row before tracking started is left as is', async () => {
          const userId = await insertUser(db, 'a@example.com');
          await seedImportedToday(userId);
          // Lot recorded before the capture: it is not stale.
          const old = capturedAt(daysAgo(40));
          await db.update(positionLots).set({ createdAt: old, updatedAt: old }).where(eq(positionLots.userId, userId));
          await insertReal(userId, daysAgo(25), '777.00000000');

          await snapshots.backfillUser(userId);

          const row = (await rowsOf(userId)).find((r) => r.date === daysAgo(25));
          expect(row).toMatchObject({ estimated: false, invested: '777.00000000' });
        });

        it('fills a gap after the start as real (estimated = false)', async () => {
          const userId = await insertUser(db, 'a@example.com');
          await seedImportedToday(userId);
          await snapshots.backfillUser(userId);
          await db.delete(portfolioSnapshots).where(eq(portfolioSnapshots.date, daysAgo(5)));

          await snapshots.backfillUser(userId);

          const row = (await rowsOf(userId)).find((r) => r.date === daysAgo(5));
          expect(row?.estimated).toBe(false);
        });

        it('is idempotent: a second pass rewrites nothing', async () => {
          const userId = await insertUser(db, 'a@example.com');
          await seedImportedToday(userId);
          await snapshots.backfillUser(userId);
          await db.update(portfolioSnapshots).set({ estimated: true }).where(eq(portfolioSnapshots.userId, userId));
          await snapshots.backfillUser(userId);
          const first = await rowsOf(userId);

          await snapshots.backfillUser(userId);

          expect(await rowsOf(userId)).toEqual(first);
        });
      });
    });

    it('DOES refine an earlier estimate with better data', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await createBoughtOn(userId, 'IWDA', 10, 100, daysAgo(3));
      // Earlier estimate with a value clearly different from the one recomputed now.
      await db.insert(portfolioSnapshots).values({
        userId,
        date: daysAgo(1),
        invested: '1000.00000000',
        marketValue: '1.00000000',
        valuedPositions: 1,
        totalPositions: 1,
        fxRates: { USD: 1 },
        estimated: true,
      });
      await cachePriceOn('IWDA', daysAgo(1), '150', 'EUR');

      await snapshots.backfillUser(userId);

      const row = firstItem(await rowsOf(userId));
      expect(row.marketValue).toBe('1500.00000000');
      expect(row.estimated).toBe(true);
    });

    it('removes baseless estimates (before the first trade) left by an old backfill', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await createBoughtOn(userId, 'IWDA', 10, 100, daysAgo(2));
      // Row written by the old backfill (today's quantity applied to days before the buy).
      await db.insert(portfolioSnapshots).values({
        userId,
        date: daysAgo(6),
        invested: '1000.00000000',
        marketValue: '1000.00000000',
        valuedPositions: 1,
        totalPositions: 1,
        fxRates: { USD: 1 },
        estimated: true,
      });
      await cachePriceOn('IWDA', daysAgo(2), '100', 'EUR');

      await snapshots.backfillUser(userId);

      expect((await rowsOf(userId)).map((r) => r.date)).toEqual([daysAgo(2), daysAgo(1)]);
    });

    it('if the rebuild comes out empty it does not delete existing estimates', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await createBoughtOn(userId, 'SINDATOS', 10, 100, daysAgo(3));
      await db.insert(portfolioSnapshots).values({
        userId,
        date: daysAgo(2),
        invested: '1000.00000000',
        marketValue: '1000.00000000',
        valuedPositions: 1,
        totalPositions: 1,
        fxRates: { USD: 1 },
        estimated: true,
      });

      await snapshots.backfillUser(userId);

      expect(await rowsOf(userId)).toHaveLength(1);
    });

    it('with no price available it writes no row (does not invent a value)', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await createBoughtOn(userId, 'SINDATOS', 10, 100, daysAgo(3));

      await snapshots.backfillUser(userId);

      expect(await rowsOf(userId)).toHaveLength(0);
    });

    it('a newly created position (lot dated today) generates no history', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await positions.create(userId, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });
      await cachePriceOn('IWDA', daysAgo(3), '100', 'EUR');

      await snapshots.backfillUser(userId);

      expect(await rowsOf(userId)).toHaveLength(0);
    });

    it('is idempotent: rebuilding twice leaves the same rows', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await createBoughtOn(userId, 'IWDA', 10, 100, daysAgo(3));
      for (const days of [3, 2, 1]) await cachePriceOn('IWDA', daysAgo(days), '100', 'EUR');

      await snapshots.backfillUser(userId);
      await snapshots.backfillUser(userId);

      expect(await rowsOf(userId)).toHaveLength(3);
    });

    it('writes a long series (more rows than the chunk size) without losing days', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await createBoughtOn(userId, 'IWDA', 10, 100, daysAgo(450));
      await db.insert(instrumentPrices).values(
        Array.from({ length: 450 }, (_, i) => ({
          symbol: 'IWDA',
          date: daysAgo(450 - i),
          close: '100',
          currency: 'EUR',
          source: 'test',
        })),
      );

      await snapshots.backfillUser(userId);

      const rows = await rowsOf(userId);
      expect(rows).toHaveLength(450);
      expect(itemAt(rows, 0).date).toBe(daysAgo(450));
      expect(rows.at(-1)?.date).toBe(daysAgo(1));
    });

    it("corrects a split: the raw quantity is expressed in today's shares and there is no jump", async () => {
      const userId = await insertUser(db, 'a@example.com');
      // 10 shares bought at 1000 before a 10:1 split; Yahoo returns already adjusted closes (100).
      await createBoughtOn(userId, 'NVDA', 10, 1000, daysAgo(6));
      for (const days of [5, 4, 3, 2, 1]) await cachePriceOn('NVDA', daysAgo(days), '100', 'EUR');
      await db.insert(instrumentSplits).values({ symbol: 'NVDA', date: daysAgo(3), ratio: '10' });

      await snapshots.backfillUser(userId);

      const rows = await rowsOf(userId);
      expect(rows.map((r) => r.marketValue)).toEqual(Array<string>(5).fill('10000.00000000'));
      expect(rows.map((r) => r.invested)).toEqual(Array<string>(5).fill('10000.00000000'));
    });

    it('an estimate between two real rows is updated without touching them, and the leftover is removed', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await createBoughtOn(userId, 'IWDA', 10, 100, daysAgo(6));
      for (const days of [6, 5, 4, 3, 2, 1]) await cachePriceOn('IWDA', daysAgo(days), '150', 'EUR');
      const seed = (days: number, marketValue: string, estimated: boolean) =>
        db.insert(portfolioSnapshots).values({
          userId,
          date: daysAgo(days),
          invested: '1000.00000000',
          marketValue,
          valuedPositions: 1,
          totalPositions: 1,
          fxRates: { USD: 1 },
          estimated,
        });
      await seed(5, '999.00000000', false); // real
      await seed(4, '1.00000000', true); // outdated estimate between real rows
      await seed(3, '998.00000000', false); // real
      await seed(20, '1.00000000', true); // leftover estimate (before the first trade)

      await snapshots.backfillUser(userId);

      const rows = await rowsOf(userId);
      const byDate = Object.fromEntries(rows.map((r) => [r.date, r]));
      expect(byDate[daysAgo(5)]).toMatchObject({ marketValue: '999.00000000', estimated: false });
      expect(byDate[daysAgo(3)]).toMatchObject({ marketValue: '998.00000000', estimated: false });
      expect(byDate[daysAgo(4)]).toMatchObject({ marketValue: '1500.00000000', estimated: true });
      expect(byDate[daysAgo(20)]).toBeUndefined();
    });

    it('a second pass with no changes rewrites no row', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await createBoughtOn(userId, 'IWDA', 10, 100, daysAgo(3));
      for (const days of [3, 2, 1]) await cachePriceOn('IWDA', daysAgo(days), '100', 'EUR');
      await snapshots.backfillUser(userId);
      const before = await rowsOf(userId);

      // `Date` is faked in this file: moving the clock forward is enough for a rewrite to change
      // `updatedAt` (set by the application with `new Date()`), without waiting in real time.
      vi.setSystemTime(new Date(Date.now() + 60_000));
      await snapshots.backfillUser(userId);

      expect((await rowsOf(userId)).map((r) => r.updatedAt)).toEqual(before.map((r) => r.updatedAt));
    });

    it('two concurrent rebuilds of the same user do not overwrite each other', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await createBoughtOn(userId, 'IWDA', 10, 100, daysAgo(3));
      for (const days of [3, 2, 1]) await cachePriceOn('IWDA', daysAgo(days), '100', 'EUR');

      await Promise.all([snapshots.backfillUser(userId), snapshots.backfillUser(userId)]);

      expect(await rowsOf(userId)).toHaveLength(3);
    });

    it('backfillAll skips users without positions, like captureAll', async () => {
      await insertUser(db, 'no-positions@example.com');

      await snapshots.backfillAll();

      expect(await db.select().from(portfolioSnapshots)).toHaveLength(0);
    });

    it('backfillAll backfills every user with positions', async () => {
      const a = await insertUser(db, 'a@example.com');
      const b = await insertUser(db, 'b@example.com');
      await createBoughtOn(a, 'IWDA', 10, 100, daysAgo(3));
      await createBoughtOn(b, 'IWDA', 5, 100, daysAgo(3));
      await cachePriceOn('IWDA', daysAgo(1), '100', 'EUR');

      await snapshots.backfillAll();

      const rows = await db.select().from(portfolioSnapshots);
      expect(new Set(rows.map((r) => r.userId))).toEqual(new Set([a, b]));
    });
  });

  describe('onPositionCreated', () => {
    /**
     * `@OnEvent` is only registered through the Nest-managed `EventEmitter2`
     * (`EventEmitterModule`, with `DiscoveryService` scanning providers); instantiating the
     * service by hand with `new` (as the rest of this file does) never fires the listener.
     * This test calls the method directly to cover ITS BODY (that `backfillUser` is invoked
     * and that a failure does not propagate), not the Nest wiring, which is only verified by
     * actually booting the app (`app.module.test.ts`).
     */
    it("rebuilds the history of the event's user", async () => {
      const userId = await insertUser(db, 'a@example.com');
      const { id } = await positions.create(userId, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });
      await db
        .update(positionLots)
        .set({ tradedAt: daysAgo(3) })
        .where(eq(positionLots.positionId, id));
      await cachePriceOn('IWDA', daysAgo(1), '100', 'EUR');

      await snapshots.onPositionCreated({ userId });

      const rows = await db.select().from(portfolioSnapshots).where(eq(portfolioSnapshots.userId, userId));
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.estimated)).toBe(true);
    });

    it('a backfill failure does not propagate (fault-tolerant)', async () => {
      // Non-existent user: `backfillUser` does not throw (it has no positions to read), so what
      // matters is that the method itself never rejects, whether or not there is data to backfill.
      await expect(
        snapshots.onPositionCreated({ userId: '00000000-0000-0000-0000-000000000000' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('onLotChanged', () => {
    it('rebuilds the series after adding a back-dated lot', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const { id } = await positions.create(userId, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });
      for (const days of [5, 4, 3, 2, 1]) await cachePriceOn('IWDA', daysAgo(days), '100', 'EUR');
      await db.insert(positionLots).values({
        positionId: id,
        userId,
        kind: 'buy',
        quantity: '5',
        price: '90',
        tradedAt: daysAgo(4),
      });

      await snapshots.onLotChanged({ userId, positionId: id });

      const rows = await db.select().from(portfolioSnapshots).where(eq(portfolioSnapshots.userId, userId));
      expect(rows.map((r) => r.date).sort()).toEqual([4, 3, 2, 1].map(daysAgo).sort());
    });

    it('a burst of changes is coalesced: few rebuilds and the correct final result', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const { id } = await positions.create(userId, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });
      await db
        .update(positionLots)
        .set({ tradedAt: daysAgo(4) })
        .where(eq(positionLots.positionId, id));
      for (const days of [4, 3, 2, 1]) await cachePriceOn('IWDA', daysAgo(days), '100', 'EUR');
      const rebuild = vi.spyOn(snapshots, 'backfillUser');

      await Promise.all(Array.from({ length: 20 }, () => snapshots.onLotChanged({ userId, positionId: id })));

      // The first pass and ONE repeat covering the remaining 19.
      expect(rebuild.mock.calls.length).toBeLessThanOrEqual(2);
      const rows = await db.select().from(portfolioSnapshots).where(eq(portfolioSnapshots.userId, userId));
      expect(rows).toHaveLength(4);
    });

    it('a failure does not propagate', async () => {
      await expect(
        snapshots.onLotChanged({
          userId: '00000000-0000-0000-0000-000000000000',
          positionId: '00000000-0000-0000-0000-000000000000',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('history', () => {
    /** Inserts an already closed snapshot, like those the cron would have left days ago. */
    async function seedSnapshot(
      userId: string,
      date: string,
      invested: string,
      marketValue: string,
      fxRates: Record<string, number>,
      estimated = false,
    ): Promise<void> {
      await db.insert(portfolioSnapshots).values({
        userId,
        date,
        invested,
        marketValue,
        valuedPositions: 1,
        totalPositions: 1,
        fxRates,
        estimated,
      });
    }

    it('exposes estimated: true/false per point', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await seedSnapshot(userId, daysAgo(2), '1000', '1100', { USD: 1, EUR: 1.1 }, true);
      await seedSnapshot(userId, daysAgo(1), '1000', '1200', { USD: 1, EUR: 1.2 }, false);

      const history = await snapshots.history(userId, 30);

      expect(history.points.map((p) => p.estimated)).toEqual([true, false]);
    });

    it('returns the series in EUR, oldest first, with its P&L', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await seedSnapshot(userId, daysAgo(2), '1000', '1100', { USD: 1, EUR: 1.1 });
      await seedSnapshot(userId, daysAgo(1), '1000', '1200', { USD: 1, EUR: 1.2 });

      const history = await snapshots.history(userId, 30);

      expect(history.base).toBe('EUR');
      expect(history.points.map((p) => p.marketValue)).toEqual([1100, 1200]);
      expect(history.points[1]).toMatchObject({ pnlAbs: 200, pnlPct: 20 });
    });

    it("re-expresses each point with ITS day's rates, not today's", async () => {
      const userId = await insertUser(db, 'a@example.com');
      await seedSnapshot(userId, daysAgo(2), '1000', '1000', { USD: 1, EUR: 1.1 });
      await seedSnapshot(userId, daysAgo(1), '1000', '1000', { USD: 1, EUR: 1.2 });

      const history = await snapshots.history(userId, 30, 'USD');

      expect(history.display).toBe('USD');
      // Same amount in EUR, different in USD: this is exactly what storing the rates enables.
      expect(history.points.map((p) => p.marketValue)).toEqual([1100, 1200]);
    });

    it('leaves the point null if there was no rate for the requested currency that day', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await seedSnapshot(userId, daysAgo(1), '1000', '1000', { USD: 1, EUR: 1.1 });

      const history = await snapshots.history(userId, 30, 'JPY');

      expect(history.points).toHaveLength(1);
      expect(history.points[0]).toMatchObject({ invested: null, marketValue: null, pnlAbs: null });
    });

    it('respects the day window and returns nothing earlier', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await seedSnapshot(userId, daysAgo(40), '1000', '1000', { USD: 1, EUR: 1.1 });
      await seedSnapshot(userId, daysAgo(2), '1000', '1200', { USD: 1, EUR: 1.1 });

      const history = await snapshots.history(userId, 7);

      expect(history.points).toHaveLength(1);
      expect(itemAt(history.points, 0).date).toBe(daysAgo(2));
    });

    it("only returns the user's own series", async () => {
      const userA = await insertUser(db, 'a@example.com');
      const userB = await insertUser(db, 'b@example.com');
      await seedSnapshot(userA, daysAgo(1), '1000', '1100', { USD: 1, EUR: 1.1 });

      expect((await snapshots.history(userB, 30)).points).toHaveLength(0);
      expect((await snapshots.history(userA, 30)).points).toHaveLength(1);
    });
  });
});
