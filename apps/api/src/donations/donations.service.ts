import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';

import { STRIPE_CLIENT } from './donations.constants.js';

/**
 * Donaciones ("invítame a un café") vía Stripe Checkout.
 *
 * Flujo: el cliente pide una sesión de Checkout con un importe; devolvemos la `url`
 * alojada de Stripe y el navegador redirige allí. No se persiste nada (no hay tabla
 * de donaciones): el pago no otorga acceso ni desbloquea features, así que no hace
 * falta webhook. Cuando se quiera registrar donaciones, el sitio natural para el
 * webhook `checkout.session.completed` es aquí.
 */
@Injectable()
export class DonationsService {
  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
    private readonly config: ConfigService,
  ) {}

  /** True si Stripe está configurado (hay STRIPE_SECRET_KEY). */
  get enabled(): boolean {
    return this.stripe !== null;
  }

  /**
   * Crea una sesión de Checkout de pago único por `amountEur` euros y devuelve la URL
   * alojada de Stripe a la que redirigir.
   */
  async createCheckoutUrl(amountEur: number, locale: 'es' | 'en'): Promise<string> {
    if (!this.stripe) {
      throw new ServiceUnavailableException('Donaciones no configuradas');
    }

    const appUrl = this.config.get<string>('APP_URL') ?? 'http://localhost:3000';
    // El locale por defecto (es) no lleva prefijo en la URL; en lleva /en.
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
              description:
                locale === 'en'
                  ? 'A coffee for the developer'
                  : 'Un café para el desarrollador',
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
