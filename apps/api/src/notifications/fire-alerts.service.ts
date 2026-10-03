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

/** Resultado de una pasada, para el log del trabajo nocturno. */
export interface FireAlertsSummary {
  users: number;
  sent: number;
  failed: number;
}

type Outcome = 'sent' | 'skipped';

/**
 * Evalúa los hitos del objetivo FIRE de cada usuario con alertas activas, justo después de la
 * captura nocturna de snapshots, y envía un email por cada hito nuevo alcanzado.
 *
 * Por usuario:
 *   1. Objetivo = el escenario FIRE guardado más reciente (sin escenario, nada que vigilar).
 *   2. Valor = el snapshot real de hoy (no uno estimado por backfill), convertido a la divisa
 *      del objetivo con las tasas FX guardadas en ese mismo snapshot.
 *   3. Si aún no hay referencia (recién activadas) o el objetivo ha cambiado desde que se tomó,
 *      se fija el hito actual sin enviar nada.
 *   4. Si hay hito nuevo, se REGISTRA antes de enviar con un `UPDATE … WHERE hito < nuevo`:
 *      solo quien gana esa carrera envía, así que ni un reintento ni dos procesos a la vez
 *      pueden mandar el mismo aviso dos veces. El precio es que un envío fallido no se
 *      reintenta (como mucho una vez, nunca dos).
 *
 * Los errores se aíslan por usuario: uno no bloquea a los demás.
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
   * `date` debe ser la de la captura de snapshots que se acaba de hacer (el trabajo nocturno
   * se la pasa): recalcularla aquí podría caer ya en el día siguiente si la pasada cruza la
   * medianoche UTC, y entonces no habría snapshot real que evaluar.
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
        this.logger.error(`Alerta FIRE de ${subscriber.userId} falló: ${errorMessage(error)}`);
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

    // Los snapshots se guardan en EUR; el objetivo, en su divisa.
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
