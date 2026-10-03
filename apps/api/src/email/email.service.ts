import type { EmailLocale, FireMilestoneEmail } from './templates/fire-milestone.js';

/** Contrato de envío de email; permite intercambiar el transporte (dev/Resend). */
export interface EmailService {
  /** `locale`: idioma de la web desde la que se pidió el enlace (el del email). */
  sendMagicLink(to: string, link: string, locale: EmailLocale): Promise<void>;
  /** `oneClickUnsubscribeUrl` va a la cabecera `List-Unsubscribe` (baja por POST, RFC 8058), distinta de la página de baja del cuerpo. */
  sendFireMilestone(to: string, email: FireMilestoneEmail, oneClickUnsubscribeUrl: string): Promise<void>;
}

export const EMAIL_SERVICE = Symbol('EMAIL_SERVICE');
