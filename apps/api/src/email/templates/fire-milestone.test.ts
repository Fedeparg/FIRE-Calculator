import { describe, expect, it } from 'vitest';

import { renderFireMilestoneEmail, type FireMilestoneEmail } from './fire-milestone.js';

const DATA: FireMilestoneEmail = {
  locale: 'es',
  milestone: 50,
  currentValue: 301234.56,
  target: 600000,
  currency: 'EUR',
  portfolioUrl: 'https://example.test/portfolio',
  unsubscribeUrl: 'https://example.test/alertas/baja?token=abc.def',
};

describe('renderFireMilestoneEmail', () => {
  it('in Spanish: subject, formatted figures, unsubscribe link and no-advice disclaimer', () => {
    const email = renderFireMilestoneEmail(DATA, 'https://example.test/email-logo.png');

    expect(email.subject).toBe('Tu cartera ha llegado al 50 % de tu objetivo FIRE');
    expect(email.text).toContain('301.235');
    expect(email.text).toContain('600.000');
    expect(email.text).toContain(DATA.unsubscribeUrl);
    expect(email.text).toContain('No es asesoramiento financiero');
    expect(email.html).toContain('lang="es"');
  });

  it('in English and at 100 % the message changes', () => {
    const email = renderFireMilestoneEmail({ ...DATA, locale: 'en', milestone: 100, currency: 'USD' }, 'x');

    expect(email.subject).toBe('Your portfolio has reached your FIRE goal');
    expect(email.text).toContain('$301,235');
    expect(email.text).toContain('not financial advice');
  });

  it('escapes the links in the HTML', () => {
    const email = renderFireMilestoneEmail({ ...DATA, unsubscribeUrl: 'https://x.test/?a=1&b="2"' }, 'x');
    expect(email.html).toContain('https://x.test/?a=1&amp;b=&quot;2&quot;');
    expect(email.html).not.toContain('b="2"');
  });

  it('an unknown currency does not break the send', () => {
    const email = renderFireMilestoneEmail({ ...DATA, currency: 'ZZ9' }, 'x');
    expect(email.text).toContain('ZZ9');
  });
});
