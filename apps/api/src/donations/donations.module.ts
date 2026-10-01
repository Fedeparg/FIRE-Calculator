import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

import type { Env } from '../config/env.js';
import { DonationsController } from './donations.controller.js';
import { STRIPE_CLIENT } from './donations.constants.js';
import { DonationsService } from './donations.service.js';

/**
 * Construye el cliente de Stripe solo si hay STRIPE_SECRET_KEY (igual que el módulo de
 * email elige transporte por env). Sin clave, el provider es `null` y los endpoints de
 * donación responden 503 / `enabled: false`, sin romper el arranque en desarrollo.
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
