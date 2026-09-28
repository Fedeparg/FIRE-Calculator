import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { SESSION_TTL_SECONDS } from '../auth/session.constants.js';
import { EmailModule } from '../email/email.module.js';
import { FireAlertsService } from './fire-alerts.service.js';
import { NotificationSettingsController, UnsubscribeController } from './notifications.controller.js';
import { NotificationSettingsService } from './notification-settings.service.js';

/**
 * Alertas por email (opt-in): preferencias del usuario, baja desde el enlace y la evaluación
 * de hitos del objetivo FIRE, que lanza el trabajo nocturno (`DailyJobsModule`). Registra
 * `JwtModule` con el mismo secreto, como `AccountModule`, para que `JwtAuthGuard` valide la
 * cookie sin importar `AuthModule` (que a su vez importa este módulo para la exportación RGPD).
 */
@Module({
  imports: [
    EmailModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: SESSION_TTL_SECONDS },
      }),
    }),
  ],
  controllers: [NotificationSettingsController, UnsubscribeController],
  providers: [NotificationSettingsService, FireAlertsService, JwtAuthGuard],
  exports: [NotificationSettingsService, FireAlertsService],
})
export class NotificationsModule {}
