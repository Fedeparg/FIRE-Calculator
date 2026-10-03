import { BadRequestException, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../db/database.module.js';
import { incomeEvents, positions } from '../db/schema.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import { createIncomeSchema } from './dto/create-income.dto.js';
import { updateIncomeSchema } from './dto/update-income.dto.js';
import { IncomeService } from './income.service.js';
import { firstItem } from '@sextante/core/arrays';

describe('IncomeService (integración con Postgres)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let service: IncomeService;

  beforeAll(() => {
    ({ db, close } = createTestDb());
    service = new IncomeService(db);
  });
  afterEach(() => resetDb(db));
  afterAll(() => close());

  async function positionFor(userId: string): Promise<string> {
    const row = firstItem(
      await db
        .insert(positions)
        .values({ userId, ticker: 'AAPL', quantity: '1', avgPrice: '100', currency: 'USD' })
        .returning(),
    );
    return row.id;
  }

  const dividend = {
    kind: 'dividend' as const,
    paidAt: '2025-08-14',
    country: 'US',
    currency: 'USD' as const,
    gross: 0.26,
    withholdingOrigin: 0.04,
    withholdingSpain: 0.04,
  };

  it('crea, lista por ejercicio y por posición, actualiza y borra', async () => {
    const userId = await insertUser(db, 'a@example.com');
    const positionId = await positionFor(userId);

    const created = await service.create(userId, { ...dividend, positionId });
    expect(created).toMatchObject({
      positionId,
      kind: 'dividend',
      gross: 0.26,
      withholdingOrigin: 0.04,
      withholdingSpain: 0.04,
      reportedToAeat: false,
      source: 'manual',
    });
    await service.create(userId, { kind: 'interest', paidAt: '2024-12-31', gross: 3 });

    expect((await service.list(userId)).map((e) => e.paidAt)).toEqual(['2024-12-31', '2025-08-14']);
    expect((await service.list(userId, { year: 2025 })).map((e) => e.id)).toEqual([created.id]);
    expect((await service.list(userId, { positionId })).map((e) => e.id)).toEqual([created.id]);

    const updated = await service.update(userId, created.id, { withholdingOrigin: null, reportedToAeat: true });
    expect(updated).toMatchObject({ withholdingOrigin: null, reportedToAeat: true, gross: 0.26 });

    await service.remove(userId, created.id);
    expect(await service.list(userId, { year: 2025 })).toEqual([]);
  });

  it('un cobro o una posición de otro usuario dan 404', async () => {
    const a = await insertUser(db, 'a@example.com');
    const b = await insertUser(db, 'b@example.com');
    const created = await service.create(a, dividend);
    const foreignPosition = await positionFor(a);

    await expect(service.update(b, created.id, { gross: 1 })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove(b, created.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.create(b, { ...dividend, positionId: foreignPosition })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(await service.list(b)).toEqual([]);
  });

  it('rechaza retenciones mayores que el íntegro, también al actualizar parcialmente', async () => {
    expect(createIncomeSchema.safeParse({ ...dividend, withholdingSpain: 0.3 }).success).toBe(false);
    expect(createIncomeSchema.safeParse({ ...dividend, gross: 0 }).success).toBe(false);
    expect(updateIncomeSchema.safeParse({}).success).toBe(false);

    const userId = await insertUser(db, 'a@example.com');
    const created = await service.create(userId, dividend);
    await expect(service.update(userId, created.id, { gross: 0.05 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('acepta retenciones que suman exactamente el íntegro aunque en coma flotante no cuadre (0,1 + 0,2 = 0,3)', async () => {
    const exact = { ...dividend, gross: 0.3, withholdingOrigin: 0.1, withholdingSpain: 0.2 };
    expect(createIncomeSchema.safeParse(exact).success).toBe(true);

    const userId = await insertUser(db, 'a@example.com');
    const created = await service.create(userId, exact);
    await expect(service.update(userId, created.id, { gross: 0.6, withholdingOrigin: 0.4 })).resolves.toMatchObject({
      gross: 0.6,
    });
  });

  it('borrar la posición deja el cobro sin posición, no lo borra', async () => {
    const userId = await insertUser(db, 'a@example.com');
    const positionId = await positionFor(userId);
    const created = await service.create(userId, { ...dividend, positionId });

    await db.delete(positions).where(eq(positions.id, positionId));
    const row = firstItem(await db.select().from(incomeEvents).where(eq(incomeEvents.id, created.id)));
    expect(row.positionId).toBeNull();
  });
});
