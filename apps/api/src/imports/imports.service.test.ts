import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TRADE_REPUBLIC_HEADER } from '@sextante/core/imports/trade-republic';
import { asc, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../db/database.module.js';
import { incomeEvents, positionLots, positions } from '../db/schema.js';
import type { DividendResolutionService } from '../income/dividend-resolution.service.js';
import { IncomeService } from '../income/income.service.js';
import { LOT_CHANGED_EVENT } from '../positions/position-events.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import { buildPositionsStack, pricesStub } from '../../test/positions-stack.js';
import { ImportsService } from './imports.service.js';
import { PostImportTasks } from './post-import.tasks.js';
import { TradeImportWriter } from './trade-import.writer.js';
import { TRADE_REPUBLIC_BROKER } from './trade-republic-import.model.js';
import { TradeRepublicImportPlanner } from './trade-republic-import.planner.js';
import { firstItem, itemAt } from '@sextante/core/arrays';
import { stub } from '../../test/factories.js';

/** La resolución con datos de mercado tiene su propio test; aquí no hace nada. */
const dividendsStub = stub<DividendResolutionService>({ resolvePending: () => Promise.resolve(0) });

/** El grafo de la importación tal y como lo cablea Nest, con precios y dividendos en no-op. */
function buildImportsService(db: Database, events: EventEmitter2 = new EventEmitter2()): ImportsService {
  const income = new IncomeService(db);
  return new ImportsService(
    new TradeRepublicImportPlanner(db, income),
    new TradeImportWriter(db, buildPositionsStack(db).lots, income),
    new PostImportTasks(pricesStub, events, dividendsStub),
    events,
  );
}

type Fields = Partial<Record<(typeof TRADE_REPUBLIC_HEADER)[number], string>>;

const ETF = 'ZZ00EXAMPL01';
const STOCK = 'ZZ00STOCK002';
const DERIVATIVE = 'ZZ00DERIV003';

let counter = 0;

/** Una fila de operación sintética. `day` (1-28) fija fecha e instante; el id es único. */
function trade(
  kind: 'BUY' | 'SELL',
  isin: string,
  shares: string,
  price: string,
  day: number,
  extra: Fields = {},
): string {
  const date = `2025-03-${String(day).padStart(2, '0')}`;
  const signed = kind === 'SELL' ? `-${shares}` : shares;
  const fields: Fields = {
    datetime: `${date}T10:00:00.123456Z`,
    date,
    account_type: 'DEFAULT',
    category: 'TRADING',
    type: kind,
    asset_class: isin === DERIVATIVE ? 'DERIVATIVE' : isin === ETF ? 'FUND' : 'STOCK',
    name: `Instrument ${isin}`,
    symbol: isin,
    shares: signed,
    price,
    currency: 'EUR',
    transaction_id: `00000000-0000-0000-0000-${String(++counter).padStart(12, '0')}`,
    ...extra,
  };
  return TRADE_REPUBLIC_HEADER.map((column) => `"${fields[column] ?? ''}"`).join(',');
}

function csv(...rows: string[]): string {
  const header = TRADE_REPUBLIC_HEADER.map((column) => `"${column}"`).join(',');
  return `${[header, ...rows].join('\n')}\n`;
}

describe('ImportsService (integración con Postgres)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let service: ImportsService;

  beforeAll(() => {
    ({ db, close } = createTestDb());
    service = buildImportsService(db);
  });

  afterEach(async () => {
    await resetDb(db);
  });

  afterAll(async () => {
    await close();
  });

  async function positionsOf(userId: string) {
    return db.select().from(positions).where(eq(positions.userId, userId));
  }

  async function lotsOf(userId: string) {
    return db
      .select()
      .from(positionLots)
      .where(eq(positionLots.userId, userId))
      .orderBy(asc(positionLots.tradedAt), asc(positionLots.createdAt));
  }

  it('crea la posición con ticker = ISIN, bróker, divisa EUR y lotes con comisiones e id externo', async () => {
    const userId = await insertUser(db, 'a@example.com');
    const result = await service.confirm(
      userId,
      csv(trade('BUY', ETF, '2', '100', 3, { fee: '-1.00' }), trade('BUY', ETF, '2', '110', 5)),
    );

    expect(result.totals).toEqual({ lotsCreated: 2, duplicates: 0, failedPositions: 0 });
    expect(result.positions[0]).toMatchObject({ isin: ETF, status: 'created', lotsCreated: 2, quantity: 4 });

    const [position] = await positionsOf(userId);
    expect(position).toMatchObject({
      ticker: ETF,
      name: `Instrument ${ETF}`,
      broker: TRADE_REPUBLIC_BROKER,
      currency: 'EUR',
      quantity: '4.000000',
      avgPrice: '105.000000',
    });

    const lots = await lotsOf(userId);
    expect(lots).toHaveLength(2);
    expect(lots[0]).toMatchObject({ kind: 'buy', fees: '1.000000', tradedAt: '2025-03-03' });
    expect(itemAt(lots, 0).externalId).toMatch(/^trade-republic:00000000-/);
    // Los lotes manuales no llevan id externo: aquí solo hay importados.
    expect(lots.every((lot) => lot.externalId !== null)).toBe(true);
  });

  it('amplía una posición existente de Trade Republic en vez de fallar por duplicada', async () => {
    const userId = await insertUser(db, 'a@example.com');
    const existing = firstItem(
      await db
        .insert(positions)
        .values({ userId, ticker: ETF, quantity: '0', avgPrice: '0', broker: 'trade republic', currency: 'EUR' })
        .returning(),
    );
    await db.insert(positionLots).values({
      positionId: existing.id,
      userId,
      kind: 'buy',
      quantity: '1',
      price: '90',
      tradedAt: '2025-01-01',
    });
    await db.update(positions).set({ quantity: '1', avgPrice: '90' }).where(eq(positions.id, existing.id));

    const plan = await service.preview(userId, csv(trade('BUY', ETF, '1', '110', 3)));
    // Coste medio con los precios de ejecución: (90 + 110) / 2.
    expect(plan.positions[0]).toMatchObject({
      action: 'extend',
      currentQuantity: 1,
      resultingQuantity: 2,
      resultingAvgPrice: 100,
    });

    const result = await service.confirm(userId, csv(trade('BUY', ETF, '1', '110', 3)));
    expect(itemAt(result.positions, 0).status).toBe('extended');

    const all = await positionsOf(userId);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: existing.id, quantity: '2.000000', avgPrice: '100.000000' });
  });

  it('importar sobre una posición existente emite LOT_CHANGED_EVENT (y sobre una nueva, no)', async () => {
    const events = new EventEmitter2();
    const emitted: unknown[] = [];
    events.on(LOT_CHANGED_EVENT, (payload: unknown) => emitted.push(payload));
    const svc = buildImportsService(db, events);
    const userId = await insertUser(db, 'a@example.com');

    await svc.confirm(userId, csv(trade('BUY', ETF, '1', '100', 1)));
    expect(emitted).toEqual([]);

    const second = trade('BUY', ETF, '2', '100', 2);
    await svc.confirm(userId, csv(second));
    const position = firstItem(await positionsOf(userId));
    expect(emitted).toEqual([{ userId, positionId: position.id }]);

    // Reimportar sin lotes nuevos no emite.
    await svc.confirm(userId, csv(second));
    expect(emitted).toHaveLength(1);
  });

  it('una venta parcial deja el precio medio y la cantidad restante correctos', async () => {
    const userId = await insertUser(db, 'a@example.com');
    await service.confirm(
      userId,
      csv(
        trade('BUY', STOCK, '10', '50', 3),
        trade('BUY', STOCK, '10', '70', 4),
        trade('SELL', STOCK, '5', '90', 5),
        trade('BUY', STOCK, '5', '100', 6),
      ),
    );
    // Coste medio móvil (la semántica de `lot-aggregate.ts`): 20 a 60 de media; la venta de 5
    // retira coste al medio (no cambia) y la última compra lo recalcula: (900 + 500) / 20.
    const [position] = await positionsOf(userId);
    expect(position).toMatchObject({ quantity: '20.000000', avgPrice: '70.000000' });
  });

  it('respeta el orden de ejecución dentro del mismo día', async () => {
    const userId = await insertUser(db, 'a@example.com');
    // La venta va ANTES de la compra el mismo día solo si su instante es anterior: con un orden
    // de inserción arbitrario daría cantidad negativa.
    const result = await service.confirm(
      userId,
      csv(
        trade('BUY', STOCK, '5', '10', 3, { datetime: '2025-03-03T08:00:00.000000Z' }),
        trade('SELL', STOCK, '5', '12', 3, { datetime: '2025-03-03T09:00:00.000000Z' }),
        trade('BUY', STOCK, '3', '11', 3, { datetime: '2025-03-03T10:00:00.000000Z' }),
      ),
    );
    expect(result.totals.failedPositions).toBe(0);
    const [position] = await positionsOf(userId);
    expect(position).toMatchObject({ quantity: '3.000000', avgPrice: '11.000000' });
  });

  it('reimportar el mismo fichero no cambia nada', async () => {
    const userId = await insertUser(db, 'a@example.com');
    const file = csv(trade('BUY', ETF, '2', '100', 3), trade('SELL', ETF, '1', '120', 4));

    await service.confirm(userId, file);
    const before = { positions: await positionsOf(userId), lots: await lotsOf(userId) };

    const again = await service.confirm(userId, file);
    expect(again.totals).toEqual({ lotsCreated: 0, duplicates: 2, failedPositions: 0 });
    expect(itemAt(again.positions, 0).status).toBe('unchanged');
    expect({ positions: await positionsOf(userId), lots: await lotsOf(userId) }).toEqual(before);

    const plan = await service.preview(userId, file);
    expect(plan.totals).toEqual({ newLots: 0, duplicates: 2 });
    expect(plan.positions[0]).toMatchObject({ newBuys: 0, newSells: 0, duplicates: 2 });
  });

  it('importa solo las operaciones nuevas de un fichero que amplía el anterior', async () => {
    const userId = await insertUser(db, 'a@example.com');
    const first = trade('BUY', ETF, '2', '100', 3);
    await service.confirm(userId, csv(first));

    const result = await service.confirm(userId, csv(first, trade('BUY', ETF, '1', '130', 9)));
    expect(result.totals).toEqual({ lotsCreated: 1, duplicates: 1, failedPositions: 0 });
    const position = firstItem(await positionsOf(userId));
    expect(position.quantity).toBe('3.000000');
  });

  it('revierte solo la posición cuya cantidad quedaría negativa y confirma el resto', async () => {
    const userId = await insertUser(db, 'a@example.com');
    const file = csv(
      trade('BUY', ETF, '2', '100', 3),
      trade('SELL', STOCK, '5', '10', 4), // vende sin haber comprado
      trade('BUY', STOCK, '1', '10', 5),
    );

    const plan = await service.preview(userId, file);
    const blocked = plan.positions.find((p) => p.isin === STOCK);
    expect(blocked).toMatchObject({ blockedBy: 'NEGATIVE_QUANTITY', resultingQuantity: null, resultingAvgPrice: null });

    const result = await service.confirm(userId, file);
    expect(result.totals.failedPositions).toBe(1);
    expect(result.positions.find((p) => p.isin === STOCK)).toMatchObject({
      status: 'failed',
      failure: 'NEGATIVE_QUANTITY',
      lotsCreated: 0,
    });
    expect(result.positions.find((p) => p.isin === ETF)?.status).toBe('created');

    // La posición fallida no deja nada (ni la posición ni sus lotes).
    expect((await positionsOf(userId)).map((p) => p.ticker)).toEqual([ETF]);
    expect(await lotsOf(userId)).toHaveLength(1);
  });

  it('aísla a los usuarios: mismo fichero, cada uno con sus lotes', async () => {
    const userA = await insertUser(db, 'a@example.com');
    const userB = await insertUser(db, 'b@example.com');
    const file = csv(trade('BUY', ETF, '2', '100', 3));

    await service.confirm(userA, file);
    // Para B el fichero es nuevo aunque A ya haya importado esos mismos ids.
    const plan = await service.preview(userB, file);
    expect(plan.positions[0]).toMatchObject({ action: 'create', duplicates: 0, newBuys: 1 });
    const resultB = await service.confirm(userB, file);

    expect(resultB.totals.lotsCreated).toBe(1);
    expect(await lotsOf(userA)).toHaveLength(1);
    expect(await lotsOf(userB)).toHaveLength(1);
    expect(firstItem(await positionsOf(userB)).quantity).toBe('2.000000');
  });

  it('la vista previa no escribe nada y marca los derivados como "precio posiblemente no disponible"', async () => {
    const userId = await insertUser(db, 'a@example.com');
    const plan = await service.preview(
      userId,
      csv(
        trade('BUY', DERIVATIVE, '100', '1.23', 3),
        trade('SELL', DERIVATIVE, '100', '1.5', 4),
        trade('BUY', ETF, '1', '100', 3),
      ),
    );

    expect(plan.positions.find((p) => p.isin === DERIVATIVE)).toMatchObject({
      action: 'create',
      newBuys: 1,
      newSells: 1,
      resultingQuantity: 0,
      isDerivative: true,
    });
    expect(plan.positions.find((p) => p.isin === ETF)?.isDerivative).toBe(false);
    expect(await positionsOf(userId)).toEqual([]);
    expect(await lotsOf(userId)).toEqual([]);
  });

  it('guarda los derivados con la marca isDerivative y no el resto', async () => {
    const userId = await insertUser(db, 'a@example.com');
    await service.confirm(userId, csv(trade('BUY', DERIVATIVE, '100', '1.23', 3), trade('BUY', ETF, '1', '100', 3)));
    const rows = await positionsOf(userId);
    expect(rows.find((p) => p.ticker === DERIVATIVE)?.isDerivative).toBe(true);
    expect(rows.find((p) => p.ticker === ETF)?.isDerivative).toBe(false);
  });

  it('un exceso de redondeo al vender todo deja la posición en 0 en vez de fallar', async () => {
    const userId = await insertUser(db, 'a@example.com');
    // 0.0000004 + 0.0000004 se guardan como 0 + 0, pero 1.0000004 + 1.0000004 = 2.000000 (6 dp)
    // mientras la venta de 2.0000009 redondea a 2.000001: 1 unidad de más, dentro de la tolerancia.
    const result = await service.confirm(
      userId,
      csv(
        trade('BUY', ETF, '1.0000004', '10', 3),
        trade('BUY', ETF, '1.0000004', '10', 4),
        trade('SELL', ETF, '2.0000009', '11', 5),
      ),
    );
    expect(result.totals.failedPositions).toBe(0);
    expect(firstItem(await positionsOf(userId)).quantity).toBe('0.000000');
  });

  it('resume las filas descartadas por motivo y propaga los avisos, solo con recuentos', async () => {
    const userId = await insertUser(db, 'a@example.com');
    const plan = await service.preview(
      userId,
      csv(
        trade('BUY', ETF, '1', '100', 3, { tax: '-0.30' }),
        trade('BUY', ETF, '1', '100', 4, { type: 'CARD_TRANSACTION', shares: '', price: '' }),
        trade('BUY', ETF, '1', '100', 5, { type: 'CARD_TRANSACTION', shares: '', price: '' }),
        trade('BUY', ETF, '1', '100', 6, { type: 'IPO_SUBSCRIPTION', shares: '', price: '' }),
      ),
    );
    expect(plan.skipped).toEqual([
      { reason: 'cash_movement', count: 2 },
      { reason: 'ipo_subscription', count: 1 },
    ]);
    expect(plan.warnings).toEqual([{ code: 'trade_tax_ignored', count: 1 }]);
  });

  it('rechaza ficheros que no son de Trade Republic con un código estable', async () => {
    const userId = await insertUser(db, 'a@example.com');
    const error = await service.preview(userId, 'a,b\n1,2\n').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({ code: 'NOT_TRADE_REPUBLIC' });
  });
});

