import { LOGIN_LINK_TTL_MINUTES } from '../../auth/session.constants.js';
import type { EmailLocale, RenderedEmail } from './fire-milestone.js';
import { escapeHtml } from './html.js';

/**
 * Email del enlace mágico de acceso, en español o inglés (el idioma de la web desde la que se
 * pidió). Plantilla PURA, como `fire-milestone.ts`: devuelve asunto, texto y HTML sin tocar
 * Resend, para testearla sin red y para que el transporte de desarrollo enseñe lo mismo.
 */

const COPY = {
  es: {
    subject: 'Tu enlace de acceso a Sextante',
    intro: 'Has solicitado iniciar sesión en Sextante. Abre este enlace para entrar:',
    introHtml: 'Has solicitado iniciar sesión en Sextante. Pulsa el botón para entrar:',
    cta: 'Entrar en Sextante',
    fallback: 'Si el botón no funciona, copia y pega esta dirección en tu navegador:',
    expiry: `El enlace caduca en ${LOGIN_LINK_TTL_MINUTES} minutos y solo puede usarse una vez.`,
    ignore:
      'Si no has solicitado este acceso, ignora este correo: nadie podrá entrar en tu cuenta sin abrir el enlace.',
  },
  en: {
    subject: 'Your Sextante sign-in link',
    intro: 'You asked to sign in to Sextante. Open this link to sign in:',
    introHtml: 'You asked to sign in to Sextante. Press the button to sign in:',
    cta: 'Sign in to Sextante',
    fallback: 'If the button does not work, copy and paste this address into your browser:',
    expiry: `The link expires in ${LOGIN_LINK_TTL_MINUTES} minutes and can only be used once.`,
    ignore:
      'If you did not ask to sign in, ignore this email: nobody can get into your account without opening the link.',
  },
} as const satisfies Record<EmailLocale, Record<string, string>>;

export function renderMagicLinkEmail(locale: EmailLocale, link: string, logoUrl: string): RenderedEmail {
  const copy = COPY[locale];
  const safeLink = escapeHtml(link);

  // Versión en texto plano (fallback para clientes sin HTML).
  const text = ['Sextante', '', copy.intro, '', link, '', copy.expiry, '', copy.ignore].join('\n');

  // HTML con estilos en línea: los clientes de correo no aplican CSS externo.
  const html = `<!doctype html>
<html lang="${locale}">
  <body style="margin:0;padding:0;background-color:#f4f5f7;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;border:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <tr>
              <td style="padding:32px 32px 8px 32px;">
                <p style="margin:0;font-size:20px;font-weight:700;color:#0f172a;">
                  <img src="${escapeHtml(logoUrl)}" width="42" height="40" alt="" style="vertical-align:middle;margin-right:10px;border:0;" />Sextante
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0 32px;">
                <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#334155;">${escapeHtml(copy.introHtml)}</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 32px 24px 32px;">
                <a href="${safeLink}" style="display:inline-block;padding:12px 28px;background-color:#0f172a;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">${escapeHtml(copy.cta)}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 8px 32px;">
                <p style="margin:0 0 8px 0;font-size:13px;line-height:1.6;color:#64748b;">${escapeHtml(copy.fallback)}</p>
                <p style="margin:0 0 16px 0;font-size:13px;line-height:1.6;word-break:break-all;">
                  <a href="${safeLink}" style="color:#2563eb;text-decoration:underline;">${safeLink}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px 32px;border-top:1px solid #e5e7eb;">
                <p style="margin:16px 0 0 0;font-size:13px;line-height:1.6;color:#64748b;">${escapeHtml(copy.expiry)} ${escapeHtml(copy.ignore)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject: copy.subject, text, html };
}
