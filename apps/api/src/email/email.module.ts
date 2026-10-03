import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.js';
import { DevEmailService } from './dev-email.service.js';
import { EMAIL_SERVICE, type EmailService } from './email.service.js';
import { ResendEmailService } from './resend-email.service.js';

/**
 * Transport selected by EMAIL_TRANSPORT: 'resend' (production; requires RESEND_API_KEY, EMAIL_FROM
 * and APP_URL) or, by default, `DevEmailService` (log). Only the chosen one is built: the Resend
 * constructor requires keys that don't exist in dev.
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
