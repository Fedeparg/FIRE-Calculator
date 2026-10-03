import { ServiceUnavailableException } from '@nestjs/common';
import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import { firstItem } from '@sextante/core/arrays';

import { fakeConfig } from '../../test/config.js';
import { DonationsService } from './donations.service.js';
import { stub } from '../../test/factories.js';

const APP_URL = 'https://sextante.test';

/** Fake Stripe client: only the boundary the service uses (`checkout.sessions.create`). */
function setup(session: { url: string | null } = { url: 'https://checkout.stripe.test/s/1' }) {
  const create = vi.fn<(params: Stripe.Checkout.SessionCreateParams) => Promise<{ url: string | null }>>(() =>
    Promise.resolve(session),
  );
  const stripe = stub<Stripe>({ checkout: { sessions: { create } } });
  return { service: new DonationsService(stripe, fakeConfig({ APP_URL })), create };
}

describe('DonationsService', () => {
  it('is disabled without a Stripe client and createCheckoutUrl responds 503', async () => {
    const service = new DonationsService(null, fakeConfig({ APP_URL }));

    expect(service.enabled).toBe(false);
    await expect(service.createCheckoutUrl(5, 'es')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('is enabled when Stripe is configured', () => {
    expect(setup().service.enabled).toBe(true);
  });

  it('creates a one-off payment session in euros (amount in cents) and returns its URL', async () => {
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

  it('in Spanish the return URLs have no locale prefix', async () => {
    const { service, create } = setup();
    await service.createCheckoutUrl(10, 'es');

    const [params] = firstItem(create.mock.calls);
    expect(params.success_url).toBe(`${APP_URL}/gracias`);
    expect(params.cancel_url).toBe(`${APP_URL}/sobre-mi`);
  });

  it('in English it uses the /en prefix and English copy', async () => {
    const { service, create } = setup();
    await service.createCheckoutUrl(10, 'en');

    const [params] = firstItem(create.mock.calls);
    expect(params.locale).toBe('en');
    expect(params.success_url).toBe(`${APP_URL}/en/gracias`);
    expect(params.cancel_url).toBe(`${APP_URL}/en/sobre-mi`);
    expect(params.line_items?.[0]?.price_data?.product_data?.name).toBe('Support Sextante');
  });

  it('fails with 503 instead of redirecting to null when Stripe returns no URL', async () => {
    const { service } = setup({ url: null });

    await expect(service.createCheckoutUrl(5, 'es')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('propagates Stripe errors', async () => {
    const { service, create } = setup();
    create.mockRejectedValueOnce(new Error('card_declined'));

    await expect(service.createCheckoutUrl(5, 'es')).rejects.toThrow('card_declined');
  });
});
