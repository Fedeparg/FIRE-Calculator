import { randomUUID } from 'node:crypto';

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../db/database.module.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import type { CreateSavedScenarioDto } from './dto/create-saved-scenario.dto.js';
import { MAX_SCENARIOS_PER_USER } from '@sextante/core/contracts';
import { MAX_INPUTS_BYTES, SavedScenariosService } from './saved-scenarios.service.js';

function dto(partial: Partial<CreateSavedScenarioDto> = {}): CreateSavedScenarioDto {
  return {
    slug: 'fire-basico',
    name: 'Mi plan',
    inputs: { annualSpending: 24000, withdrawalRate: 4 },
    ...partial,
  };
}

describe('SavedScenariosService (integración con Postgres)', () => {
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

  it('guarda y devuelve el escenario con sus inputs intactos', async () => {
    const userId = await insertUser(db, 'a@example.com');

    const created = await service.create(userId, dto());

    expect(created).toMatchObject({ slug: 'fire-basico', name: 'Mi plan' });
    expect(created.inputs).toEqual({ annualSpending: 24000, withdrawalRate: 4 });
    expect(await service.findAllByUser(userId)).toHaveLength(1);
  });

  it('filtra por calculadora con el slug', async () => {
    const userId = await insertUser(db, 'a@example.com');
    await service.create(userId, dto({ slug: 'fire-basico' }));
    await service.create(userId, dto({ slug: 'interes-compuesto', name: 'Otro' }));

    const filtered = await service.findAllByUser(userId, 'interes-compuesto');

    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Otro');
  });

  it('actualiza nombre e inputs sin tocar el slug', async () => {
    const userId = await insertUser(db, 'a@example.com');
    const created = await service.create(userId, dto());

    const updated = await service.update(userId, created.id, {
      name: 'Plan pesimista',
      inputs: { annualSpending: 30000 },
    });

    expect(updated).toMatchObject({ slug: 'fire-basico', name: 'Plan pesimista' });
    expect(updated.inputs).toEqual({ annualSpending: 30000 });
  });

  it('borra un escenario propio', async () => {
    const userId = await insertUser(db, 'a@example.com');
    const created = await service.create(userId, dto());

    await service.remove(userId, created.id);

    expect(await service.findAllByUser(userId)).toHaveLength(0);
  });

  describe('límites (esto no es almacenamiento libre)', () => {
    it('rechaza unos inputs mayores que el tope de tamaño', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const huge = { blob: 'x'.repeat(MAX_INPUTS_BYTES + 1) };

      await expect(service.create(userId, dto({ inputs: huge }))).rejects.toMatchObject({
        response: { code: 'INPUTS_TOO_LARGE' },
      });
    });

    it('rechaza también unos inputs enormes al actualizar', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const created = await service.create(userId, dto());

      await expect(
        service.update(userId, created.id, { inputs: { blob: 'x'.repeat(MAX_INPUTS_BYTES) } }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza pasar del máximo de escenarios por usuario', async () => {
      const userId = await insertUser(db, 'a@example.com');
      for (let i = 0; i < MAX_SCENARIOS_PER_USER; i++) {
        await service.create(userId, dto({ name: `Plan ${i}` }));
      }

      await expect(service.create(userId, dto({ name: 'Uno de más' }))).rejects.toMatchObject({
        response: { code: 'SCENARIO_QUOTA_EXCEEDED' },
      });
    });

    it('altas simultáneas con un hueco libre: solo entra una (la cuota no se supera)', async () => {
      const concurrent = createTestDb({ max: 4 });
      try {
        const parallel = new SavedScenariosService(concurrent.db);
        const userId = await insertUser(db, 'a@example.com');
        for (let i = 0; i < MAX_SCENARIOS_PER_USER - 1; i++) {
          await service.create(userId, dto({ name: `Plan ${i}` }));
        }

        const results = await Promise.allSettled(
          [1, 2, 3].map((i) => parallel.create(userId, dto({ name: `Simultáneo ${i}` }))),
        );

        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        expect(await service.findAllByUser(userId)).toHaveLength(MAX_SCENARIOS_PER_USER);
      } finally {
        await concurrent.close();
      }
    });

    it('la cuota es POR usuario: la de uno no bloquea al otro', async () => {
      const userA = await insertUser(db, 'a@example.com');
      const userB = await insertUser(db, 'b@example.com');
      for (let i = 0; i < MAX_SCENARIOS_PER_USER; i++) {
        await service.create(userA, dto({ name: `Plan ${i}` }));
      }

      await expect(service.create(userB, dto())).resolves.toMatchObject({ name: 'Mi plan' });
    });
  });

  describe('aislamiento entre usuarios', () => {
    it('findAllByUser solo devuelve los escenarios propios', async () => {
      const userA = await insertUser(db, 'a@example.com');
      const userB = await insertUser(db, 'b@example.com');
      await service.create(userA, dto());

      expect(await service.findAllByUser(userB)).toHaveLength(0);
    });

    it('un usuario no puede editar ni borrar el escenario de otro (404)', async () => {
      const userA = await insertUser(db, 'a@example.com');
      const userB = await insertUser(db, 'b@example.com');
      const created = await service.create(userA, dto());

      await expect(service.update(userB, created.id, { name: 'Secuestrado' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.remove(userB, created.id)).rejects.toBeInstanceOf(NotFoundException);

      // El escenario sigue intacto para su dueño.
      expect((await service.findAllByUser(userA))[0].name).toBe('Mi plan');
    });

    it('un escenario inexistente da 404', async () => {
      const userId = await insertUser(db, 'a@example.com');

      await expect(service.remove(userId, randomUUID())).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
