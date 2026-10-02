import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../db/database.module.js';
import { incomeEvents, instrumentDividends, instrumentSplits, positions } from '../db/schema.js';
import type { PricesService } from '../prices/prices.service.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import { DividendResolutionService } from './dividend-resolution.service.js';

/** Resolución de símbolos fija: el ISIN de la posición → símbolo de Yahoo. */
const prices = {
  resolveCachedTickers: (tickers: string[]) =>
    Promise.resolve(
      new Map(
        tickers.flatMap((t): [string, string][] =>
          t === 'NL0010273215' ? [[t, 'ASML.AS']] : t === 'CH0038863350' ? [[t, 'NESN.SW']] : [],
        ),
      ),
    ),
} as unknown as PricesService;

describe('DividendResolutionService (integración con Postgres)', () => {
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
    const [position] = await db
      .insert(positions)
      .values({ userId, ticker, quantity: '1', avgPrice: '100', broker: 'Trade Republic' })
      .returning();
    const [row] = await db
      .insert(incomeEvents)
      .values({
        userId,
        positionId: position.id,
        kind: 'dividend',
        paidAt: '2025-08-06',
        country: ticker.slice(0, 2),
        gross: '1.36',
        withholdingSpain: '0.26',
        reportedToAeat: true,
        source: 'trade_republic',
        grossSource: 'broker',
        quantity: '1',
        ...values,
      })
      .returning();
    return row.id;
  }

  it('completa un dividendo neto de origen con el dividendo por acción de mercado (ASML)', async () => {
    const userId = await insertUser(db, 'a@example.com');
    // Lo que deja el importador: neto deshecho con el 15 %, como estimación.
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

  it('deshace el ajuste por splits posteriores y compara en la divisa de pago (Suiza)', async () => {
    const userId = await insertUser(db, 'a@example.com');
    // 10 acciones; abonados 19,83 CHF = 21,10 €, sin retención española (antes de la sucursal).
    const id = await dividend(userId, 'CH0038863350', {
      paidAt: '2025-04-25',
      gross: '21.1',
      withholdingSpain: '0',
      reportedToAeat: false,
      quantity: '10',
      originalAmount: '19.83',
      originalCurrency: 'CHF',
    });
    // Yahoo da 1,525 tras un split 2:1 posterior: el dividendo real fue 3,05 CHF por acción.
    await db
      .insert(instrumentDividends)
      .values({ symbol: 'NESN.SW', exDate: '2025-04-22', amount: '1.525', currency: 'CHF' });
    await db.insert(instrumentSplits).values({ symbol: 'NESN.SW', date: '2025-09-01', ratio: '2' });

    expect(await service.resolvePending(userId)).toBe(1);
    const [row] = await db.select().from(incomeEvents).where(eq(incomeEvents.id, id));
    expect(Number(row.gross)).toBeCloseTo(32.45, 2);
    expect(Number(row.withholdingOrigin)).toBeCloseTo(11.35, 2);
    expect(row.withholdingOriginSource).toBe('market');
  });

  it('no toca lo que no casa: otra divisa, sin dividendo cerca de la fecha o de otro usuario', async () => {
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

    expect(await service.resolvePending(a)).toBe(0);
    expect(await service.resolvePending(b)).toBe(0);
    for (const id of [wrongCurrency, tooOld]) {
      const [row] = await db.select().from(incomeEvents).where(eq(incomeEvents.id, id));
      expect(row.withholdingOrigin).toBeNull();
    }
  });
});
