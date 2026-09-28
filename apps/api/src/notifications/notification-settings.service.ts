import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';

import { DRIZZLE, type Database } from '../db/database.module.js';
import { savedScenarios, userNotificationSettings } from '../db/schema.js';

/**
 * Slug de la calculadora FIRE en el frontend (`src/core/registry.ts`). El objetivo de la
 * cartera se guarda como escenario de esa calculadora; es el que vigilan las alertas.
 */
export const FIRE_SCENARIO_SLUG = 'independencia-financiera';

export const NOTIFICATION_LOCALES = ['es', 'en'] as const;
export type NotificationLocale = (typeof NOTIFICATION_LOCALES)[number];

/** Preferencias tal y como las consume la UI de la cuenta. */
export interface NotificationSettingsResponse {
  fireAlertsEnabled: boolean;
  locale: NotificationLocale;
  /** Último hito avisado (25/50/75/100), o null si aún no hay referencia. */
  lastFireMilestone: number | null;
  /**
   * Objetivo que vigilan las alertas: el escenario FIRE actualizado más recientemente. `null`
   * si el usuario no ha guardado ninguno (las alertas no pueden avisar de nada).
   */
  goal: { name: string; updatedAt: string } | null;
}

const asLocale = (value: string): NotificationLocale => (value === 'en' ? 'en' : 'es');

/**
 * Preferencias de notificación por email. Sin fila, todo desactivado: las alertas son opt-in.
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
   * Activa o desactiva las alertas y fija el idioma. Al ACTIVARLAS (si antes no lo estaban) se
   * borra el último hito avisado: la siguiente evaluación toma el progreso de ese momento como
   * referencia sin enviar nada, en vez de avisar de un hito que se había pasado hace tiempo.
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
          // Solo se conserva el hito si ya estaban activadas; si no, se vuelve a tomar referencia.
          lastFireMilestone: sql`CASE WHEN ${userNotificationSettings.fireAlertsEnabled} THEN ${userNotificationSettings.lastFireMilestone} ELSE NULL END`,
        },
      });
    return this.get(userId);
  }

  /** Baja desde el enlace del email. Idempotente; sin fila no hay nada que desactivar. */
  async unsubscribe(userId: string): Promise<void> {
    await this.db
      .update(userNotificationSettings)
      .set({ fireAlertsEnabled: false, updatedAt: new Date() })
      .where(eq(userNotificationSettings.userId, userId));
  }

  /** Escenario FIRE más reciente del usuario (el objetivo que vigilan las alertas). */
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
      .where(and(eq(savedScenarios.userId, userId), eq(savedScenarios.slug, FIRE_SCENARIO_SLUG)))
      .orderBy(desc(savedScenarios.updatedAt))
      .limit(1);
    return row ?? null;
  }

  private async latestGoal(userId: string): Promise<NotificationSettingsResponse['goal']> {
    const goal = await this.latestGoalInputs(userId);
    return goal ? { name: goal.name, updatedAt: goal.updatedAt.toISOString() } : null;
  }
}
