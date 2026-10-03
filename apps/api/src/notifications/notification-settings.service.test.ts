import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { FIRE_CALCULATOR_SLUG } from '@sextante/core/portfolio/goal';

import type { Database } from '../db/database.module.js';
import { savedScenarios, userNotificationSettings, users } from '../db/schema.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import { NotificationSettingsService } from './notification-settings.service.js';

describe('NotificationSettingsService (integración con Postgres)', () => {
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

  it('sin fila, todo desactivado y en español', async () => {
    const userId = await insertUser(db, 'a@example.com');
    expect(await service.get(userId)).toEqual({
      fireAlertsEnabled: false,
      locale: 'es',
      lastFireMilestone: null,
      goal: null,
    });
  });

  it('activar guarda idioma y reinicia la referencia; reactivar vuelve a tomarla', async () => {
    const userId = await insertUser(db, 'a@example.com');
    await service.update(userId, { fireAlertsEnabled: true, locale: 'en' });
    await db
      .update(userNotificationSettings)
      .set({ lastFireMilestone: 50 })
      .where(eq(userNotificationSettings.userId, userId));

    // Cambiar solo el idioma con las alertas activas conserva el hito.
    expect((await service.update(userId, { fireAlertsEnabled: true, locale: 'es' })).lastFireMilestone).toBe(50);
    // Desactivar y volver a activar lo reinicia.
    await service.update(userId, { fireAlertsEnabled: false, locale: 'es' });
    const reenabled = await service.update(userId, { fireAlertsEnabled: true, locale: 'es' });
    expect(reenabled).toMatchObject({ fireAlertsEnabled: true, lastFireMilestone: null });
  });

  it('el objetivo es el escenario FIRE actualizado más recientemente', async () => {
    const userId = await insertUser(db, 'a@example.com');
    await db.insert(savedScenarios).values([
      { userId, slug: FIRE_CALCULATOR_SLUG, name: 'Viejo', inputs: {}, updatedAt: new Date('2026-01-01') },
      { userId, slug: FIRE_CALCULATOR_SLUG, name: 'Nuevo', inputs: {}, updatedAt: new Date('2026-06-01') },
      { userId, slug: 'interes-compuesto', name: 'Otro', inputs: {}, updatedAt: new Date('2026-09-01') },
    ]);

    expect((await service.get(userId)).goal?.name).toBe('Nuevo');
  });

  it('la baja desactiva y es idempotente; sin fila no hace nada', async () => {
    const userId = await insertUser(db, 'a@example.com');
    await service.unsubscribe(userId);
    expect((await service.get(userId)).fireAlertsEnabled).toBe(false);

    await service.update(userId, { fireAlertsEnabled: true, locale: 'es' });
    await service.unsubscribe(userId);
    await service.unsubscribe(userId);
    expect((await service.get(userId)).fireAlertsEnabled).toBe(false);
  });

  it('borrar la cuenta borra las preferencias (cascada)', async () => {
    const userId = await insertUser(db, 'a@example.com');
    await service.update(userId, { fireAlertsEnabled: true, locale: 'es' });
    await db.delete(users).where(eq(users.id, userId));
    expect(await db.select().from(userNotificationSettings)).toHaveLength(0);
  });
});
