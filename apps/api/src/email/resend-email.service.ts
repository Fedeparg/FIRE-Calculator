import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

import type { EmailService } from './email.service.js';
import { renderFireMilestoneEmail, type EmailLocale, type FireMilestoneEmail } from './templates/fire-milestone.js';
import { renderMagicLinkEmail } from './templates/magic-link.js';
import type { Env } from '../config/env.js';

/**
 * Transporte de email de producción vía Resend. Se activa con `EMAIL_TRANSPORT=resend`.
 * Requiere `RESEND_API_KEY`, `EMAIL_FROM` y `APP_URL`.
 *
 * Si falta cualquiera de las tres, la validación de `config/env.ts` aborta el arranque de la API.
 */
@Injectable()
export class ResendEmailService implements EmailService {
  private readonly logger = new Logger('Email(resend)');
  private readonly resend: Resend;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(config: ConfigService<Env, true>) {
    // `parseEnv` ya exige `RESEND_API_KEY` y `EMAIL_FROM` con `EMAIL_TRANSPORT=resend`
    // (preferimos un fallo ruidoso al arrancar a enviar a un agujero negro); `getOrThrow` solo estrecha el tipo.
    this.resend = new Resend(config.getOrThrow('RESEND_API_KEY', { infer: true }));

    // Sin remitente por defecto: el dominio de envío es propio de cada despliegue y Resend solo
    // acepta dominios verificados en la cuenta, así que un valor "de fábrica" fallaría en el envío.
    this.from = config.getOrThrow('EMAIL_FROM', { infer: true });

    // Base absoluta para el logo del email (los clientes de correo no resuelven rutas
    // relativas). El PNG se sirve desde el frontend en `/email-logo.png`.
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
      this.logger.error(`Error enviando magic link a ${to}: ${error.message}`);
      throw new Error('No se pudo enviar el email');
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
      // Baja en un clic (RFC 8058): los clientes de correo que la soportan hacen un POST a
      // esta URL con el cuerpo `List-Unsubscribe=One-Click`, sin abrir nada.
      headers: {
        'List-Unsubscribe': `<${oneClickUnsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });

    if (error) {
      this.logger.error(`Error enviando aviso de hito a ${to}: ${error.message}`);
      throw new Error('No se pudo enviar el email');
    }
  }
}
