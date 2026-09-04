import { readdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../db/database.module.js';
import { positionLots, positions } from '../db/schema.js';
import type { PricesService } from '../prices/prices.service.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import { CreatePositionDto } from './dto/create-position.dto.js';
import { aggregateLots } from './lot-aggregate.js';
import { PositionLotsService } from './position-lots.service.js';
import { PositionsService } from './positions.service.js';

/** `primeSymbol` solo refresca precio en caliente; en tests es un no-op. */
const pricesStub = { primeSymbol: async () => {} } as unknown as PricesService;

function dto(partial: Partial<CreatePositionDto> & { ticker: string }): CreatePositionDto {
  return { quantity: 1, avgPrice: 100, ...partial };
}

/** Fecha fija anterior a cualquier fecha que usen los tests (el alta pone `tradedAt` = hoy). */
const START_DATE = '2026-01-01';

/**
 * Extrae del SQL de las migraciones la sentencia REAL de backfill de `position_lots`.
 *
 * Se lee del fichero (buscándolo por contenido, no por nombre fijo) en vez de reescribirla en
 * el test: así lo que se prueba es la sentencia que se ejecutará en producción. El backfill
 * se aplica en `global-setup` contra una BD vacía, así que allí es un no-op y esta es la
 * única cobertura real que puede tener.
 */
function readBackfillStatement(): string {
  const dir = resolve(import.meta.dirname, '../../drizzle');
  const statements = readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .flatMap((file) => readFileSync(resolve(dir, file), 'utf8').split('--> statement-breakpoint'))
    .map((statement) => statement.trim())
    .filter((statement) => statement.includes('INSERT INTO "position_lots"'));

  // Si una renumeración o un renombrado dejase de encontrarla, el test debe FALLAR, no
  // volverse vacío en silencio.
  expect(statements).toHaveLength(1);
  return statements[0];
}

describe('PositionLotsService (integración con Postgres)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let lots: PositionLotsService;
  let service: PositionsService;

  beforeAll(() => {
    ({ db, close } = createTestDb());
    lots = new PositionLotsService(db);
    service = new PositionsService(db, pricesStub, lots, new EventEmitter2());
  });

  afterEach(async () => {
    await resetDb(db);
  });

  afterAll(async () => {
    await close();
  });

  /**
   * Crea una posición y retrasa su lote inicial a `START_DATE`. El alta fecha el lote HOY, así
   * que sin esto los tests que añaden lotes con fechas fijas dependerían de la fecha del
   * sistema (una venta anterior a la compra daría, con razón, cantidad negativa).
   */
  async function createBackdated(
    userId: string,
    partial: Partial<CreatePositionDto> & { ticker: string },
  ) {
    const position = await service.create(userId, dto(partial));
    const [initial] = await lots.listByPosition(userId, position.id);
    await lots.update(userId, position.id, initial.id, { tradedAt: START_DATE });
    return position;
  }

  describe('backfill de la migración', () => {
    it('crea un lote de compra por posición y sus agregados CUADRAN con la posición', async () => {
      const userId = await insertUser(db, 'a@example.com');
      // Posición "antigua": insertada a mano, como estaría en producción antes de migrar.
      const [existing] = await db
        .insert(positions)
        .values({
          userId,
          ticker: 'IWDA',
          quantity: '12.500000',
          avgPrice: '95.420000',
          currency: 'EUR',
          createdAt: new Date('2025-11-02T23:30:00Z'),
        })
        .returning();

      await db.execute(sql.raw(readBackfillStatement()));

      const rows = await db
        .select()
        .from(positionLots)
        .where(eq(positionLots.positionId, existing.id));

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        userId,
        kind: 'buy',
        quantity: '12.500000',
        price: '95.420000',
        fees: '0.000000',
        // Fecha de alta convertida en UTC (no en la zona de la sesión: 23:30Z NO es el día 3).
        tradedAt: '2025-11-02',
      });

      // Lo que exige la regla de oro: la foto y la película dicen lo mismo.
      expect(aggregateLots(rows)).toMatchObject({
        quantity: existing.quantity,
        avgPrice: existing.avgPrice,
      });
    });

    it('es idempotente: reejecutarlo no duplica lotes', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await db
        .insert(positions)
        .values({ userId, ticker: 'VWCE', quantity: '3', avgPrice: '110', currency: 'EUR' });

      const backfill = readBackfillStatement();
      await db.execute(sql.raw(backfill));
      await db.execute(sql.raw(backfill));

      expect(await db.select().from(positionLots)).toHaveLength(1);
    });
  });

  describe('sincronía posición ↔ lotes', () => {
    it('el alta de una posición crea su lote inicial de compra', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const position = await service.create(userId, dto({ ticker: 'IWDA', quantity: 10, avgPrice: 100 }));

      const rows = await lots.listByPosition(userId, position.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ kind: 'buy', quantity: 10, price: 100 });
    });

    it('añadir una compra recalcula cantidad y precio medio de la posición', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const position = await createBackdated(userId, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });

      await lots.create(userId, position.id, {
        kind: 'buy',
        quantity: 10,
        price: 200,
        tradedAt: '2026-06-01',
      });

      const [updated] = await service.findAllByUser(userId);
      expect(updated.quantity).toBe(20);
      expect(updated.avgPrice).toBe(150);
    });

    it('una venta baja la cantidad y NO mueve el precio medio', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const position = await createBackdated(userId, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });

      await lots.create(userId, position.id, {
        kind: 'sell',
        quantity: 4,
        price: 180,
        fees: 1.5,
        tradedAt: '2026-06-01',
      });

      const [updated] = await service.findAllByUser(userId);
      expect(updated.quantity).toBe(6);
      expect(updated.avgPrice).toBe(100);
    });

    it('rechaza vender más de lo que se tiene y NO deja el lote guardado (rollback)', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const position = await createBackdated(userId, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });

      await expect(
        lots.create(userId, position.id, {
          kind: 'sell',
          quantity: 11,
          price: 180,
          tradedAt: '2026-06-01',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      // Ni el lote inválido ni un descuadre en la posición.
      expect(await lots.listByPosition(userId, position.id)).toHaveLength(1);
      expect((await service.findAllByUser(userId))[0].quantity).toBe(10);
    });

    it('borrar un lote reagrega el resto', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const position = await createBackdated(userId, { ticker: 'IWDA', quantity: 10, avgPrice: 100 });
      const extra = await lots.create(userId, position.id, {
        kind: 'buy',
        quantity: 10,
        price: 200,
        tradedAt: '2026-06-01',
      });

      await lots.remove(userId, position.id, extra.id);

      const [updated] = await service.findAllByUser(userId);
      expect(updated.quantity).toBe(10);
      expect(updated.avgPrice).toBe(100);
    });

    it('editar un lote reagrega la posición', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const position = await service.create(userId, dto({ ticker: 'IWDA', quantity: 10, avgPrice: 100 }));
      const [initial] = await lots.listByPosition(userId, position.id);

      await lots.update(userId, position.id, initial.id, { quantity: 25 });

      expect((await service.findAllByUser(userId))[0].quantity).toBe(25);
    });

    it('borrar la posición borra sus lotes (cascada)', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const position = await service.create(userId, dto({ ticker: 'IWDA' }));

      await service.remove(userId, position.id);

      expect(await db.select().from(positionLots)).toHaveLength(0);
    });
  });

  describe('combine registra histórico y no pierde precisión', () => {
    it('deja un lote por compra y recalcula la media ponderada', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const position = await service.create(userId, dto({ ticker: 'IWDA', quantity: 10, avgPrice: 100 }));

      const combined = await service.combine(userId, position.id, { quantity: 10, avgPrice: 200 });

      expect(combined.quantity).toBe(20);
      expect(combined.avgPrice).toBe(150);
      expect(await lots.listByPosition(userId, position.id)).toHaveLength(2);
    });

    it('mantiene el precio medio EXACTO donde la media en coma flotante lo desplazaría', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const position = await service.create(userId, dto({ ticker: 'IWDA', quantity: 1, avgPrice: 0.1 }));

      await service.combine(userId, position.id, { quantity: 1, avgPrice: 0.2 });
      const result = await service.combine(userId, position.id, { quantity: 1, avgPrice: 0.3 });

      // Coste 0,6 sobre 3 títulos = 0,2 exacto. La cadena anterior con `Number()` daba
      // 0.20000000000000004 y lo guardaba redondeado arrastrando el error.
      const [row] = await db.select().from(positions).where(eq(positions.id, position.id));
      expect(row.avgPrice).toBe('0.200000');
      expect(result.avgPrice).toBe(0.2);
    });
  });

  describe('edición manual de cantidad/precio medio', () => {
    it('con un solo lote lo edita EN SITIO (no pierde el histórico)', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const position = await service.create(userId, dto({ ticker: 'IWDA', quantity: 10, avgPrice: 100 }));
      const [initial] = await lots.listByPosition(userId, position.id);

      const updated = await service.update(userId, position.id, { quantity: 7, avgPrice: 120 });

      const rows = await lots.listByPosition(userId, position.id);
      expect(updated).toMatchObject({ quantity: 7, avgPrice: 120 });
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(initial.id);
      expect(rows[0]).toMatchObject({ quantity: 7, price: 120 });
    });

    it('con varios lotes los colapsa en uno, conservando la fecha más antigua', async () => {
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
      expect(rows[0].tradedAt).toBe(START_DATE);
    });

    it('editar solo el bróker no toca los lotes', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const position = await service.create(userId, dto({ ticker: 'IWDA', quantity: 10, avgPrice: 100 }));
      const before = await lots.listByPosition(userId, position.id);

      await service.update(userId, position.id, { broker: 'Degiro' });

      expect(await lots.listByPosition(userId, position.id)).toEqual(before);
    });
  });

  describe('aislamiento entre usuarios', () => {
    it('un usuario no puede listar ni crear lotes en la posición de otro (403)', async () => {
      const userA = await insertUser(db, 'a@example.com');
      const userB = await insertUser(db, 'b@example.com');
      const position = await service.create(userA, dto({ ticker: 'IWDA' }));

      await expect(lots.listByPosition(userB, position.id)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(
        lots.create(userB, position.id, {
          kind: 'buy',
          quantity: 1,
          price: 1,
          tradedAt: '2026-06-01',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('un lote de OTRA posición del propio usuario no se alcanza por la ruta (404)', async () => {
      const userId = await insertUser(db, 'a@example.com');
      const first = await service.create(userId, dto({ ticker: 'IWDA' }));
      const second = await service.create(userId, dto({ ticker: 'VWCE' }));
      const [foreignLot] = await lots.listByPosition(userId, second.id);

      await expect(
        lots.remove(userId, first.id, foreignLot.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('una posición inexistente da 404', async () => {
      const userId = await insertUser(db, 'a@example.com');
      await expect(lots.listByPosition(userId, randomUUID())).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
