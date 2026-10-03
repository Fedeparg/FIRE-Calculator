import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

import type { Env } from '../config/env.js';
import { DonationsController } from './donations.controller.js';
import { STRIPE_CLIENT } from './donations.constants.js';
import { DonationsService } from './donations.service.js';

/**
 * Builds the Stripe client only when STRIPE_SECRET_KEY is set (just as the email module
 * picks its transport from env). Without a key the provider is `null` and the donation
 * endpoints respond 503 / `enabled: false`, without breaking startup in development.
 */
@Module({
  imports: [ConfigModule],
  controllers: [DonationsController],
  providers: [
    DonationsService,
    {
      provide: STRIPE_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Stripe | null => {
        const key = config.get('STRIPE_SECRET_KEY', { infer: true });
        return key ? new Stripe(key) : null;
      },
    },
  ],
})
export class DonationsModule {}
