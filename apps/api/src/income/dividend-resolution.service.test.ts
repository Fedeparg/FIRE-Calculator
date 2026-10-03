import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { firstItem } from '@sextante/core/arrays';

import type { Database } from '../db/database.module.js';
import { incomeEvents, instrumentDividends, instrumentSplits } from '../db/schema.js';
import type { PriceReadService } from '../prices/price-read.service.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import { DividendResolutionService } from './dividend-resolution.service.js';
import { makeIncome, seedPosition, stub } from '../../test/factories.js';

/** Fixed symbol resolution: the position's ISIN → Yahoo symbol. */
const prices = stub<PriceReadService>({
  resolveCachedTickers: (tickers: string[]) =>
    Promise.resolve(
      new Map(
        tickers.flatMap((t): [string, string][] =>
          t === 'NL0010273215' ? [[t, 'ASML.AS']] : t === 'CH0038863350' ? [[t, 'NESN.SW']] : [],
        ),
      ),
    ),
});

describe('DividendResolutionService (Postgres integration)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let service: DividendResolutionService;

  beforeAll(() => {
    ({ db, close } = createTestDb());
    service = new DividendResolutionService(db, prices);
  });
  afterEach(() => resetDb(db));
  afterAll(() => close());

  async function dividend(
    userId: string,
    ticker: string,
    values: Partial<typeof incomeEvents.$inferInsert>,
  ): Promise<string> {
    const position = await seedPosition(db, userId, {
      ticker,
      quantity: '1',
      avgPrice: '100',
      broker: 'Trade Republic',
    });
    const row = firstItem(
      await db
        .insert(incomeEvents)
        .values(
          makeIncome(userId, {
            positionId: position.id,
            country: ticker.slice(0, 2),
            gross: '1.36',
            withholdingSpain: '0.26',
            reportedToAeat: true,
            source: 'trade_republic',
            grossSource: 'broker',
            quantity: '1',
            ...values,
          }),
        )
        .returning(),
    );
    return row.id;
  }

  it('completes a dividend net of origin withholding with the market dividend per share (ASML)', async () => {
    const userId = await insertUser(db, 'a@example.com');
    // What the importer leaves: net amount grossed up at 15 %, as an estimate.
    const id = await dividend(userId, 'NL0010273215', {
      gross: '1.6',
      grossSource: 'estimate',
      withholdingOrigin: '0.24',
      withholdingOriginSource: 'estimate',
    });
    await db.insert(instrumentDividends).values([
      { symbol: 'ASML.AS', exDate: '2025-04-25', amount: '1.84', currency: 'EUR' },
      { symbol: 'ASML.AS', exDate: '2025-07-28', amount: '1.6', currency: 'EUR' },
    ]);

    expect(await service.resolvePending(userId)).toBe(1);
    const [row] = await db.select().from(incomeEvents).where(eq(incomeEvents.id, id));
    expect(row).toMatchObject({
      gross: '1.600000',
      grossSource: 'market',
      withholdingOrigin: '0.240000',
      withholdingOriginSource: 'market',
      withholdingSpain: '0.260000',
    });
  });

  it('undoes the adjustment for later splits and compares in the payment currency (Switzerland)', async () => {
    const userId = await insertUser(db, 'a@example.com');
    // 10 shares; CHF 19.83 = €21.10 paid out, with no Spanish withholding (before the branch).
    const id = await dividend(userId, 'CH0038863350', {
      paidAt: '2025-04-25',
      gross: '21.1',
      withholdingSpain: '0',
      reportedToAeat: false,
      quantity: '10',
      originalAmount: '19.83',
      originalCurrency: 'CHF',
    });
    // Yahoo reports 1.525 after a later 2:1 split: the real dividend was CHF 3.05 per share.
    await db
      .insert(instrumentDividends)
      .values({ symbol: 'NESN.SW', exDate: '2025-04-22', amount: '1.525', currency: 'CHF' });
    await db.insert(instrumentSplits).values({ symbol: 'NESN.SW', date: '2025-09-01', ratio: '2' });

    expect(await service.resolvePending(userId)).toBe(1);
    const row = firstItem(await db.select().from(incomeEvents).where(eq(incomeEvents.id, id)));
    expect(Number(row.gross)).toBeCloseTo(32.45, 2);
    expect(Number(row.withholdingOrigin)).toBeCloseTo(11.35, 2);
    expect(row.withholdingOriginSource).toBe('market');
  });

  it('without matching market data (other currency, out of range) it falls back to the estimate, not the market', async () => {
    const a = await insertUser(db, 'a@example.com');
    const b = await insertUser(db, 'b@example.com');
    const wrongCurrency = await dividend(a, 'CH0038863350', { originalAmount: '1.2', originalCurrency: 'USD' });
    await db
      .insert(instrumentDividends)
      .values({ symbol: 'NESN.SW', exDate: '2025-07-28', amount: '3.05', currency: 'CHF' });
    const tooOld = await dividend(b, 'NL0010273215', { paidAt: '2025-12-31' });
    await db
      .insert(instrumentDividends)
      .values({ symbol: 'ASML.AS', exDate: '2025-07-28', amount: '1.6', currency: 'EUR' });

    // No market data matches: both end up estimated with the statutory rate (Switzerland, Netherlands).
    expect(await service.resolvePending(a)).toBe(1);
    expect(await service.resolvePending(b)).toBe(1);
    for (const id of [wrongCurrency, tooOld]) {
      const row = firstItem(await db.select().from(incomeEvents).where(eq(incomeEvents.id, id)));
      expect(row.withholdingOriginSource).toBe('estimate');
    }
  });

  it("without market data, estimates with the country's statutory rate and flags it as an estimate", async () => {
    const userId = await insertUser(db, 'a@example.com');
    // Germany: 26.375 %. €7.36 net paid out, with the Spanish 19 % (€1.40).
    const id = await dividend(userId, 'DE0007164600', { gross: '7.36', withholdingSpain: '1.4' });

    expect(await service.resolvePending(userId)).toBe(1);
    const row = firstItem(await db.select().from(incomeEvents).where(eq(incomeEvents.id, id)));
    expect(Number(row.gross)).toBeCloseTo(10, 2);
    expect(Number(row.withholdingOrigin)).toBeCloseTo(2.64, 2);
    expect(row).toMatchObject({ grossSource: 'estimate', withholdingOriginSource: 'estimate' });
    // Running it again does not change it.
    expect(await service.resolvePending(userId)).toBe(0);
  });
});
