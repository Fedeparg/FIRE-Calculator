import { ServiceUnavailableException } from '@nestjs/common';
import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';

import { fakeConfig } from '../../test/config.js';
import { DonationsService } from './donations.service.js';
import { firstItem } from '@sextante/core/arrays';

const APP_URL = 'https://sextante.test';

/** Cliente de Stripe falso: solo la frontera que usa el servicio (`checkout.sessions.create`). */
function setup(session: { url: string | null } = { url: 'https://checkout.stripe.test/s/1' }) {
  const create = vi.fn<(params: Stripe.Checkout.SessionCreateParams) => Promise<{ url: string | null }>>(() =>
    Promise.resolve(session),
  );
  const stripe = { checkout: { sessions: { create } } } as unknown as Stripe;
  return { service: new DonationsService(stripe, fakeConfig({ APP_URL })), create };
}

describe('DonationsService', () => {
  it('sin cliente de Stripe está deshabilitado y createCheckoutUrl responde 503', async () => {
    const service = new DonationsService(null, fakeConfig({ APP_URL }));

    expect(service.enabled).toBe(false);
    await expect(service.createCheckoutUrl(5, 'es')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('con Stripe configurado está habilitado', () => {
    expect(setup().service.enabled).toBe(true);
  });

  it('crea una sesión de pago único en euros (importe en céntimos) y devuelve su URL', async () => {
    const { service, create } = setup();

    await expect(service.createCheckoutUrl(5, 'es')).resolves.toBe('https://checkout.stripe.test/s/1');

    expect(create).toHaveBeenCalledOnce();
    const [params] = firstItem(create.mock.calls);
    expect(params.mode).toBe('payment');
    expect(params.locale).toBe('es');
    expect(params.line_items).toHaveLength(1);
    expect(params.line_items?.[0]?.quantity).toBe(1);
    expect(params.line_items?.[0]?.price_data?.currency).toBe('eur');
    expect(params.line_items?.[0]?.price_data?.unit_amount).toBe(500);
  });

  it('en castellano las URLs de retorno no llevan prefijo de idioma', async () => {
    const { service, create } = setup();
    await service.createCheckoutUrl(10, 'es');

    const [params] = firstItem(create.mock.calls);
    expect(params.success_url).toBe(`${APP_URL}/gracias`);
    expect(params.cancel_url).toBe(`${APP_URL}/sobre-mi`);
  });

  it('en inglés usa el prefijo /en y los textos en inglés', async () => {
    const { service, create } = setup();
    await service.createCheckoutUrl(10, 'en');

    const [params] = firstItem(create.mock.calls);
    expect(params.locale).toBe('en');
    expect(params.success_url).toBe(`${APP_URL}/en/gracias`);
    expect(params.cancel_url).toBe(`${APP_URL}/en/sobre-mi`);
    expect(params.line_items?.[0]?.price_data?.product_data?.name).toBe('Support Sextante');
  });

  it('si Stripe no devuelve URL falla con 503 en vez de redirigir a null', async () => {
    const { service } = setup({ url: null });

    await expect(service.createCheckoutUrl(5, 'es')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('propaga los errores de Stripe', async () => {
    const { service, create } = setup();
    create.mockRejectedValueOnce(new Error('card_declined'));

    await expect(service.createCheckoutUrl(5, 'es')).rejects.toThrow('card_declined');
  });
});
