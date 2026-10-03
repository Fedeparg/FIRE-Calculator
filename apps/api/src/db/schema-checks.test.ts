import { INCOME_KINDS, INCOME_SOURCES, VALUE_SOURCES } from '@sextante/core/fiscal/income';
import { ASSET_CLASSES } from '@sextante/core/portfolio/types';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import type { Database } from './database.module.js';
import { DB_ENUM_VALUES, incomeEvents, positionLots } from './schema.js';
import { seedPosition } from '../../test/factories.js';

/** Constraints from migration 0027 (`0027_check_closed_unions_not_valid.sql`). */
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

/** Drizzle error whose cause (the postgres-js error) is a violation of that CHECK. */
const violates = (constraint: string) => ({ cause: { code: '23514', constraint_name: constraint } });

describe('CHECKs on closed unions', () => {
  it('the schema values are exactly those of @sextante/core', () => {
    expect([...DB_ENUM_VALUES.assetClass].sort()).toEqual([...ASSET_CLASSES].sort());
    expect([...DB_ENUM_VALUES.incomeKind].sort()).toEqual([...INCOME_KINDS].sort());
    expect([...DB_ENUM_VALUES.incomeSource].sort()).toEqual([...INCOME_SOURCES].sort());
    expect([...DB_ENUM_VALUES.valueSource].sort()).toEqual([...VALUE_SOURCES].sort());
  });

  describe('in Postgres', () => {
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

    async function seedUserPosition(): Promise<{ userId: string; positionId: string }> {
      const userId = await insertUser(db, 'a@example.com');
      const position = await seedPosition(db, userId, { quantity: '1', avgPrice: '1', broker: '' });
      return { userId, positionId: position.id };
    }

    it('rejects a lot with an unknown kind or with an out-of-range quantity, price or fee', async () => {
      const { userId, positionId } = await seedUserPosition();
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
      // A buy at price 0 (bonus share issue, "ampliación liberada") is valid.
      await expect(db.insert(positionLots).values({ ...lot, price: '0' })).resolves.toBeDefined();
    });

    it('rejects an income event with an unknown source or withholding origin source', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const event = {
        userId,
        kind: 'dividend' as const,
        paidAt: '2026-01-02',
        gross: '10',
        source: 'manual' as const,
      };

      await expect(db.insert(incomeEvents).values({ ...event, source: 'other' as 'manual' })).rejects.toMatchObject(
        violates('income_events_source_check'),
      );
      await expect(
        db.insert(incomeEvents).values({ ...event, withholdingOriginSource: 'guessed' as 'manual' }),
      ).rejects.toMatchObject(violates('income_events_withholding_origin_source_check'));
    });

    it('are created NOT VALID: existing rows have not been checked', async () => {
      const rows = await db.execute<{ conname: string; convalidated: boolean }>(
        sql`select conname, convalidated from pg_constraint where contype = 'c' order by conname`,
      );
      const ours = rows.filter((row) => NEW_CHECKS.includes(row.conname));

      expect(ours.map((row) => row.conname)).toEqual(NEW_CHECKS);
      expect(ours.every((row) => !row.convalidated)).toBe(true);
    });
  });
});