describe('ImportsService — cobros (integración con Postgres)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let service: ImportsService;

  beforeAll(() => {
    ({ db, close } = createTestDb());
    service = buildImportsService(db);
  });
  afterEach(() => resetDb(db));
  afterAll(() => close());

  const positionsOf = (userId: string) => db.select().from(positions).where(eq(positions.userId, userId));

  const interest = (date: string, amount: string, tax: string) =>
    trade('BUY', ETF, '', '', 1, {
      datetime: `${date}T22:00:00.000000Z`,
      date,
      category: 'CASH',
      type: 'INTEREST_PAYMENT',
      asset_class: '',
      name: '',
      symbol: '',
      shares: '',
      price: '',
      amount,
      tax,
    });

  it('la vista previa cuenta los cobros sin escribirlos y la confirmación los guarda una sola vez', async () => {
    const userId = await insertUser(db, 'a@example.com');
    const file = csv(
      interest('2025-01-01', '1.48', ''),
      interest('2025-07-01', '1.50', '-0.29'),
      trade('BUY', ETF, '1', '100', 3),
    );

    const plan = await service.preview(userId, file);
    expect(plan.income).toEqual({ created: 2, duplicates: 0, reportedToAeat: 1 });
    expect(await db.select().from(incomeEvents)).toEqual([]);

    const first = await service.confirm(userId, file);
    expect(first.income).toEqual({ created: 2, duplicates: 0, reportedToAeat: 1 });
    const rows = await db.select().from(incomeEvents).orderBy(asc(incomeEvents.paidAt));
    expect(rows.map((r) => [r.kind, r.paidAt, r.gross, r.withholdingSpain, r.reportedToAeat, r.positionId])).toEqual([
      ['interest', '2025-01-01', '1.480000', '0.000000', false, null],
      ['interest', '2025-06-30', '1.500000', '0.290000', true, null],
    ]);
    expect(
      rows.every(
        (r) => r.userId === userId && r.source === 'trade_republic' && r.externalId?.startsWith('trade-republic:'),
      ),
    ).toBe(true);

    const again = await service.confirm(userId, file);
    expect(again.income).toEqual({ created: 0, duplicates: 2, reportedToAeat: 0 });
    expect(await db.select().from(incomeEvents)).toHaveLength(2);
  });

  it('enlaza un dividendo con la posición de Trade Republic de su ISIN, aunque se cree en la misma importación', async () => {
    const userId = await insertUser(db, 'a@example.com');
    await service.confirm(
      userId,
      csv(
        trade('BUY', STOCK, '1', '100', 2),
        trade('BUY', STOCK, '', '', 9, {
          category: 'CASH',
          type: 'DIVIDEND',
          shares: '1',
          price: '',
          amount: '1.36',
          tax: '',
        }),
      ),
    );
    const position = firstItem(await positionsOf(userId));
    const [row] = await db.select().from(incomeEvents);
    expect(row).toMatchObject({ kind: 'dividend', isin: STOCK, positionId: position.id, gross: '1.360000' });
  });

  it('guarda la clase de activo del bróker en las posiciones, también en las que no la tenían', async () => {
    const FIRST_ETF_ID = '00000000-0000-0000-0000-00000000e7f1';
    const FIRST_DERIVATIVE_ID = '00000000-0000-0000-0000-00000000de71';
    const userId = await insertUser(db, 'a@example.com');
    await service.confirm(
      userId,
      csv(
        trade('BUY', ETF, '1', '100', 1, { transaction_id: FIRST_ETF_ID }),
        trade('BUY', DERIVATIVE, '1', '10', 1, { transaction_id: FIRST_DERIVATIVE_ID }),
      ),
    );
    await db.update(positions).set({ assetClass: null });
    // El mismo fichero otra vez: no hay operaciones nuevas, pero la clase de activo se completa.
    await service.confirm(
      userId,
      csv(
        trade('BUY', ETF, '1', '100', 1, { transaction_id: FIRST_ETF_ID }),
        trade('BUY', DERIVATIVE, '1', '10', 1, { transaction_id: FIRST_DERIVATIVE_ID }),
      ),
    );

    const byTicker = new Map((await positionsOf(userId)).map((p) => [p.ticker, p.assetClass]));
    expect(byTicker.get(ETF)).toBe('fund');
    expect(byTicker.get(DERIVATIVE)).toBe('derivative');
  });

  it('los cobros de un usuario no chocan con los mismos ids de otro', async () => {
    const a = await insertUser(db, 'a@example.com');
    const b = await insertUser(db, 'b@example.com');
    const file = csv(interest('2025-01-01', '1.48', ''));
    await service.confirm(a, file);
    expect((await service.confirm(b, file)).income.created).toBe(1);
  });
});
