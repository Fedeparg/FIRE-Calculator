import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TRADE_REPUBLIC_HEADER } from '@sextante/core/imports/trade-republic';
import { asc, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../db/database.module.js';
import { positionLots, positions } from '../db/schema.js';
import { PositionLotsService } from '../positions/position-lots.service.js';
import type { PricesService } from '../prices/prices.service.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import { ImportsService, TRADE_REPUBLIC_BROKER } from './imports.service.js';

/** `primeSymbol` solo refresca precios en caliente; en tests es un no-op. */
const pricesStub = { primeSymbol: async () => {} } as unknown as PricesService;

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
    service = new ImportsService(db, new PositionLotsService(db, new EventEmitter2()), pricesStub, new EventEmitter2());
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
    expect(lots[0].externalId).toMatch(/^trade-republic:00000000-/);
    // Los lotes manuales no llevan id externo: aquí solo hay importados.
    expect(lots.every((lot) => lot.externalId !== null)).toBe(true);
  });

  it('amplía una posición existente de Trade Republic en vez de fallar por duplicada', async () => {
    const userId = await insertUser(db, 'a@example.com');
    const [existing] = await db
      .insert(positions)
      .values({ userId, ticker: ETF, quantity: '0', avgPrice: '0', broker: 'trade republic', currency: 'EUR' })
      .returning();
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
    expect(plan.positions[0]).toMatchObject({ action: 'extend', currentQuantity: 1, resultingQuantity: 2 });

    const result = await service.confirm(userId, csv(trade('BUY', ETF, '1', '110', 3)));
    expect(result.positions[0].status).toBe('extended');

    const all = await positionsOf(userId);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: existing.id, quantity: '2.000000', avgPrice: '100.000000' });
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
    expect(again.positions[0].status).toBe('unchanged');
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
    const [position] = await positionsOf(userId);
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
    expect(blocked).toMatchObject({ blockedBy: 'NEGATIVE_QUANTITY', resultingQuantity: null });

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
    expect((await positionsOf(userB))[0].quantity).toBe('2.000000');
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
    expect((await positionsOf(userId))[0].quantity).toBe('0.000000');
  });

  it('resume las filas descartadas por motivo y propaga los avisos, solo con recuentos', async () => {
    const userId = await insertUser(db, 'a@example.com');
    const plan = await service.preview(
      userId,
      csv(
        trade('BUY', ETF, '1', '100', 3, { tax: '-0.30' }),
        trade('BUY', ETF, '1', '100', 4, { type: 'DIVIDEND', shares: '', price: '' }),
        trade('BUY', ETF, '1', '100', 5, { type: 'DIVIDEND', shares: '', price: '' }),
        trade('BUY', ETF, '1', '100', 6, { type: 'INTEREST_PAYMENT', shares: '', price: '' }),
      ),
    );
    expect(plan.skipped).toEqual([
      { reason: 'dividend', count: 2 },
      { reason: 'interest', count: 1 },
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
