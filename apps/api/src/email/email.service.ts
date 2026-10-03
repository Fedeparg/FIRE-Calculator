import type { EmailLocale, FireMilestoneEmail } from './templates/fire-milestone.js';

/** Email sending contract; lets the transport be swapped (dev/Resend). */
export interface EmailService {
  /** `locale`: language of the site the link was requested from (the email's language). */
  sendMagicLink(to: string, link: string, locale: EmailLocale): Promise<void>;
  /** `oneClickUnsubscribeUrl` goes in the `List-Unsubscribe` header (POST unsubscribe, RFC 8058), unlike the unsubscribe page in the body. */
  sendFireMilestone(to: string, email: FireMilestoneEmail, oneClickUnsubscribeUrl: string): Promise<void>;
}

export const EMAIL_SERVICE = Symbol('EMAIL_SERVICE');
