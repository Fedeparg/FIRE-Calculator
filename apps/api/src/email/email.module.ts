import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { DevEmailService } from './dev-email.service.js';
import { EMAIL_SERVICE, type EmailService } from './email.service.js';
import { ResendEmailService } from './resend-email.service.js';

/**
 * Selecciona el transporte de email según EMAIL_TRANSPORT:
 *   - 'resend' -> ResendEmailService (producción; requiere RESEND_API_KEY, EMAIL_FROM y APP_URL)
 *   - cualquier otro (por defecto 'dev') -> DevEmailService (log)
 *
 * Se construye SOLO el transporte elegido, así en dev no se instancia Resend (cuyo
 * constructor exige claves que no existen en desarrollo).
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: EMAIL_SERVICE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): EmailService =>
        config.get<string>('EMAIL_TRANSPORT') === 'resend'
          ? new ResendEmailService(config)
          : new DevEmailService(),
    },
  ],
  exports: [EMAIL_SERVICE],
})
export class EmailModule {}
