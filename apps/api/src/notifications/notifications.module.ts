import { Module } from '@nestjs/common';

import { EmailModule } from '../email/email.module.js';
import { FireAlertsService } from './fire-alerts.service.js';
import { NotificationSettingsController, UnsubscribeController } from './notifications.controller.js';
import { NotificationSettingsService } from './notification-settings.service.js';
import { SessionModule } from '../auth/session.module.js';

/**
 * Alertas por email (opt-in): preferencias del usuario, baja desde el enlace y la evaluación
 * de hitos del objetivo FIRE, que lanza el trabajo nocturno (`DailyJobsModule`). Importa
 * `SessionModule` para que `JwtAuthGuard` valide la cookie de sesión. Lo importan
 * `DailyJobsModule` (alertas) y `AccountModule` (preferencias en la exportación RGPD).
 */
@Module({
  imports: [EmailModule, SessionModule],
  controllers: [NotificationSettingsController, UnsubscribeController],
  providers: [NotificationSettingsService, FireAlertsService],
  exports: [NotificationSettingsService, FireAlertsService],
})
export class NotificationsModule {}
