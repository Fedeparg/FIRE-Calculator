import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.js';
import { DevEmailService } from './dev-email.service.js';
import { EMAIL_SERVICE, type EmailService } from './email.service.js';
import { ResendEmailService } from './resend-email.service.js';

/**
 * Transporte según EMAIL_TRANSPORT: 'resend' (producción; requiere RESEND_API_KEY, EMAIL_FROM y
 * APP_URL) o, por defecto, `DevEmailService` (log). Solo se construye el elegido: el
 * constructor de Resend exige claves que no existen en dev.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: EMAIL_SERVICE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): EmailService =>
        config.get('EMAIL_TRANSPORT', { infer: true }) === 'resend'
          ? new ResendEmailService(config)
          : new DevEmailService(),
    },
  ],
  exports: [EMAIL_SERVICE],
})
export class EmailModule {}
