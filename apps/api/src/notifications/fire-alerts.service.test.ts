import { eq } from 'drizzle-orm';
import { firstItem, itemAt } from '@sextante/core/arrays';
import { FIRE_CALCULATOR_SLUG } from '@sextante/core/portfolio/goal';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Database } from '../db/database.module.js';
import { portfolioSnapshots, savedScenarios, userNotificationSettings } from '../db/schema.js';
import type { EmailService } from '../email/email.service.js';
import type { FireMilestoneEmail } from '../email/templates/fire-milestone.js';
import { fakeConfig } from '../../test/config.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import { FireAlertsService } from './fire-alerts.service.js';
import { NotificationSettingsService } from './notification-settings.service.js';
import { verifyUnsubscribeToken } from './unsubscribe-token.js';

const DATE = '2026-09-28';
const SECRET = 'test-secret';
const config = fakeConfig({ APP_URL: 'https://sextante.test/', JWT_SECRET: SECRET });

describe('FireAlertsService (Postgres integration)', () => {
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

  /** User with alerts on, a €600,000 goal and the reference already taken. */
  /** Goal reference as the service stores it: `<id>@<updatedAt>`. */
  async function goalRef(userId: string) {
    const goal = await settings.latestGoalInputs(userId);
    return goal ? `${goal.id}@${goal.updatedAt.toISOString()}` : null;
  }

  async function subscriber(email: string, options: { last?: number | null; locale?: 'es' | 'en' } = {}) {
    const userId = await insertUser(db, email);
    await settings.update(userId, { fireAlertsEnabled: true, locale: options.locale ?? 'es' });
    await db.insert(savedScenarios).values({
      userId,
      slug: FIRE_CALCULATOR_SLUG,
      name: 'My goal',
      inputs: { annualExpenses: 24000, withdrawalRate: 4 },
    });
    // Reference already taken on THIS goal (unless the test asks to start without one).
    await db
      .update(userNotificationSettings)
      .set({
        lastFireMilestone: options.last === undefined ? 0 : options.last,
        fireGoalRef: options.last === null ? null : await goalRef(userId),
      })
      .where(eq(userNotificationSettings.userId, userId));
    return userId;
  }

  async function snapshot(
    userId: string,
    marketValueEur: number,
    extra: Partial<typeof portfolioSnapshots.$inferInsert> = {},
  ) {
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
    const row = firstItem(
      await db
        .select({ last: userNotificationSettings.lastFireMilestone })
        .from(userNotificationSettings)
        .where(eq(userNotificationSettings.userId, userId)),
    );
    return row.last;
  }

  it('sends the reached milestone only once, with valid unsubscribe links', async () => {
    build();
    const userId = await subscriber('a@example.com');
    await snapshot(userId, 160_000); // 26.7 % of 600,000

    const first = await service.evaluateAll(DATE);
    const second = await service.evaluateAll(DATE);

    expect(first).toEqual({ users: 1, sent: 1, failed: 0 });
    expect(second.sent).toBe(0);
    expect(sent).toHaveLength(1);
    expect(itemAt(sent, 0).to).toBe('a@example.com');
    expect(itemAt(sent, 0).email).toMatchObject({ milestone: 25, target: 600000, currency: 'EUR', locale: 'es' });
    expect(itemAt(sent, 0).email.portfolioUrl).toBe('https://sextante.test/portfolio');
    const token = decodeURIComponent(new URL(itemAt(sent, 0).email.unsubscribeUrl).searchParams.get('token') ?? '');
    expect(verifyUnsubscribeToken(token, SECRET)).toBe(userId);
    expect(itemAt(sent, 0).oneClick).toContain('/api/notifications/unsubscribe?token=');
    expect(await lastMilestone(userId)).toBe(25);
  });

  it("when several milestones are crossed at once it only notifies the highest, in the user's language", async () => {
    build();
    const userId = await subscriber('a@example.com', { locale: 'en' });
    await snapshot(userId, 480_000); // 80 %

    await service.evaluateAll(DATE);

    expect(sent.map((s) => s.email.milestone)).toEqual([75]);
    expect(itemAt(sent, 0).email.locale).toBe('en');
    expect(itemAt(sent, 0).email.unsubscribeUrl).toContain('https://sextante.test/en/alertas/baja?token=');
  });

  it('a drop below an already notified milestone triggers nothing', async () => {
    build();
    const userId = await subscriber('a@example.com', { last: 50 });
    await snapshot(userId, 200_000); // 33 %

    await service.evaluateAll(DATE);

    expect(sent).toHaveLength(0);
    expect(await lastMilestone(userId)).toBe(50);
  });

  it('just enabled: takes the reference without sending', async () => {
    build();
    const userId = await subscriber('a@example.com', { last: null });
    await snapshot(userId, 330_000); // 55 %

    await service.evaluateAll(DATE);

    expect(sent).toHaveLength(0);
    expect(await lastMilestone(userId)).toBe(50);
  });

  it('changing the goal silently retakes the reference and later notifies against the new one', async () => {
    build();
    const userId = await subscriber('a@example.com', { last: 100 });
    // Larger goal: €1,200,000. €420,000 is 35 %.
    await db
      .update(savedScenarios)
      .set({ inputs: { annualExpenses: 48000, withdrawalRate: 4 } })
      .where(eq(savedScenarios.userId, userId));
    await snapshot(userId, 420_000);

    await service.evaluateAll(DATE);
    expect(sent).toHaveLength(0);
    expect(await lastMilestone(userId)).toBe(25);

    // Another night, now above 50 % of the new goal: this time it notifies.
    await db.delete(portfolioSnapshots).where(eq(portfolioSnapshots.userId, userId));
    await snapshot(userId, 650_000);
    await service.evaluateAll(DATE);
    expect(sent.map((s) => [s.email.milestone, s.email.target])).toEqual([[50, 1_200_000]]);
  });

  it('converts the euro value to the goal currency with the snapshot rates', async () => {
    build();
    const userId = await subscriber('a@example.com');
    await db
      .update(savedScenarios)
      .set({ inputs: { annualExpenses: 24000, withdrawalRate: 4, goalCurrency: 'USD' } })
      .where(eq(savedScenarios.userId, userId));
    // Editing the goal changes its version: the reference is set as already taken on the new one.
    await db
      .update(userNotificationSettings)
      .set({ fireGoalRef: await goalRef(userId) })
      .where(eq(userNotificationSettings.userId, userId));
    // €150,000 × 1.1 = $165,000 → 27.5 % of $600,000.
    await snapshot(userId, 150_000);

    await service.evaluateAll(DATE);

    expect(itemAt(sent, 0).email).toMatchObject({ milestone: 25, currency: 'USD' });
    expect(itemAt(sent, 0).email.currentValue).toBeCloseTo(165_000, 6);
  });

  it('skips users without a goal, without a real snapshot today or with alerts off', async () => {
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

  it('a failed send neither blocks the others nor is retried', async () => {
    build({
      sendFireMilestone: vi.fn((to: string) =>
        to === 'broken@example.com' ? Promise.reject(new Error('Resend down')) : Promise.resolve(),
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
