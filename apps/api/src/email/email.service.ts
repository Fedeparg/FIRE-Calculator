import type { FireMilestoneEmail } from './templates/fire-milestone.js';

/** Contrato de envío de email; permite intercambiar el transporte (dev/Resend). */
export interface EmailService {
  sendMagicLink(to: string, link: string): Promise<void>;
  /** `oneClickUnsubscribeUrl` va a la cabecera `List-Unsubscribe` (baja por POST, RFC 8058), distinta de la página de baja del cuerpo. */
  sendFireMilestone(to: string, email: FireMilestoneEmail, oneClickUnsubscribeUrl: string): Promise<void>;
}

export const EMAIL_SERVICE = Symbol('EMAIL_SERVICE');
