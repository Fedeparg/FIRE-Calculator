import { randomUUID } from 'node:crypto';

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { firstItem, itemAt } from '@sextante/core/arrays';

import type { Database } from '../db/database.module.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import type { CreateSavedScenarioDto } from './dto/create-saved-scenario.dto.js';
import { MAX_SCENARIOS_PER_USER } from '@sextante/core/contracts';
import { MAX_INPUTS_BYTES, SavedScenariosService } from './saved-scenarios.service.js';

function dto(partial: Partial<CreateSavedScenarioDto> = {}): CreateSavedScenarioDto {
  return {
    slug: 'fire-basico',
    name: 'My plan',
    inputs: { annualSpending: 24000, withdrawalRate: 4 },
    ...partial,
  };
}

describe('SavedScenariosService (Postgres integration)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let service: SavedScenariosService;

  beforeAll(() => {
    ({ db, close } = createTestDb());
    service = new SavedScenariosService(db);
  });

  afterEach(async () => {
    await resetDb(db);
  });

  afterAll(async () => {
    await close();
  });

  it('saves and returns the scenario with its inputs intact', async () => {
    const userId = await insertUser(db, 'a@example.com');

    const created = await service.create(userId, dto());

    expect(created).toMatchObject({ slug: 'fire-basico', name: 'My plan' });
    expect(created.inputs).toEqual({ annualSpending: 24000, withdrawalRate: 4 });
    expect(await service.findAllByUser(userId)).toHaveLength(1);
  });

  it('filters by calculator with the slug', async () => {
    const userId = await insertUser(db, 'a@example.com');
    await service.create(userId, dto({ slug: 'fire-basico' }));
    await service.create(userId, dto({ slug: 'interes-compuesto', name: 'Another' }));

    const filtered = await service.findAllByUser(userId, 'interes-compuesto');

    expect(filtered).toHaveLength(1);
    expect(itemAt(filtered, 0).name).toBe('Another');
  });

  it('updates name and inputs without touching the slug', async () => {
    const userId = await insertUser(db, 'a@example.com');
    const created = await service.create(userId, dto());

    const updated = await service.update(userId, created.id, {
      name: 'Pessimistic plan',
      inputs: { annualSpending: 30000 },
    });

    expect(updated).toMatchObject({ slug: 'fire-basico', name: 'Pessimistic plan' });
    expect(updated.inputs).toEqual({ annualSpending: 30000 });
  });

  it('deletes an owned scenario', async () => {
    const userId = await insertUser(db, 'a@example.com');
    const created = await service.create(userId, dto());

    await service.remove(userId, created.id);

    expect(await service.findAllByUser(userId)).toHaveLength(0);
  });

  describe('limits (this is not free storage)', () => {
    it('rejects inputs larger than the size cap', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const huge = { blob: 'x'.repeat(MAX_INPUTS_BYTES + 1) };

      await expect(service.create(userId, dto({ inputs: huge }))).rejects.toMatchObject({
        response: { code: 'INPUTS_TOO_LARGE' },
      });
    });

    it('also rejects huge inputs on update', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const created = await service.create(userId, dto());

      await expect(
        service.update(userId, created.id, { inputs: { blob: 'x'.repeat(MAX_INPUTS_BYTES) } }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects going over the per-user scenario maximum', async () => {
      const userId = await insertUser(db, 'a@example.com');
      for (let i = 0; i < MAX_SCENARIOS_PER_USER; i++) {
        await service.create(userId, dto({ name: `Plan ${i}` }));
      }

      await expect(service.create(userId, dto({ name: 'One too many' }))).rejects.toMatchObject({
        response: { code: 'SCENARIO_QUOTA_EXCEEDED' },
      });
    });

    it('concurrent creates with one free slot: only one gets in (the quota is not exceeded)', async () => {
      const concurrent = createTestDb({ max: 4 });
      try {
        const parallel = new SavedScenariosService(concurrent.db);
        const userId = await insertUser(db, 'a@example.com');
        for (let i = 0; i < MAX_SCENARIOS_PER_USER - 1; i++) {
          await service.create(userId, dto({ name: `Plan ${i}` }));
        }

        const results = await Promise.allSettled(
          [1, 2, 3].map((i) => parallel.create(userId, dto({ name: `Concurrent ${i}` }))),
        );

        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        expect(await service.findAllByUser(userId)).toHaveLength(MAX_SCENARIOS_PER_USER);
      } finally {
        await concurrent.close();
      }
    });

    it('the quota is PER user: one user hitting it does not block another', async () => {
      const userA = await insertUser(db, 'a@example.com');
      const userB = await insertUser(db, 'b@example.com');
      for (let i = 0; i < MAX_SCENARIOS_PER_USER; i++) {
        await service.create(userA, dto({ name: `Plan ${i}` }));
      }

      await expect(service.create(userB, dto())).resolves.toMatchObject({ name: 'My plan' });
    });
  });

  describe('isolation between users', () => {
    it('findAllByUser only returns owned scenarios', async () => {
      const userA = await insertUser(db, 'a@example.com');
      const userB = await insertUser(db, 'b@example.com');
      await service.create(userA, dto());

      expect(await service.findAllByUser(userB)).toHaveLength(0);
    });

    it("a user cannot edit or delete another user's scenario (404)", async () => {
      const userA = await insertUser(db, 'a@example.com');
      const userB = await insertUser(db, 'b@example.com');
      const created = await service.create(userA, dto());

      await expect(service.update(userB, created.id, { name: 'Hijacked' })).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.remove(userB, created.id)).rejects.toBeInstanceOf(NotFoundException);

      // The scenario is still intact for its owner.
      expect(firstItem(await service.findAllByUser(userA)).name).toBe('My plan');
    });

    it('a missing scenario returns 404', async () => {
      const userId = await insertUser(db, 'a@example.com');

      await expect(service.remove(userId, randomUUID())).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
