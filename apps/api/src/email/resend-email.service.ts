import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

import type { EmailService } from './email.service.js';
import { renderFireMilestoneEmail, type EmailLocale, type FireMilestoneEmail } from './templates/fire-milestone.js';
import { renderMagicLinkEmail } from './templates/magic-link.js';
import type { Env } from '../config/env.js';

/**
 * Production email transport via Resend. Enabled with `EMAIL_TRANSPORT=resend`.
 * Requires `RESEND_API_KEY`, `EMAIL_FROM` and `APP_URL`.
 *
 * If any of the three is missing, the `config/env.ts` validation aborts the API startup.
 */
@Injectable()
export class ResendEmailService implements EmailService {
  private readonly logger = new Logger('Email(resend)');
  private readonly resend: Resend;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(config: ConfigService<Env, true>) {
    // `parseEnv` already requires `RESEND_API_KEY` and `EMAIL_FROM` with `EMAIL_TRANSPORT=resend`
    // (we prefer a loud failure at startup to sending into a black hole); `getOrThrow` only narrows the type.
    this.resend = new Resend(config.getOrThrow('RESEND_API_KEY', { infer: true }));

    // No default sender: the sending domain belongs to each deployment and Resend only accepts
    // domains verified in the account, so a "factory" value would fail when sending.
    this.from = config.getOrThrow('EMAIL_FROM', { infer: true });

    // Absolute base for the email logo (mail clients don't resolve relative paths). The PNG is
    // served by the frontend at `/email-logo.png`.
    this.appUrl = config.getOrThrow('APP_URL', { infer: true });
  }

  async sendMagicLink(to: string, link: string, locale: EmailLocale): Promise<void> {
    const rendered = renderMagicLinkEmail(locale, link, `${this.appUrl}/email-logo.png`);
    const { error } = await this.resend.emails.send({
      from: this.from,
      to,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });

    if (error) {
      this.logger.error(`Error sending magic link to ${to}: ${error.message}`);
      throw new Error('Could not send the email');
    }
  }

  async sendFireMilestone(to: string, email: FireMilestoneEmail, oneClickUnsubscribeUrl: string): Promise<void> {
    const rendered = renderFireMilestoneEmail(email, `${this.appUrl}/email-logo.png`);
    const { error } = await this.resend.emails.send({
      from: this.from,
      to,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      // One-click unsubscribe (RFC 8058): mail clients that support it POST to this URL with
      // the body `List-Unsubscribe=One-Click`, without opening anything.
      headers: {
        'List-Unsubscribe': `<${oneClickUnsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });

    if (error) {
      this.logger.error(`Error sending milestone notice to ${to}: ${error.message}`);
      throw new Error('Could not send the email');
    }
  }
}
