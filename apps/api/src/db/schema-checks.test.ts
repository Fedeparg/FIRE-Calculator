import { INCOME_KINDS, INCOME_SOURCES, VALUE_SOURCES } from '@sextante/core/fiscal/income';
import { ASSET_CLASSES } from '@sextante/core/portfolio/types';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import type { Database } from './database.module.js';
import { DB_ENUM_VALUES, incomeEvents, positionLots, positions } from './schema.js';

/** Constraints de la migración 0027 (`0027_check_closed_unions_not_valid.sql`). */
const NEW_CHECKS = [
  'income_events_gross_source_check',
  'income_events_kind_check',
  'income_events_source_check',
  'income_events_withholding_origin_source_check',
  'position_lots_fees_check',
  'position_lots_kind_check',
  'position_lots_price_check',
  'position_lots_quantity_check',
  'positions_asset_class_check',
  'savings_pending_balances_kind_check',
];

/** Error de Drizzle cuya causa (el error de postgres-js) es la violación de ese CHECK. */
const violates = (constraint: string) => ({ cause: { code: '23514', constraint_name: constraint } });

describe('CHECK de las uniones cerradas', () => {
  it('los valores del esquema son exactamente los de @sextante/core', () => {
    expect([...DB_ENUM_VALUES.assetClass].sort()).toEqual([...ASSET_CLASSES].sort());
    expect([...DB_ENUM_VALUES.incomeKind].sort()).toEqual([...INCOME_KINDS].sort());
    expect([...DB_ENUM_VALUES.incomeSource].sort()).toEqual([...INCOME_SOURCES].sort());
    expect([...DB_ENUM_VALUES.valueSource].sort()).toEqual([...VALUE_SOURCES].sort());
  });

  describe('en Postgres', () => {
    let db: Database;
    let close: () => Promise<void>;

    beforeAll(() => {
      ({ db, close } = createTestDb());
    });
    afterEach(async () => {
      await resetDb(db);
    });
    afterAll(async () => {
      await close();
    });

    async function seedPosition(): Promise<{ userId: string; positionId: string }> {
      const userId = await insertUser(db, 'a@example.com');
      const [position] = await db
        .insert(positions)
        .values({ userId, ticker: 'IWDA', quantity: '1', avgPrice: '1', broker: '' })
        .returning({ id: positions.id });
      return { userId, positionId: position.id };
    }

    it('rechaza un lote con un kind desconocido o con cantidad, precio o comisión fuera de rango', async () => {
      const { userId, positionId } = await seedPosition();
      const lot = { userId, positionId, kind: 'buy' as const, quantity: '1', price: '10', tradedAt: '2026-01-02' };

      await expect(db.insert(positionLots).values({ ...lot, kind: 'Buy' as 'buy' })).rejects.toMatchObject(
        violates('position_lots_kind_check'),
      );
      await expect(db.insert(positionLots).values({ ...lot, quantity: '0' })).rejects.toMatchObject(
        violates('position_lots_quantity_check'),
      );
      await expect(db.insert(positionLots).values({ ...lot, price: '-1' })).rejects.toMatchObject(
        violates('position_lots_price_check'),
      );
      await expect(db.insert(positionLots).values({ ...lot, fees: '-0.01' })).rejects.toMatchObject(
        violates('position_lots_fees_check'),
      );
      // Una compra a precio 0 (ampliación liberada) sí es válida.
      await expect(db.insert(positionLots).values({ ...lot, price: '0' })).resolves.toBeDefined();
    });

    it('rechaza un cobro con un origen o una procedencia desconocidos', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const event = {
        userId,
        kind: 'dividend' as const,
        paidAt: '2026-01-02',
        gross: '10',
        source: 'manual' as const,
      };

      await expect(db.insert(incomeEvents).values({ ...event, source: 'otro' as 'manual' })).rejects.toMatchObject(
        violates('income_events_source_check'),
      );
      await expect(
        db.insert(incomeEvents).values({ ...event, withholdingOriginSource: 'adivinado' as 'manual' }),
      ).rejects.toMatchObject(violates('income_events_withholding_origin_source_check'));
    });

    it('se crean NOT VALID: no se han comprobado las filas existentes', async () => {
      const rows = (await db.execute(
        sql`select conname, convalidated from pg_constraint where contype = 'c' order by conname`,
      )) as unknown as { conname: string; convalidated: boolean }[];
      const ours = rows.filter((row) => NEW_CHECKS.includes(row.conname));

      expect(ours.map((row) => row.conname)).toEqual(NEW_CHECKS);
      expect(ours.every((row) => !row.convalidated)).toBe(true);
    });
  });
});
