import { describe, expect, it } from 'vitest';

import { renderMagicLinkEmail } from './magic-link.js';

const LINK = 'https://example.test/auth/verify?token=abc&x="1"';

describe('renderMagicLinkEmail', () => {
  it('in Spanish: subject, link, expiry and lang="es"', () => {
    const email = renderMagicLinkEmail('es', LINK, 'https://example.test/email-logo.png');

    expect(email.subject).toBe('Tu enlace de acceso a Sextante');
    expect(email.text).toContain(LINK);
    expect(email.text).toContain('caduca en 15 minutos');
    expect(email.html).toContain('lang="es"');
    expect(email.html).toContain('Entrar en Sextante');
  });

  it('in English the text and lang change', () => {
    const email = renderMagicLinkEmail('en', LINK, 'x');

    expect(email.subject).toBe('Your Sextante sign-in link');
    expect(email.text).toContain('expires in 15 minutes');
    expect(email.html).toContain('lang="en"');
    expect(email.html).toContain('Sign in to Sextante');
  });

  it('escapes the link in the HTML', () => {
    const { html } = renderMagicLinkEmail('es', LINK, 'x');

    expect(html).toContain('token=abc&amp;x=&quot;1&quot;');
    expect(html).not.toContain('x="1"');
  });
});
