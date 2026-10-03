import type { NotificationLocale, NotificationSettingsResponse } from '@sextante/core/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';

import { FIRE_CALCULATOR_SLUG } from '@sextante/core/portfolio/goal';
import { DRIZZLE, type Database } from '../db/database.module.js';
import { savedScenarios, userNotificationSettings } from '../db/schema.js';

const asLocale = (value: string): NotificationLocale => (value === 'en' ? 'en' : 'es');

/**
 * Email notification preferences. Without a row, everything is off: alerts are opt-in.
 */
@Injectable()
export class NotificationSettingsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async get(userId: string): Promise<NotificationSettingsResponse> {
    const [row] = await this.db
      .select()
      .from(userNotificationSettings)
      .where(eq(userNotificationSettings.userId, userId));
    return {
      fireAlertsEnabled: row?.fireAlertsEnabled ?? false,
      locale: asLocale(row?.locale ?? 'es'),
      lastFireMilestone: row?.lastFireMilestone ?? null,
      goal: await this.latestGoal(userId),
    };
  }

  /**
   * Enables or disables the alerts and sets the language. When ENABLING them (if they were off)
   * the last notified milestone is cleared: the next evaluation takes the progress at that moment as
   * the reference without sending anything, instead of notifying a milestone passed long ago.
   */
  async update(
    userId: string,
    input: { fireAlertsEnabled: boolean; locale: NotificationLocale },
  ): Promise<NotificationSettingsResponse> {
    await this.db
      .insert(userNotificationSettings)
      .values({ userId, fireAlertsEnabled: input.fireAlertsEnabled, locale: input.locale })
      .onConflictDoUpdate({
        target: userNotificationSettings.userId,
        set: {
          fireAlertsEnabled: input.fireAlertsEnabled,
          locale: input.locale,
          updatedAt: new Date(),
          // The milestone is only kept if alerts were already on; otherwise the reference is taken again.
          lastFireMilestone: sql`CASE WHEN ${userNotificationSettings.fireAlertsEnabled} THEN ${userNotificationSettings.lastFireMilestone} ELSE NULL END`,
        },
      });
    return this.get(userId);
  }

  /** Unsubscribe from the email link. Idempotent; without a row there is nothing to disable. */
  async unsubscribe(userId: string): Promise<void> {
    await this.db
      .update(userNotificationSettings)
      .set({ fireAlertsEnabled: false, updatedAt: new Date() })
      .where(eq(userNotificationSettings.userId, userId));
  }

  /** The user's most recent FIRE scenario (the goal the alerts watch). */
  async latestGoalInputs(
    userId: string,
  ): Promise<{ id: string; name: string; updatedAt: Date; inputs: Record<string, unknown> } | null> {
    const [row] = await this.db
      .select({
        id: savedScenarios.id,
        name: savedScenarios.name,
        updatedAt: savedScenarios.updatedAt,
        inputs: savedScenarios.inputs,
      })
      .from(savedScenarios)
      .where(and(eq(savedScenarios.userId, userId), eq(savedScenarios.slug, FIRE_CALCULATOR_SLUG)))
      .orderBy(desc(savedScenarios.updatedAt))
      .limit(1);
    return row ?? null;
  }

  private async latestGoal(userId: string): Promise<NotificationSettingsResponse['goal']> {
    const goal = await this.latestGoalInputs(userId);
    return goal ? { name: goal.name, updatedAt: goal.updatedAt.toISOString() } : null;
  }
}
