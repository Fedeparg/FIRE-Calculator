import { Injectable, Logger } from '@nestjs/common';

import type { EmailService } from './email.service.js';
import { renderFireMilestoneEmail, type EmailLocale, type FireMilestoneEmail } from './templates/fire-milestone.js';

/**
 * Development email transport: it sends nothing and writes the magic link to the log. It lets
 * you build and test the whole login flow without a Resend account or a domain. Production uses
 * `ResendEmailService` (selected by env).
 */
@Injectable()
export class DevEmailService implements EmailService {
  private readonly logger = new Logger('Email(dev)');

  sendMagicLink(to: string, link: string, locale: EmailLocale): Promise<void> {
    this.logger.log(`Magic link (${locale}) for ${to}:`);
    this.logger.log(`  ${link}`);
    return Promise.resolve();
  }

  sendFireMilestone(to: string, email: FireMilestoneEmail, oneClickUnsubscribeUrl: string): Promise<void> {
    const rendered = renderFireMilestoneEmail(email, '/email-logo.png');
    this.logger.log(`Milestone notice for ${to}: ${rendered.subject}`);
    this.logger.log(`  List-Unsubscribe: <${oneClickUnsubscribeUrl}>`);
    this.logger.log(`  ${rendered.text.replace(/\n/g, '\n  ')}`);
    return Promise.resolve();
  }
}
