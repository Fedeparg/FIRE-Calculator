import { Injectable, Logger } from '@nestjs/common';

import type { EmailService } from './email.service.js';
import { renderFireMilestoneEmail, type EmailLocale, type FireMilestoneEmail } from './templates/fire-milestone.js';

/**
 * Transporte de email para desarrollo: no envía nada, escribe el enlace mágico en
 * el log. Permite construir y probar todo el flujo de login sin cuenta de Resend ni
 * dominio. En producción se usa `ResendEmailService` (seleccionado por env).
 */
@Injectable()
export class DevEmailService implements EmailService {
  private readonly logger = new Logger('Email(dev)');

  sendMagicLink(to: string, link: string, locale: EmailLocale): Promise<void> {
    this.logger.log(`Magic link (${locale}) para ${to}:`);
    this.logger.log(`  ${link}`);
    return Promise.resolve();
  }

  sendFireMilestone(to: string, email: FireMilestoneEmail, oneClickUnsubscribeUrl: string): Promise<void> {
    const rendered = renderFireMilestoneEmail(email, '/email-logo.png');
    this.logger.log(`Aviso de hito para ${to}: ${rendered.subject}`);
    this.logger.log(`  List-Unsubscribe: <${oneClickUnsubscribeUrl}>`);
    this.logger.log(`  ${rendered.text.replace(/\n/g, '\n  ')}`);
    return Promise.resolve();
  }
}
