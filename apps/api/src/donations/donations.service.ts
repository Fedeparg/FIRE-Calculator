import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';

import type { Env } from '../config/env.js';
import { STRIPE_CLIENT } from './donations.constants.js';

/**
 * Donations ("buy me a coffee") via Stripe Checkout.
 *
 * Flow: the client requests a Checkout session for an amount; we return Stripe's hosted
 * `url` and the browser redirects there. Nothing is persisted (there is no donations
 * table): paying grants no access and unlocks no features, so no webhook is needed. If
 * donations ever need to be recorded, this is the natural home for the
 * `checkout.session.completed` webhook.
 */
@Injectable()
export class DonationsService {
  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** True when Stripe is configured (STRIPE_SECRET_KEY is set). */
  get enabled(): boolean {
    return this.stripe !== null;
  }

  /**
   * Creates a one-off payment Checkout session for `amountEur` euros and returns the
   * Stripe-hosted URL to redirect to.
   */
  async createCheckoutUrl(amountEur: number, locale: 'es' | 'en'): Promise<string> {
    if (!this.stripe) {
      throw new ServiceUnavailableException('Donaciones no configuradas');
    }

    const appUrl = this.config.getOrThrow('APP_URL', { infer: true });
    // The default locale (es) has no URL prefix; en uses /en.
    const base = locale === 'en' ? `${appUrl}/en` : appUrl;

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      locale: locale === 'en' ? 'en' : 'es',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: amountEur * 100,
            product_data: {
              name: locale === 'en' ? 'Support Sextante' : 'Apoya a Sextante',
              description: locale === 'en' ? 'A coffee for the developer' : 'Un café para el desarrollador',
            },
          },
        },
      ],
      success_url: `${base}/gracias`,
      cancel_url: `${base}/sobre-mi`,
    });

    if (!session.url) {
      throw new ServiceUnavailableException('Stripe no devolvió una URL de checkout');
    }
    return session.url;
  }
}
