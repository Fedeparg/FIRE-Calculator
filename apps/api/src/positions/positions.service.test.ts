import { randomUUID } from 'node:crypto';

import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { firstItem, itemAt } from '@sextante/core/arrays';

import type { Database } from '../db/database.module.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import { buildPositionsStack } from '../../test/positions-stack.js';
import type { CreatePositionDto } from './dto/create-position.dto.js';
import { LOT_CHANGED_EVENT } from './position-events.js';
import type { PositionsService } from './positions.service.js';

function dto(partial: Partial<CreatePositionDto> & { ticker: string }): CreatePositionDto {
  return {
    quantity: 1,
    avgPrice: 100,
    ...partial,
  };
}

describe('PositionsService (Postgres integration)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let service: PositionsService;

  beforeAll(() => {
    ({ db, close } = createTestDb());
    service = buildPositionsStack(db).positions;
  });

  afterEach(async () => {
    await resetDb(db);
  });

  afterAll(async () => {
    await close();
  });

  describe('isolation between users', () => {
    it("findAllByUser only returns the user's own positions", async () => {
      const userA = await insertUser(db, 'a@example.com');
      const userB = await insertUser(db, 'b@example.com');

      await service.create(userA, dto({ ticker: 'IWDA' }));
      await service.create(userB, dto({ ticker: 'VWCE' }));

      const aPositions = await service.findAllByUser(userA);
      const bPositions = await service.findAllByUser(userB);

      expect(aPositions).toHaveLength(1);
      expect(itemAt(aPositions, 0).ticker).toBe('IWDA');
      expect(bPositions).toHaveLength(1);
      expect(itemAt(bPositions, 0).ticker).toBe('VWCE');
    });

    it("a user cannot delete another user's position (404)", async () => {
      const userA = await insertUser(db, 'a@example.com');
      const userB = await insertUser(db, 'b@example.com');
      const a = await service.create(userA, dto({ ticker: 'IWDA' }));

      await expect(service.remove(userB, a.id)).rejects.toBeInstanceOf(NotFoundException);

      // It still exists for its owner: the foreign delete had no effect.
      expect(await service.findAllByUser(userA)).toHaveLength(1);
    });

    it("a user cannot update another user's position (404)", async () => {
      const userA = await insertUser(db, 'a@example.com');
      const userB = await insertUser(db, 'b@example.com');
      const a = await service.create(userA, dto({ ticker: 'IWDA' }));

      await expect(service.update(userB, a.id, { quantity: 999 })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('deleting/updating a non-existent position gives 404', async () => {
      const userA = await insertUser(db, 'a@example.com');
      await expect(service.remove(userA, randomUUID())).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('duplicate rules', () => {
    it('requires a broker if the symbol already exists without one (BROKER_REQUIRED)', async () => {
      const user = await insertUser(db, 'a@example.com');
      await service.create(user, dto({ ticker: 'IWDA' }));

      await expect(service.create(user, dto({ ticker: 'IWDA' }))).rejects.toMatchObject({
        response: { code: 'BROKER_REQUIRED' },
      });
    });

    it('rejects the same (symbol, broker) case-insensitively (DUPLICATE)', async () => {
      const user = await insertUser(db, 'a@example.com');
      await service.create(user, dto({ ticker: 'IWDA', broker: 'Degiro' }));

      await expect(service.create(user, dto({ ticker: 'IWDA', broker: 'degiro' }))).rejects.toMatchObject({
        response: { code: 'DUPLICATE' },
      });
    });

    it('two simultaneous creations of the same (symbol, broker): one succeeds and the other is 409 DUPLICATE, not 500', async () => {
      const concurrent = createTestDb({ max: 4 });
      try {
        const { positions: parallel } = buildPositionsStack(concurrent.db);
        const user = await insertUser(db, 'a@example.com');

        const results = await Promise.allSettled([
          parallel.create(user, dto({ ticker: 'IWDA', broker: 'Degiro' })),
          parallel.create(user, dto({ ticker: 'IWDA', broker: 'Degiro' })),
        ]);

        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        const rejected = firstItem(results.filter((r) => r.status === 'rejected'));
        expect(rejected.reason).toBeInstanceOf(ConflictException);
        expect(rejected.reason).toMatchObject({ response: { code: 'DUPLICATE', existing: { ticker: 'IWDA' } } });
      } finally {
        await concurrent.close();
      }
    });

    it('allows the same symbol at different brokers', async () => {
      const user = await insertUser(db, 'a@example.com');
      await service.create(user, dto({ ticker: 'IWDA', broker: 'Degiro' }));
      const second = await service.create(user, dto({ ticker: 'IWDA', broker: 'MyInvestor' }));

      expect(second.broker).toBe('MyInvestor');
      expect(await service.findAllByUser(user)).toHaveLength(2);
    });

    it('the same symbol for two different users is not a duplicate', async () => {
      const userA = await insertUser(db, 'a@example.com');
      const userB = await insertUser(db, 'b@example.com');

      await service.create(userA, dto({ ticker: 'IWDA' }));
      // The same symbol without a broker must be allowed for ANOTHER user.
      const b = await service.create(userB, dto({ ticker: 'IWDA' }));
      expect(b.ticker).toBe('IWDA');
    });
  });

  it('translates an FK violation (non-existent user) to 401, not 500', async () => {
    // A JWT with a valid signature but a `sub` that no longer exists in the DB.
    await expect(service.create(randomUUID(), dto({ ticker: 'IWDA' }))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('editing quantity or average price emits LOT_CHANGED_EVENT (the lots are realigned)', async () => {
    const events = new EventEmitter2();
    const emitted: unknown[] = [];
    events.on(LOT_CHANGED_EVENT, (payload: unknown) => emitted.push(payload));
    const svc = buildPositionsStack(db, { positionsEvents: events }).positions;
    const userId = await insertUser(db, 'a@example.com');
    const position = await svc.create(userId, dto({ ticker: 'IWDA' }));

    await svc.update(userId, position.id, { name: 'Name only' });
    expect(emitted).toEqual([]);

    await svc.update(userId, position.id, { quantity: 5 });
    expect(emitted).toEqual([{ userId, positionId: position.id }]);
  });
});
