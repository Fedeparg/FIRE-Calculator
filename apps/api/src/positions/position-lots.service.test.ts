import { randomUUID } from 'node:crypto';

import { ConflictException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { firstItem, itemAt } from '@sextante/core/arrays';

import type { Database } from '../db/database.module.js';
import { positionLots, positions } from '../db/schema.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import { buildPositionsStack } from '../../test/positions-stack.js';
import type { CreatePositionDto } from './dto/create-position.dto.js';
import { aggregateLots } from './lot-aggregate.js';
import { LOT_CHANGED_EVENT } from './position-events.js';
import type { PositionLotsService } from './position-lots.service.js';
import type { PositionsService } from './positions.service.js';

/** `primeSymbol` only refreshes the price on the fly; in tests it is a no-op. */

function dto(partial: Partial<CreatePositionDto> & { ticker: string }): CreatePositionDto {
  return { quantity: 1, avgPrice: 100, ...partial };
}

/** A fixed date earlier than any date the tests use (creation sets `tradedAt` = today). */
const START_DATE = '2026-01-01';

/**
 * The `position_lots` backfill statement from migration `0011_melodic_marten_broadcloak.sql`,
 * copied verbatim. That migration is already applied in production and is never edited, so it
 * cannot diverge; freezing it here keeps the test independent of how the `drizzle/` files are
 * named and split. The backfill runs in `global-setup` against an empty DB (a no-op there), so
 * this is the only real coverage it has.
 */
const BACKFILL_SQL = `INSERT INTO "position_lots" ("position_id", "user_id", "kind", "quantity", "price", "fees", "traded_at")
SELECT p."id", p."user_id", 'buy', p."quantity", p."avg_price", 0, (p."created_at" AT TIME ZONE 'UTC')::date
FROM "positions" p
WHERE NOT EXISTS (SELECT 1 FROM "position_lots" l WHERE l."position_id" = p."id");`;

describe('PositionLotsService (Postgres integration)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let lots: PositionLotsService;
  let service: PositionsService;

  beforeAll(() => {
    ({ db, close } = createTestDb());
    ({ lots, positions: service } = buildPositionsStack(db));
  });

  afterEach(async () => {
    await resetDb(db);
  });

  afterAll(async () => {
    await close();
  });

  /**
   * Creates a position and moves its initial lot back to `START_DATE`. Creation dates the lot
   * TODAY, so without this the tests that add lots on fixed dates would depend on the system date
   * (a sell before the buy would, rightly, give a negative quantity).
   */
  async function createBackdated(userId: string, partial: Partial<CreatePositionDto> & { ticker: string }) {
    const position = await service.create(userId, dto(partial));
    const initial = firstItem(await lots.listByPosition(userId, position.id));
    await lots.update(userId, position.id, initial.id, { tradedAt: START_DATE });
    return position;
  }

  describe('migration backfill', () => {
    it('creates one buy lot per position and its aggregates MATCH the position', async () => {
      const userId = await insertUser(db, 'a@example.com');
      // An "old" position: inserted by hand, as it would be in production before migrating.
      const existing = firstItem(
        await db
          .insert(positions)
          .values({
            userId,
            ticker: 'IWDA',
            quantity: '12.500000',
            avgPrice: '95.420000',
            currency: 'EUR',
            createdAt: new Date('2025-11-02T23:30:00Z'),
          })
          .returning(),
      );

      await db.execute(sql.raw(BACKFILL_SQL));

      const rows = await db.select().from(positionLots).where(eq(positionLots.positionId, existing.id));

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        userId,
        kind: 'buy',
        quantity: '12.500000',
        price: '95.420000',
        fees: '0.000000',
        // Creation date converted in UTC (not in the session's time zone: 23:30Z is NOT the 3rd).
        tradedAt: '2025-11-02',
      });

      // What the golden rule requires: the snapshot and the history agree.
      expect(aggregateLots(rows)).toMatchObject({
        quantity: existing.quantity,
        avgPrice: existing.avgPrice,
      });
    });

    it('is idempotent: re-running it does not duplicate lots', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await db.insert(positions).values({ userId, ticker: 'VWCE', quantity: '3', avgPrice: '110', currency: 'EUR' });

      await db.execute(sql.raw(BACKFILL_SQL));
      await db.execute(sql.raw(BACKFILL_SQL));

      expect(await db.select().from(positionLots)).toHaveLength(1);
    });
  });

  describe('position ↔ lots sync', () => {
    it('creating a position creates its initial buy lot', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const position = await service.create(userId, dto({ ticker: 'IWDA', quantity: 10, avgPrice: 100 }));

      const rows = await lots.listByPosition(userId, position.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ kind: 'buy', quantity: 10, price: 100 });
    });

    it("adding a buy recomputes the position's quantity and average price", async () => {
      const userId = await insertUser(db, 'a@example.com');
      const position = await createBackdated(userId, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });

      await lots.create(userId, position.id, {
        kind: 'buy',
        quantity: 10,
        price: 200,
        tradedAt: '2026-06-01',
      });

      const updated = firstItem(await service.findAllByUser(userId));
      expect(updated.quantity).toBe(20);
      expect(updated.avgPrice).toBe(150);
    });

    it('two simultaneous lot creations both add up (no lost update)', async () => {
      // Multi-connection pool: the two transactions really run at the same time.
      const concurrent = createTestDb({ max: 4 });
      try {
        const stack = buildPositionsStack(concurrent.db);
        const userId = await insertUser(db, 'a@example.com');
        const position = await createBackdated(userId, { ticker: 'IWDA', quantity: 1, avgPrice: 100 });

        // Several rounds: without the lock, a single interleaving is enough to lose a buy.
        for (let round = 0; round < 5; round++) {
          await Promise.all(
            [2, 3].map((quantity) =>
              stack.lots.create(userId, position.id, { kind: 'buy', quantity, price: 100, tradedAt: '2026-06-01' }),
            ),
          );
        }

        const updated = firstItem(await service.findAllByUser(userId));
        expect(updated.quantity).toBe(1 + 5 * (2 + 3));
      } finally {
        await concurrent.close();
      }
    });

    it('a sell lowers the quantity and does NOT move the average price', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const position = await createBackdated(userId, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });

      await lots.create(userId, position.id, {
        kind: 'sell',
        quantity: 4,
        price: 180,
        fees: 1.5,
        tradedAt: '2026-06-01',
      });

      const updated = firstItem(await service.findAllByUser(userId));
      expect(updated.quantity).toBe(6);
      expect(updated.avgPrice).toBe(100);
    });

    it('rejects selling more than is held and does NOT keep the lot (rollback)', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const position = await createBackdated(userId, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });

      await expect(
        lots.create(userId, position.id, {
          kind: 'sell',
          quantity: 11,
          price: 180,
          tradedAt: '2026-06-01',
        }),
      ).rejects.toMatchObject({ code: 'NEGATIVE_QUANTITY' });

      // Neither the invalid lot nor an out-of-sync position.
      expect(await lots.listByPosition(userId, position.id)).toHaveLength(1);
      expect(firstItem(await service.findAllByUser(userId)).quantity).toBe(10);
    });

    it('deleting a lot re-aggregates the rest', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const position = await createBackdated(userId, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });
      const extra = await lots.create(userId, position.id, {
        kind: 'buy',
        quantity: 10,
        price: 200,
        tradedAt: '2026-06-01',
      });

      await lots.remove(userId, position.id, extra.id);

      const updated = firstItem(await service.findAllByUser(userId));
      expect(updated.quantity).toBe(10);
      expect(updated.avgPrice).toBe(100);
    });

    it('editing a lot re-aggregates the position', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const position = await service.create(userId, dto({ ticker: 'IWDA', quantity: 10, avgPrice: 100 }));
      const initial = firstItem(await lots.listByPosition(userId, position.id));

      await lots.update(userId, position.id, initial.id, { quantity: 25 });

      expect(firstItem(await service.findAllByUser(userId)).quantity).toBe(25);
    });

    it('deleting the position deletes its lots (cascade)', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const position = await service.create(userId, dto({ ticker: 'IWDA' }));

      await service.remove(userId, position.id);

      expect(await db.select().from(positionLots)).toHaveLength(0);
    });
  });

  describe('combine records history and does not lose precision', () => {
    it('leaves one lot per buy and recomputes the weighted average', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const position = await service.create(userId, dto({ ticker: 'IWDA', quantity: 10, avgPrice: 100 }));

      const combined = await service.combine(userId, position.id, { quantity: 10, avgPrice: 200 });

      expect(combined.quantity).toBe(20);
      expect(combined.avgPrice).toBe(150);
      expect(await lots.listByPosition(userId, position.id)).toHaveLength(2);
    });

    it('keeps the average price EXACT where a floating-point average would shift it', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const position = await service.create(userId, dto({ ticker: 'IWDA', quantity: 1, avgPrice: 0.1 }));

      await service.combine(userId, position.id, { quantity: 1, avgPrice: 0.2 });
      const result = await service.combine(userId, position.id, { quantity: 1, avgPrice: 0.3 });

      // Cost 0.6 over 3 shares = exactly 0.2. The previous `Number()` chain gave
      // 0.20000000000000004 and stored it rounded, carrying the error forward.
      const row = firstItem(await db.select().from(positions).where(eq(positions.id, position.id)));
      expect(row.avgPrice).toBe('0.200000');
      expect(result.avgPrice).toBe(0.2);
    });
  });

  describe('manual edit of quantity/average price', () => {
    it('with a single lot edits it IN PLACE (keeps the history)', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const position = await service.create(userId, dto({ ticker: 'IWDA', quantity: 10, avgPrice: 100 }));
      const initial = firstItem(await lots.listByPosition(userId, position.id));

      const updated = await service.update(userId, position.id, { quantity: 7, avgPrice: 120 });

      const rows = await lots.listByPosition(userId, position.id);
      expect(updated).toMatchObject({ quantity: 7, avgPrice: 120 });
      expect(rows).toHaveLength(1);
      expect(itemAt(rows, 0).id).toBe(initial.id);
      expect(rows[0]).toMatchObject({ quantity: 7, price: 120 });
    });

    it('with several lots collapses them into one, keeping the oldest date', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const position = await createBackdated(userId, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });
      await lots.create(userId, position.id, {
        kind: 'buy',
        quantity: 5,
        price: 200,
        tradedAt: '2026-08-01',
      });

      await service.update(userId, position.id, { quantity: 3, avgPrice: 90 });

      const rows = await lots.listByPosition(userId, position.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ kind: 'buy', quantity: 3, price: 90 });
      expect(itemAt(rows, 0).tradedAt).toBe(START_DATE);
    });

    it('editing only the broker does not touch the lots', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const position = await service.create(userId, dto({ ticker: 'IWDA', quantity: 10, avgPrice: 100 }));
      const before = await lots.listByPosition(userId, position.id);

      await service.update(userId, position.id, { broker: 'Degiro' });

      expect(await lots.listByPosition(userId, position.id)).toEqual(before);
    });
  });

  describe('history protection with sells', () => {
    async function positionWithSale(userId: string) {
      const position = await createBackdated(userId, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });
      await lots.create(userId, position.id, {
        kind: 'sell',
        quantity: 4,
        price: 150,
        tradedAt: '2026-06-01',
      });
      return position;
    }

    it('rejects declaring a different quantity or average price (409 HAS_SALES) and touches nothing', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const position = await positionWithSale(userId);
      const before = await lots.listByPosition(userId, position.id);

      const attempt = service.update(userId, position.id, { quantity: 3, avgPrice: 90 });

      await expect(attempt).rejects.toBeInstanceOf(ConflictException);
      await expect(attempt).rejects.toMatchObject({ response: { code: 'HAS_SALES' } });
      expect(await lots.listByPosition(userId, position.id)).toEqual(before);
      const row = firstItem(await db.select().from(positions).where(eq(positions.id, position.id)));
      expect(row.quantity).toBe('6.000000');
    });

    it('resending the SAME amounts (edit form) neither fails nor touches the lots', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const position = await positionWithSale(userId);
      const before = await lots.listByPosition(userId, position.id);

      const updated = await service.update(userId, position.id, {
        quantity: 6,
        avgPrice: 100,
        broker: 'Degiro',
        name: 'iShares World',
      });

      expect(updated).toMatchObject({ quantity: 6, avgPrice: 100, broker: 'Degiro', name: 'iShares World' });
      expect(await lots.listByPosition(userId, position.id)).toEqual(before);
    });

    it('without sells collapsing is still allowed', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const position = await createBackdated(userId, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });
      await lots.create(userId, position.id, { kind: 'buy', quantity: 1, price: 1, tradedAt: '2026-02-01' });

      await expect(service.update(userId, position.id, { quantity: 2, avgPrice: 5 })).resolves.toMatchObject({
        quantity: 2,
      });
    });
  });

  describe("listing all of the user's trades", () => {
    it('returns the lots of all their positions in chronological order, and only theirs', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const otherId = await insertUser(db, 'b@example.com');
      const a = await createBackdated(userId, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });
      const b = await createBackdated(userId, { ticker: 'VWCE', quantity: 5, avgPrice: 90 });
      await lots.create(userId, a.id, { kind: 'sell', quantity: 2, price: 120, tradedAt: '2026-03-01' });
      await createBackdated(otherId, { ticker: 'IWDA', quantity: 1, avgPrice: 1 });

      const all = await lots.findAllByUser(userId);

      expect(all).toHaveLength(3);
      expect(new Set(all.map((l) => l.positionId))).toEqual(new Set([a.id, b.id]));
      expect(all.map((l) => l.tradedAt)).toEqual([START_DATE, START_DATE, '2026-03-01']);
    });
  });

  describe('isolation between users', () => {
    it("a user can neither list nor create lots on another user's position (404)", async () => {
      const userA = await insertUser(db, 'a@example.com');
      const userB = await insertUser(db, 'b@example.com');
      const position = await service.create(userA, dto({ ticker: 'IWDA' }));

      await expect(lots.listByPosition(userB, position.id)).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        lots.create(userB, position.id, {
          kind: 'buy',
          quantity: 1,
          price: 1,
          tradedAt: '2026-06-01',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("a lot of ANOTHER of the user's own positions is not reachable through the route (404)", async () => {
      const userId = await insertUser(db, 'a@example.com');
      const first = await service.create(userId, dto({ ticker: 'IWDA' }));
      const second = await service.create(userId, dto({ ticker: 'VWCE' }));
      const foreignLot = firstItem(await lots.listByPosition(userId, second.id));

      await expect(lots.remove(userId, first.id, foreignLot.id)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('a non-existent position gives 404', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await expect(lots.listByPosition(userId, randomUUID())).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('LOT_CHANGED_EVENT: date to invalidate', () => {
    /** A service with its own emitter, to capture what it emits. */
    function withEvents() {
      const events = new EventEmitter2();
      const emitted: { invalidateFrom?: string }[] = [];
      events.on(LOT_CHANGED_EVENT, (payload: { invalidateFrom?: string }) => emitted.push(payload));
      return { svc: buildPositionsStack(db, { lotsEvents: events }).lots, emitted };
    }

    it('deleting a lot carries its trade date (it leaves no timestamp)', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const position = await createBackdated(userId, { ticker: 'IWDA' });
      const { svc, emitted } = withEvents();
      const added = await svc.create(userId, position.id, {
        kind: 'buy',
        quantity: 1,
        price: 100,
        tradedAt: '2026-03-01',
      });
      emitted.length = 0;

      await svc.remove(userId, position.id, added.id);

      expect(emitted).toEqual([expect.objectContaining({ invalidateFrom: '2026-03-01' })]);
    });

    it("moving a lot's date carries the PREVIOUS one; editing anything else or creating carries none", async () => {
      const userId = await insertUser(db, 'a@example.com');
      const position = await createBackdated(userId, { ticker: 'IWDA' });
      const { svc, emitted } = withEvents();
      const added = await svc.create(userId, position.id, {
        kind: 'buy',
        quantity: 1,
        price: 100,
        tradedAt: '2026-03-01',
      });
      expect(itemAt(emitted, 0).invalidateFrom).toBeUndefined();

      await svc.update(userId, position.id, added.id, { tradedAt: '2026-04-01' });
      await svc.update(userId, position.id, added.id, { price: 110 });

      expect(itemAt(emitted, 1).invalidateFrom).toBe('2026-03-01');
      expect(itemAt(emitted, 2).invalidateFrom).toBeUndefined();
    });
  });
});
