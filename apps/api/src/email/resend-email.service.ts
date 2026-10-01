import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

import type { EmailService } from './email.service.js';
import { renderFireMilestoneEmail, type FireMilestoneEmail } from './templates/fire-milestone.js';

/**
 * Minutos de validez del enlace mágico que mostramos al usuario en el email.
 * Debe coincidir con `TOKEN_TTL_MS` de `auth.service.ts` (15 minutos). Si cambias
 * la TTL allí, actualiza este valor.
 */
const LINK_TTL_MINUTES = 15;

const SUBJECT = 'Tu enlace de acceso a Sextante';

/**
 * Transporte de email de producción vía Resend. Se activa con `EMAIL_TRANSPORT=resend`.
 * Requiere `RESEND_API_KEY`, `EMAIL_FROM` y `APP_URL`.
 *
 * Si falta cualquiera de las tres, el constructor lanza con un mensaje claro y aborta el
 * arranque de la API: preferimos un fallo ruidoso a enviar a un agujero negro.
 */
@Injectable()
export class ResendEmailService implements EmailService {
  private readonly logger = new Logger('Email(resend)');
  private readonly resend: Resend;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      throw new Error(
        'EMAIL_TRANSPORT=resend requiere RESEND_API_KEY. Define la clave en el entorno ' +
          '(o usa EMAIL_TRANSPORT=dev en desarrollo).',
      );
    }
    this.resend = new Resend(apiKey);

    // Sin remitente por defecto: el dominio de envío es propio de cada despliegue (también
    // del de desarrollo), así que un dominio cableado aquí sería el de OTRO. Además, Resend solo acepta dominios
    // verificados en la cuenta del despliegue: un valor "de fábrica" fallaría en el envío, y
    // más vale enterarse al arrancar que cuando un usuario intenta entrar.
    const from = config.get<string>('EMAIL_FROM')?.trim();
    if (!from) {
      throw new Error(
        'EMAIL_TRANSPORT=resend requiere EMAIL_FROM con un remitente de un dominio ' +
          'verificado en Resend (p. ej. "Sextante <no-reply@send.tu-dominio>").',
      );
    }
    this.from = from;

    // Base absoluta para el logo del email (los clientes de correo no resuelven rutas
    // relativas). El PNG se sirve desde el frontend en `/email-logo.png`. `getOrThrow`
    // porque `APP_URL` ya es obligatoria en el resto de la app (es la base del magic link).
    this.appUrl = config.getOrThrow<string>('APP_URL');
  }

  async sendMagicLink(to: string, link: string): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.from,
      to,
      subject: SUBJECT,
      text: this.buildText(link),
      html: this.buildHtml(link),
    });

    if (error) {
      this.logger.error(`Error enviando magic link a ${to}: ${error.message}`);
      throw new Error('No se pudo enviar el email');
    }
  }

  async sendFireMilestone(
    to: string,
    email: FireMilestoneEmail,
    oneClickUnsubscribeUrl: string,
  ): Promise<void> {
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

  /** Versión en texto plano (fallback para clientes sin HTML). */
  private buildText(link: string): string {
    return [
      'Sextante',
      '',
      'Has solicitado iniciar sesión en Sextante. Abre este enlace para entrar:',
      '',
      link,
      '',
      `El enlace caduca en ${LINK_TTL_MINUTES} minutos y solo puede usarse una vez.`,
      '',
      'Si no has solicitado este acceso, ignora este correo: nadie podrá entrar en tu',
      'cuenta sin abrir el enlace.',
    ].join('\n');
  }

  /** Versión HTML con estilos en línea (los clientes de correo no aplican CSS externo). */
  private buildHtml(link: string): string {
    const safeLink = this.escapeHtml(link);
    const logoUrl = `${this.appUrl}/email-logo.png`;
    return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background-color:#f4f5f7;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;border:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <tr>
              <td style="padding:32px 32px 8px 32px;">
                <p style="margin:0;font-size:20px;font-weight:700;color:#0f172a;">
                  <img src="${logoUrl}" width="42" height="40" alt="" style="vertical-align:middle;margin-right:10px;border:0;" />Sextante
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0 32px;">
                <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#334155;">
                  Has solicitado iniciar sesión en Sextante. Pulsa el botón para entrar:
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 32px 24px 32px;">
                <a href="${safeLink}" style="display:inline-block;padding:12px 28px;background-color:#0f172a;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">
                  Entrar en Sextante
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 8px 32px;">
                <p style="margin:0 0 8px 0;font-size:13px;line-height:1.6;color:#64748b;">
                  Si el botón no funciona, copia y pega esta dirección en tu navegador:
                </p>
                <p style="margin:0 0 16px 0;font-size:13px;line-height:1.6;word-break:break-all;">
                  <a href="${safeLink}" style="color:#2563eb;text-decoration:underline;">${safeLink}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px 32px;border-top:1px solid #e5e7eb;">
                <p style="margin:16px 0 0 0;font-size:13px;line-height:1.6;color:#64748b;">
                  El enlace caduca en ${LINK_TTL_MINUTES} minutos y solo puede usarse una vez.
                  Si no has solicitado este acceso, ignora este correo: nadie podrá entrar en tu
                  cuenta sin abrir el enlace.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
