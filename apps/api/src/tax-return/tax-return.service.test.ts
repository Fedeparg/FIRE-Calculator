import { EventEmitter2 } from '@nestjs/event-emitter';
import { itemAt } from '@sextante/core/arrays';
import type { ReferenceRates } from '@sextante/core/fiscal/fx-reference';
import { buildIncomeReport, type IncomeEvent } from '@sextante/core/fiscal/income';
import { buildRealisedGainsReport, type RealisedGainsPosition } from '@sextante/core/fiscal/realised-gains';
import { buildSavingsReturns } from '@sextante/core/fiscal/savings-return';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import type { Database } from '../db/database.module.js';
import { positionLots } from '../db/schema.js';
import type { ReferenceRatesService } from '../fx-reference/reference-rates.service.js';
import { IncomeService } from '../income/income.service.js';
import { PositionLotsService } from '../positions/position-lots.service.js';
import { PositionsService } from '../positions/positions.service.js';
import { PendingBalancesService } from './pending-balances.service.js';
import { TaxReturnService } from './tax-return.service.js';
import { makeLot, seedPosition, stub } from '../../test/factories.js';

const RATES: ReferenceRates = {
  USD: [
    { date: '2024-03-01', unitsPerEur: 1.08 },
    { date: '2025-02-10', unitsPerEur: 1.04 },
    { date: '2025-08-14', unitsPerEur: 1.16 },
  ],
};

