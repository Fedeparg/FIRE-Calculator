/** Contrato de envío de email. Permite intercambiar transporte (dev/Resend). */
export interface EmailService {
  /** Envía el enlace mágico de inicio de sesión a `to`. */
  sendMagicLink(to: string, link: string): Promise<void>;
}

/** Token de inyección para el servicio de email. */
export const EMAIL_SERVICE = Symbol('EMAIL_SERVICE');
