import { randomUUID } from 'node:crypto';

import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../db/database.module.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import { buildPositionsStack } from '../../test/positions-stack.js';
import type { CreatePositionDto } from './dto/create-position.dto.js';
import { LOT_CHANGED_EVENT } from './position-events.js';
import { PositionsService } from './positions.service.js';

function dto(partial: Partial<CreatePositionDto> & { ticker: string }): CreatePositionDto {
  return {
    quantity: 1,
    avgPrice: 100,
    ...partial,
  };
}

describe('PositionsService (integración con Postgres)', () => {
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

  describe('aislamiento entre usuarios', () => {
    it('findAllByUser solo devuelve las posiciones del propio usuario', async () => {
      const userA = await insertUser(db, 'a@example.com');
      const userB = await insertUser(db, 'b@example.com');

      await service.create(userA, dto({ ticker: 'IWDA' }));
      await service.create(userB, dto({ ticker: 'VWCE' }));

      const aPositions = await service.findAllByUser(userA);
      const bPositions = await service.findAllByUser(userB);

      expect(aPositions).toHaveLength(1);
      expect(aPositions[0].ticker).toBe('IWDA');
      expect(bPositions).toHaveLength(1);
      expect(bPositions[0].ticker).toBe('VWCE');
    });

    it('un usuario no puede borrar la posición de otro (404)', async () => {
      const userA = await insertUser(db, 'a@example.com');
      const userB = await insertUser(db, 'b@example.com');
      const a = await service.create(userA, dto({ ticker: 'IWDA' }));

      await expect(service.remove(userB, a.id)).rejects.toBeInstanceOf(NotFoundException);

      // Sigue existiendo para su dueño: el borrado ajeno no surtió efecto.
      expect(await service.findAllByUser(userA)).toHaveLength(1);
    });

    it('un usuario no puede actualizar la posición de otro (404)', async () => {
      const userA = await insertUser(db, 'a@example.com');
      const userB = await insertUser(db, 'b@example.com');
      const a = await service.create(userA, dto({ ticker: 'IWDA' }));

      await expect(service.update(userB, a.id, { quantity: 999 })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('borrar/actualizar una posición inexistente da 404', async () => {
      const userA = await insertUser(db, 'a@example.com');
      await expect(service.remove(userA, randomUUID())).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('reglas de duplicados', () => {
    it('exige bróker si el símbolo ya existe sin bróker (BROKER_REQUIRED)', async () => {
      const user = await insertUser(db, 'a@example.com');
      await service.create(user, dto({ ticker: 'IWDA' }));

      await expect(service.create(user, dto({ ticker: 'IWDA' }))).rejects.toMatchObject({
        response: { code: 'BROKER_REQUIRED' },
      });
    });

    it('rechaza el mismo (símbolo, bróker) case-insensitive (DUPLICATE)', async () => {
      const user = await insertUser(db, 'a@example.com');
      await service.create(user, dto({ ticker: 'IWDA', broker: 'Degiro' }));

      await expect(service.create(user, dto({ ticker: 'IWDA', broker: 'degiro' }))).rejects.toMatchObject({
        response: { code: 'DUPLICATE' },
      });
    });

    it('dos altas simultáneas del mismo (símbolo, bróker): una entra y la otra es 409 DUPLICATE, no 500', async () => {
      const concurrent = createTestDb({ max: 4 });
      try {
        const { positions: parallel } = buildPositionsStack(concurrent.db);
        const user = await insertUser(db, 'a@example.com');

        const results = await Promise.allSettled([
          parallel.create(user, dto({ ticker: 'IWDA', broker: 'Degiro' })),
          parallel.create(user, dto({ ticker: 'IWDA', broker: 'Degiro' })),
        ]);

        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        const [rejected] = results.filter((r) => r.status === 'rejected');
        expect(rejected.reason).toBeInstanceOf(ConflictException);
        expect(rejected.reason).toMatchObject({ response: { code: 'DUPLICATE', existing: { ticker: 'IWDA' } } });
      } finally {
        await concurrent.close();
      }
    });

    it('permite el mismo símbolo en brókers distintos', async () => {
      const user = await insertUser(db, 'a@example.com');
      await service.create(user, dto({ ticker: 'IWDA', broker: 'Degiro' }));
      const second = await service.create(user, dto({ ticker: 'IWDA', broker: 'MyInvestor' }));

      expect(second.broker).toBe('MyInvestor');
      expect(await service.findAllByUser(user)).toHaveLength(2);
    });

    it('el mismo símbolo de dos usuarios distintos no es duplicado', async () => {
      const userA = await insertUser(db, 'a@example.com');
      const userB = await insertUser(db, 'b@example.com');

      await service.create(userA, dto({ ticker: 'IWDA' }));
      // El mismo símbolo sin bróker para OTRO usuario debe permitirse.
      const b = await service.create(userB, dto({ ticker: 'IWDA' }));
      expect(b.ticker).toBe('IWDA');
    });
  });

  it('traduce una violación de FK (usuario inexistente) a 401, no 500', async () => {
    // JWT con firma válida pero `sub` que ya no existe en BD.
    await expect(service.create(randomUUID(), dto({ ticker: 'IWDA' }))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('editar cantidad o precio medio emite LOT_CHANGED_EVENT (los lotes se realinean)', async () => {
    const events = new EventEmitter2();
    const emitted: unknown[] = [];
    events.on(LOT_CHANGED_EVENT, (payload: unknown) => emitted.push(payload));
    const svc = buildPositionsStack(db, { positionsEvents: events }).positions;
    const userId = await insertUser(db, 'a@example.com');
    const position = await svc.create(userId, dto({ ticker: 'IWDA' }));

    await svc.update(userId, position.id, { name: 'Solo el nombre' });
    expect(emitted).toEqual([]);

    await svc.update(userId, position.id, { quantity: 5 });
    expect(emitted).toEqual([{ userId, positionId: position.id }]);
  });
});
