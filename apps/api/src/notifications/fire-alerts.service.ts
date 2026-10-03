import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, lt } from 'drizzle-orm';

import type { Env } from '../config/env.js';
import { DRIZZLE, type Database } from '../db/database.module.js';
import { portfolioSnapshots, userNotificationSettings, users } from '../db/schema.js';
import { EMAIL_SERVICE, type EmailService } from '../email/email.service.js';
import { convertCurrency } from '@sextante/core/fx';
import { fireTargetFromInputs, newMilestone, reachedMilestone } from './fire-milestones.js';
import { NotificationSettingsService } from './notification-settings.service.js';
import { createUnsubscribeToken } from './unsubscribe-token.js';
import { todayUtc } from '../common/dates.js';
import { errorMessage } from '../common/errors.js';

/** Result of one pass, for the nightly job's log. */
export interface FireAlertsSummary {
  users: number;
  sent: number;
  failed: number;
}

type Outcome = 'sent' | 'skipped';

/**
 * Evaluates the FIRE goal milestones of every user with alerts enabled, right after the nightly
 * snapshot capture, and sends one email per newly reached milestone.
 *
 * Per user:
 *   1. Goal = the most recent saved FIRE scenario (no scenario, nothing to watch).
 *   2. Value = today's real snapshot (not one estimated by the backfill), converted to the goal's
 *      currency with the FX rates stored in that same snapshot.
 *   3. If there is no reference yet (alerts just enabled) or the goal has changed since it was
 *      taken, the current milestone is recorded without sending anything.
 *   4. If there is a new milestone, it is RECORDED before sending with an
 *      `UPDATE … WHERE milestone < new`: only whoever wins that race sends, so neither a retry nor
 *      two concurrent processes can send the same notice twice. The price is that a failed send is
 *      not retried (at most once, never twice).
 *
 * Errors are isolated per user: one does not block the others.
 */
@Injectable()
export class FireAlertsService {
  private readonly logger = new Logger(FireAlertsService.name);
  private readonly appUrl: string;
  private readonly secret: string;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(EMAIL_SERVICE) private readonly email: EmailService,
    private readonly settings: NotificationSettingsService,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.getOrThrow('APP_URL', { infer: true }).replace(/\/+$/, '');
    this.secret = config.getOrThrow('JWT_SECRET', { infer: true });
  }

  /**
   * `date` must be the date of the snapshot capture that just ran (the nightly job passes it):
   * recomputing it here could already land on the next day if the pass crosses UTC midnight, and
   * then there would be no real snapshot to evaluate.
   */
  async evaluateAll(date: string = todayUtc()): Promise<FireAlertsSummary> {
    const subscribers = await this.db
      .select({
        userId: userNotificationSettings.userId,
        locale: userNotificationSettings.locale,
        lastFireMilestone: userNotificationSettings.lastFireMilestone,
        fireGoalRef: userNotificationSettings.fireGoalRef,
        email: users.email,
      })
      .from(userNotificationSettings)
      .innerJoin(users, eq(users.id, userNotificationSettings.userId))
      .where(eq(userNotificationSettings.fireAlertsEnabled, true));

    const summary: FireAlertsSummary = { users: subscribers.length, sent: 0, failed: 0 };
    for (const subscriber of subscribers) {
      try {
        if ((await this.evaluateUser(subscriber, date)) === 'sent') summary.sent++;
      } catch (error) {
        summary.failed++;
        this.logger.error(`FIRE alert for ${subscriber.userId} failed: ${errorMessage(error)}`);
      }
    }
    return summary;
  }

  private async evaluateUser(
    subscriber: {
      userId: string;
      locale: string;
      lastFireMilestone: number | null;
      fireGoalRef: string | null;
      email: string;
    },
    date: string,
  ): Promise<Outcome> {
    const { userId } = subscriber;
    const goal = await this.settings.latestGoalInputs(userId);
    if (!goal) return 'skipped';
    const target = fireTargetFromInputs(goal.inputs);
    if (!target) return 'skipped';

    const [snapshot] = await this.db
      .select({ marketValue: portfolioSnapshots.marketValue, fxRates: portfolioSnapshots.fxRates })
      .from(portfolioSnapshots)
      .where(
        and(
          eq(portfolioSnapshots.userId, userId),
          eq(portfolioSnapshots.date, date),
          eq(portfolioSnapshots.estimated, false),
        ),
      );
    if (!snapshot) return 'skipped';

    // Snapshots are stored in EUR; the goal, in its own currency.
    const value = convertCurrency(Number(snapshot.marketValue), 'EUR', target.currency, snapshot.fxRates);
    if (value === null || !Number.isFinite(value)) return 'skipped';
    const progress = (value / target.target) * 100;

    const goalRef = `${goal.id}@${goal.updatedAt.toISOString()}`;
    if (subscriber.lastFireMilestone === null || subscriber.fireGoalRef !== goalRef) {
      await this.db
        .update(userNotificationSettings)
        .set({ lastFireMilestone: reachedMilestone(progress), fireGoalRef: goalRef })
        .where(eq(userNotificationSettings.userId, userId));
      return 'skipped';
    }

    const milestone = newMilestone(progress, subscriber.lastFireMilestone);
    if (milestone === null) return 'skipped';

    const claimed = await this.db
      .update(userNotificationSettings)
      .set({ lastFireMilestone: milestone })
      .where(
        and(
          eq(userNotificationSettings.userId, userId),
          eq(userNotificationSettings.fireAlertsEnabled, true),
          lt(userNotificationSettings.lastFireMilestone, milestone),
        ),
      )
      .returning({ userId: userNotificationSettings.userId });
    if (claimed.length === 0) return 'skipped';

    const locale = subscriber.locale === 'en' ? 'en' : 'es';
    const prefix = locale === 'en' ? '/en' : '';
    const token = encodeURIComponent(createUnsubscribeToken(userId, this.secret));
    await this.email.sendFireMilestone(
      subscriber.email,
      {
        locale,
        milestone,
        currentValue: value,
        target: target.target,
        currency: target.currency,
        portfolioUrl: `${this.appUrl}${prefix}/portfolio`,
        unsubscribeUrl: `${this.appUrl}${prefix}/alertas/baja?token=${token}`,
      },
      `${this.appUrl}/api/notifications/unsubscribe?token=${token}`,
    );
    return 'sent';
  }
}