describe('TaxReturnService (Postgres integration)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let service: TaxReturnService;
  let income: IncomeService;
  let pending: PendingBalancesService;
  const getRates = vi.fn();

  beforeAll(() => {
    ({ db, close } = createTestDb());
    const lots = new PositionLotsService(db, new EventEmitter2());
    // `PositionsService` is only used here for reads: the live price plays no part.
    const positionsService = new PositionsService(db, {} as never, lots, new EventEmitter2());
    income = new IncomeService(db);
    pending = new PendingBalancesService(db);
    service = new TaxReturnService(
      positionsService,
      lots,
      income,
      pending,
      stub<ReferenceRatesService>({
        getRates,
      }),
    );
  });
  afterEach(async () => {
    getRates.mockReset();
    await resetDb(db);
  });
  afterAll(() => close());

  async function seedPositionId(userId: string, ticker: string, currency: 'EUR' | 'USD'): Promise<string> {
    return (await seedPosition(db, userId, { ticker, currency })).id;
  }

  async function seedLots(
    userId: string,
    positionId: string,
    rows: { kind: 'buy' | 'sell'; quantity: number; price: number; tradedAt: string }[],
  ) {
    await db.insert(positionLots).values(
      rows.map((r) =>
        makeLot(userId, positionId, {
          kind: r.kind,
          quantity: String(r.quantity),
          price: String(r.price),
          tradedAt: r.tradedAt,
        }),
      ),
    );
  }

  it('matches what the core computes from the same data (sales, payments and pending balance)', async () => {
    const userId = await insertUser(db, 'a@example.com');
    const eur = await seedPositionId(userId, 'IWDA', 'EUR');
    const usd = await seedPositionId(userId, 'AAPL', 'USD');
    await seedLots(userId, eur, [
      { kind: 'buy', quantity: 10, price: 100, tradedAt: '2023-05-01' },
      { kind: 'sell', quantity: 10, price: 90, tradedAt: '2025-03-01' },
    ]);
    await seedLots(userId, usd, [
      { kind: 'buy', quantity: 5, price: 150, tradedAt: '2024-03-01' },
      { kind: 'sell', quantity: 5, price: 200, tradedAt: '2025-02-10' },
    ]);
    await income.create(userId, {
      kind: 'dividend',
      paidAt: '2025-08-14',
      country: 'US',
      currency: 'USD',
      gross: 10,
      withholdingOrigin: 1.5,
      withholdingSpain: 0,
      positionId: usd,
    });
    await income.create(userId, { kind: 'interest', paidAt: '2025-12-31', gross: 40 });
    // 2023 loss pending offset, entered by hand.
    await pending.replace(userId, { balances: [{ originYear: 2023, kind: 'gains', amount: 300 }] });
    getRates.mockResolvedValue(RATES);

    const report = await service.build(userId, 2025);

    expect(getRates).toHaveBeenCalledWith(['USD'], '2024-03-01');

    // The same, computed by hand with the core on the data read from the database.
    const lotRows = await new PositionLotsService(db, new EventEmitter2()).findAllByUser(userId);
    const input: RealisedGainsPosition[] = [
      { id: eur, ticker: 'IWDA', name: null, currency: 'EUR', lots: lotRows.filter((l) => l.positionId === eur) },
      { id: usd, ticker: 'AAPL', name: null, currency: 'USD', lots: lotRows.filter((l) => l.positionId === usd) },
    ];
    const events: IncomeEvent[] = await income.list(userId);
    const gains = buildRealisedGainsReport(input, RATES).years;
    const incomeYears = buildIncomeReport(events, RATES).years;
    const [expected] = buildSavingsReturns({
      gains,
      income: incomeYears,
      incomeEvents: events,
      rates: RATES,
      manualPending: [{ originYear: 2023, kind: 'gains', amount: 300 }],
    });

    expect(report.year).toBe(2025);
    expect(report.availableYears).toEqual([2025]);
    expect(report.ratesLoaded).toBe(true);
    expect(report.savings).toEqual(expected);
    expect(report.gains).toEqual(gains[0]);
    expect(report.income).toEqual(incomeYears[0]);
    // Sanity: the sales, payments and pending balance really affect the result.
    expect(report.gains?.sales).toHaveLength(2);
    expect(report.incomeEvents.map((e) => e.grossSource)).toEqual(['manual', 'manual']);
    expect(report.savings?.savingsBase.pending).toBeDefined();
    expect(report.savings?.gainsBalance).toBeCloseTo(itemAt(gains, 0).total, 9);
    // Provenance of the sales: the applied ECB rate.
    expect(report.gains?.sales.find((s) => s.currency === 'USD')?.eur?.sellRate).toMatchObject({
      unitsPerEur: 1.04,
      date: '2025-02-10',
    });
  });

  it('without a requested year it uses the latest with data; with no data or an empty year it returns null', async () => {
    const userId = await insertUser(db, 'a@example.com');
    const empty = await service.build(userId);
    expect(empty).toMatchObject({
      year: null,
      availableYears: [],
      gains: null,
      income: null,
      savings: null,
      incomeEvents: [],
    });
    expect(getRates).not.toHaveBeenCalled();

    await income.create(userId, { kind: 'interest', paidAt: '2024-06-30', gross: 12 });
    await income.create(userId, { kind: 'interest', paidAt: '2022-06-30', gross: 5 });
    const latest = await service.build(userId);
    expect(latest.year).toBe(2024);
    expect(latest.availableYears).toEqual([2024, 2022]);
    expect(latest.gains).toBeNull();
    expect(latest.savings?.capitalIncomeBalance).toBe(12);
    expect(latest.incomeEvents.map((e) => e.paidAt)).toEqual(['2024-06-30']);

    const gap = await service.build(userId, 2023);
    expect(gap).toMatchObject({ year: 2023, gains: null, income: null, savings: null, incomeEvents: [] });
  });

  it('if the ECB rates fail the report still renders with foreign-currency amounts unconverted', async () => {
    const userId = await insertUser(db, 'a@example.com');
    const usd = await seedPositionId(userId, 'AAPL', 'USD');
    await seedLots(userId, usd, [
      { kind: 'buy', quantity: 1, price: 100, tradedAt: '2025-01-10' },
      { kind: 'sell', quantity: 1, price: 120, tradedAt: '2025-02-10' },
    ]);
    getRates.mockRejectedValue(new Error('ECB down'));

    const report = await service.build(userId, 2025);
    expect(report.ratesLoaded).toBe(false);
    expect(report.gains?.unconverted).toEqual([{ currency: 'USD', sales: 1, gain: 20 }]);
    expect(report.savings?.incomplete).toBe(true);
  });

  it('isolates data per user', async () => {
    const a = await insertUser(db, 'a@example.com');
    const b = await insertUser(db, 'b@example.com');
    await income.create(a, { kind: 'interest', paidAt: '2025-06-30', gross: 12 });
    await pending.replace(a, { balances: [{ originYear: 2023, kind: 'gains', amount: 300 }] });

    expect(await service.build(b, 2025)).toMatchObject({ availableYears: [], income: null, savings: null });
  });
});
