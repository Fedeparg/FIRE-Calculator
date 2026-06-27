import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

import type { EmailService } from './email.service';

/**
 * Transporte de email de producción vía Resend. Se activa con EMAIL_TRANSPORT=resend.
 * Requiere RESEND_API_KEY y EMAIL_FROM (p. ej. "Sextante <no-reply@elsextante.com>").
 */
@Injectable()
export class ResendEmailService implements EmailService {
  private readonly logger = new Logger('Email(resend)');
  private readonly resend: Resend;
  private readonly from: string;

  constructor(config: ConfigService) {
    this.resend = new Resend(config.getOrThrow<string>('RESEND_API_KEY'));
    this.from = config.getOrThrow<string>('EMAIL_FROM');
  }

  async sendMagicLink(to: string, link: string): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.from,
      to,
      subject: 'Tu acceso a Sextante',
      text: `Entra en Sextante con este enlace (caduca pronto y es de un solo uso):\n\n${link}\n\nSi no lo has solicitado, ignora este correo.`,
    });

    if (error) {
      this.logger.error(`Error enviando magic link a ${to}: ${error.message}`);
      throw new Error('No se pudo enviar el email');
    }
  }
}
