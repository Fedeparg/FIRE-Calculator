import type { FireMilestoneEmail } from './templates/fire-milestone.js';

/** Contrato de envío de email. Permite intercambiar transporte (dev/Resend). */
export interface EmailService {
  /** Envía el enlace mágico de inicio de sesión a `to`. */
  sendMagicLink(to: string, link: string): Promise<void>;
  /**
   * Envía el aviso de hito del objetivo FIRE. `oneClickUnsubscribeUrl` es el destino de la
   * cabecera `List-Unsubscribe` (baja en un clic por POST, RFC 8058), distinto de la página de
   * baja que se enlaza en el cuerpo.
   */
  sendFireMilestone(to: string, email: FireMilestoneEmail, oneClickUnsubscribeUrl: string): Promise<void>;
}

/** Token de inyección para el servicio de email. */
export const EMAIL_SERVICE = Symbol('EMAIL_SERVICE');
