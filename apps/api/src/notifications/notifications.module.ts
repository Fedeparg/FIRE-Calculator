import { Module } from '@nestjs/common';

import { EmailModule } from '../email/email.module.js';
import { FireAlertsService } from './fire-alerts.service.js';
import { NotificationSettingsController, UnsubscribeController } from './notifications.controller.js';
import { NotificationSettingsService } from './notification-settings.service.js';
import { SessionModule } from '../auth/session.module.js';

/**
 * Email alerts (opt-in): user preferences, unsubscribe from the link and the FIRE goal milestone
 * evaluation, triggered by the nightly job (`DailyJobsModule`). It imports `SessionModule` so that
 * `JwtAuthGuard` validates the session cookie. Imported by `DailyJobsModule` (alerts) and
 * `AccountModule` (preferences in the GDPR export).
 */
@Module({
  imports: [EmailModule, SessionModule],
  controllers: [NotificationSettingsController, UnsubscribeController],
  providers: [NotificationSettingsService, FireAlertsService],
  exports: [NotificationSettingsService, FireAlertsService],
})
export class NotificationsModule {}
