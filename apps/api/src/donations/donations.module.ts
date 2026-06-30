import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

import { DonationsController } from './donations.controller';
import { STRIPE_CLIENT } from './donations.constants';
import { DonationsService } from './donations.service';

/**
 * Construye el cliente de Stripe SOLO si hay STRIPE_SECRET_KEY (igual que el módulo de
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
      useFactory: (config: ConfigService): Stripe | null => {
        const key = config.get<string>('STRIPE_SECRET_KEY');
        return key ? new Stripe(key) : null;
      },
    },
  ],
})
export class DonationsModule {}
