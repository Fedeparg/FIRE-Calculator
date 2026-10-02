import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../db/database.module.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import { replacePendingBalancesSchema } from './dto/pending-balances.dto.js';
import { PendingBalancesService } from './pending-balances.service.js';

describe('PendingBalancesService (integración con Postgres)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let service: PendingBalancesService;

  beforeAll(() => {
    ({ db, close } = createTestDb());
    service = new PendingBalancesService(db);
  });
  afterEach(() => resetDb(db));
  afterAll(() => close());

  it('sustituye la lista entera y la devuelve ordenada', async () => {
    const userId = await insertUser(db, 'a@example.com');
    await service.replace(userId, { balances: [{ originYear: 2022, kind: 'gains', amount: 2100 }] });
    const saved = await service.replace(userId, {
      balances: [
        { originYear: 2022, kind: 'gains', amount: 2100 },
        { originYear: 2021, kind: 'capitalIncome', amount: 500 },
        { originYear: 2021, kind: 'gains', amount: 700.456 },
      ],
    });
    expect(saved).toEqual([
      { originYear: 2021, kind: 'capitalIncome', amount: 500 },
      { originYear: 2021, kind: 'gains', amount: 700.46 },
      { originYear: 2022, kind: 'gains', amount: 2100 },
    ]);
    expect(await service.replace(userId, { balances: [] })).toEqual([]);
  });

  it('cada usuario solo ve los suyos', async () => {
    const a = await insertUser(db, 'a@example.com');
    const b = await insertUser(db, 'b@example.com');
    await service.replace(a, { balances: [{ originYear: 2022, kind: 'gains', amount: 100 }] });
    expect(await service.list(b)).toEqual([]);
  });

  it('rechaza importes no positivos y ejercicios repetidos', () => {
    const one = { originYear: 2022, kind: 'gains', amount: 100 };
    expect(replacePendingBalancesSchema.safeParse({ balances: [{ ...one, amount: 0 }] }).success).toBe(false);
    expect(replacePendingBalancesSchema.safeParse({ balances: [one, one] }).success).toBe(false);
    expect(replacePendingBalancesSchema.safeParse({ balances: [one] }).success).toBe(true);
  });
});
