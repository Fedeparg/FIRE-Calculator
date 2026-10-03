import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { FIRE_CALCULATOR_SLUG } from '@sextante/core/portfolio/goal';

import type { Database } from '../db/database.module.js';
import { savedScenarios, userNotificationSettings, users } from '../db/schema.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import { NotificationSettingsService } from './notification-settings.service.js';

describe('NotificationSettingsService (Postgres integration)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let service: NotificationSettingsService;

  beforeAll(() => {
    ({ db, close } = createTestDb());
    service = new NotificationSettingsService(db);
  });

  afterEach(async () => {
    await resetDb(db);
  });

  afterAll(async () => {
    await close();
  });

  it('without a row, everything is off and in Spanish', async () => {
    const userId = await insertUser(db, 'a@example.com');
    expect(await service.get(userId)).toEqual({
      fireAlertsEnabled: false,
      locale: 'es',
      lastFireMilestone: null,
      goal: null,
    });
  });

  it('enabling stores the language and resets the reference; re-enabling takes it again', async () => {
    const userId = await insertUser(db, 'a@example.com');
    await service.update(userId, { fireAlertsEnabled: true, locale: 'en' });
    await db
      .update(userNotificationSettings)
      .set({ lastFireMilestone: 50 })
      .where(eq(userNotificationSettings.userId, userId));

    // Changing only the language while alerts are on keeps the milestone.
    expect((await service.update(userId, { fireAlertsEnabled: true, locale: 'es' })).lastFireMilestone).toBe(50);
    // Disabling and enabling again resets it.
    await service.update(userId, { fireAlertsEnabled: false, locale: 'es' });
    const reenabled = await service.update(userId, { fireAlertsEnabled: true, locale: 'es' });
    expect(reenabled).toMatchObject({ fireAlertsEnabled: true, lastFireMilestone: null });
  });

  it('the goal is the most recently updated FIRE scenario', async () => {
    const userId = await insertUser(db, 'a@example.com');
    await db.insert(savedScenarios).values([
      { userId, slug: FIRE_CALCULATOR_SLUG, name: 'Old', inputs: {}, updatedAt: new Date('2026-01-01') },
      { userId, slug: FIRE_CALCULATOR_SLUG, name: 'New', inputs: {}, updatedAt: new Date('2026-06-01') },
      { userId, slug: 'interes-compuesto', name: 'Other', inputs: {}, updatedAt: new Date('2026-09-01') },
    ]);

    expect((await service.get(userId)).goal?.name).toBe('New');
  });

  it('unsubscribing disables alerts and is idempotent; without a row it does nothing', async () => {
    const userId = await insertUser(db, 'a@example.com');
    await service.unsubscribe(userId);
    expect((await service.get(userId)).fireAlertsEnabled).toBe(false);

    await service.update(userId, { fireAlertsEnabled: true, locale: 'es' });
    await service.unsubscribe(userId);
    await service.unsubscribe(userId);
    expect((await service.get(userId)).fireAlertsEnabled).toBe(false);
  });

  it('deleting the account deletes the preferences (cascade)', async () => {
    const userId = await insertUser(db, 'a@example.com');
    await service.update(userId, { fireAlertsEnabled: true, locale: 'es' });
    await db.delete(users).where(eq(users.id, userId));
    expect(await db.select().from(userNotificationSettings)).toHaveLength(0);
  });
});
