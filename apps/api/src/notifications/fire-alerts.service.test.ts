import type { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Database } from '../db/database.module.js';
import { portfolioSnapshots, savedScenarios, userNotificationSettings } from '../db/schema.js';
import type { EmailService } from '../email/email.service.js';
import type { FireMilestoneEmail } from '../email/templates/fire-milestone.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import { FireAlertsService } from './fire-alerts.service.js';
import { FIRE_SCENARIO_SLUG, NotificationSettingsService } from './notification-settings.service.js';
import { verifyUnsubscribeToken } from './unsubscribe-token.js';

const DATE = '2026-09-28';
const SECRET = 'test-secret';
const config = {
  getOrThrow: (key: string) => ({ APP_URL: 'https://sextante.test/', JWT_SECRET: SECRET })[key],
} as unknown as ConfigService;

describe('FireAlertsService (integración con Postgres)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let settings: NotificationSettingsService;
  let sent: { to: string; email: FireMilestoneEmail; oneClick: string }[];
  let service: FireAlertsService;

  beforeAll(() => {
    ({ db, close } = createTestDb());
    settings = new NotificationSettingsService(db);
  });

  afterEach(async () => {
    await resetDb(db);
  });

  afterAll(async () => {
    await close();
  });

  function build(email?: Partial<EmailService>) {
    sent = [];
    const transport: EmailService = {
      sendMagicLink: vi.fn(),
      sendFireMilestone: vi.fn((to: string, message: FireMilestoneEmail, oneClick: string) => {
        sent.push({ to, email: message, oneClick });
        return Promise.resolve();
      }),
      ...email,
    };
    service = new FireAlertsService(db, transport, settings, config);
  }

  /** Usuario con alertas activas, un objetivo de 600.000 € y ya con referencia tomada. */
  async function subscriber(email: string, options: { last?: number | null; locale?: 'es' | 'en' } = {}) {
    const userId = await insertUser(db, email);
    await settings.update(userId, { fireAlertsEnabled: true, locale: options.locale ?? 'es' });
    await db
      .update(userNotificationSettings)
      .set({ lastFireMilestone: options.last === undefined ? 0 : options.last })
      .where(eq(userNotificationSettings.userId, userId));
    await db.insert(savedScenarios).values({
      userId,
      slug: FIRE_SCENARIO_SLUG,
      name: 'Mi objetivo',
      inputs: { annualExpenses: 24000, withdrawalRate: 4 },
    });
    return userId;
  }

  async function snapshot(userId: string, marketValueEur: number, extra: Partial<typeof portfolioSnapshots.$inferInsert> = {}) {
    await db.insert(portfolioSnapshots).values({
      userId,
      date: DATE,
      invested: '0',
      marketValue: String(marketValueEur),
      valuedPositions: 1,
      totalPositions: 1,
      fxRates: { USD: 1, EUR: 1.1 },
      ...extra,
    });
  }

  async function lastMilestone(userId: string) {
    const [row] = await db
      .select({ last: userNotificationSettings.lastFireMilestone })
      .from(userNotificationSettings)
      .where(eq(userNotificationSettings.userId, userId));
    return row.last;
  }

  it('envía el hito alcanzado una sola vez, con enlaces de baja válidos', async () => {
    build();
    const userId = await subscriber('a@example.com');
    await snapshot(userId, 160_000); // 26,7 % de 600.000

    const first = await service.evaluateAll(DATE);
    const second = await service.evaluateAll(DATE);

    expect(first).toEqual({ users: 1, sent: 1, failed: 0 });
    expect(second.sent).toBe(0);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('a@example.com');
    expect(sent[0].email).toMatchObject({ milestone: 25, target: 600000, currency: 'EUR', locale: 'es' });
    expect(sent[0].email.portfolioUrl).toBe('https://sextante.test/portfolio');
    const token = decodeURIComponent(new URL(sent[0].email.unsubscribeUrl).searchParams.get('token') ?? '');
    expect(verifyUnsubscribeToken(token, SECRET)).toBe(userId);
    expect(sent[0].oneClick).toContain('/api/notifications/unsubscribe?token=');
    expect(await lastMilestone(userId)).toBe(25);
  });

  it('si se cruzan varios hitos de golpe solo avisa del mayor, y en su idioma', async () => {
    build();
    const userId = await subscriber('a@example.com', { locale: 'en' });
    await snapshot(userId, 480_000); // 80 %

    await service.evaluateAll(DATE);

    expect(sent.map((s) => s.email.milestone)).toEqual([75]);
    expect(sent[0].email.locale).toBe('en');
    expect(sent[0].email.unsubscribeUrl).toContain('https://sextante.test/en/alertas/baja?token=');
  });

  it('una caída por debajo de un hito ya avisado no dispara nada', async () => {
    build();
    const userId = await subscriber('a@example.com', { last: 50 });
    await snapshot(userId, 200_000); // 33 %

    await service.evaluateAll(DATE);

    expect(sent).toHaveLength(0);
    expect(await lastMilestone(userId)).toBe(50);
  });

  it('recién activadas: toma referencia sin enviar', async () => {
    build();
    const userId = await subscriber('a@example.com', { last: null });
    await snapshot(userId, 330_000); // 55 %

    await service.evaluateAll(DATE);

    expect(sent).toHaveLength(0);
    expect(await lastMilestone(userId)).toBe(50);
  });

  it('convierte el valor en euros a la divisa del objetivo con las tasas del snapshot', async () => {
    build();
    const userId = await subscriber('a@example.com');
    await db
      .update(savedScenarios)
      .set({ inputs: { annualExpenses: 24000, withdrawalRate: 4, goalCurrency: 'USD' } })
      .where(eq(savedScenarios.userId, userId));
    // 150.000 € × 1,1 = 165.000 $ → 27,5 % de 600.000 $.
    await snapshot(userId, 150_000);

    await service.evaluateAll(DATE);

    expect(sent[0].email).toMatchObject({ milestone: 25, currency: 'USD' });
    expect(sent[0].email.currentValue).toBeCloseTo(165_000, 6);
  });

  it('se salta usuarios sin objetivo, sin snapshot real de hoy o con alertas desactivadas', async () => {
    build();
    const noGoal = await insertUser(db, 'nogoal@example.com');
    await settings.update(noGoal, { fireAlertsEnabled: true, locale: 'es' });
    await snapshot(noGoal, 999_999);

    const estimatedOnly = await subscriber('estimated@example.com');
    await snapshot(estimatedOnly, 999_999, { estimated: true });

    const disabled = await subscriber('off@example.com');
    await snapshot(disabled, 999_999);
    await settings.update(disabled, { fireAlertsEnabled: false, locale: 'es' });

    const summary = await service.evaluateAll(DATE);

    expect(summary).toEqual({ users: 2, sent: 0, failed: 0 });
    expect(sent).toHaveLength(0);
  });

  it('un fallo de envío no bloquea a los demás ni se reintenta', async () => {
    build({
      sendFireMilestone: vi.fn((to: string) =>
        to === 'broken@example.com' ? Promise.reject(new Error('Resend caído')) : Promise.resolve(),
      ),
    });
    const broken = await subscriber('broken@example.com');
    const ok = await subscriber('ok@example.com');
    await snapshot(broken, 160_000);
    await snapshot(ok, 160_000);

    const first = await service.evaluateAll(DATE);
    const second = await service.evaluateAll(DATE);

    expect(first).toEqual({ users: 2, sent: 1, failed: 1 });
    expect(second).toEqual({ users: 2, sent: 0, failed: 0 });
  });
});
