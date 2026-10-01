/**
 * Email de hito del objetivo FIRE (25/50/75/100 %), en español o inglés. Plantilla PURA:
 * recibe los datos ya calculados y devuelve asunto, texto y HTML, sin tocar Resend. Así se
 * testea sin red y el transporte de desarrollo puede enseñar exactamente lo que se enviaría.
 *
 * Tono: informativo. Dice dónde está el usuario respecto al objetivo que ÉL se marcó; no
 * recomienda nada ni juzga (Sextante no asesora, ver ROADMAP).
 */

export type EmailLocale = 'es' | 'en';

export interface FireMilestoneEmail {
  locale: EmailLocale;
  /** Hito alcanzado, en % (25, 50, 75 o 100). */
  milestone: number;
  /** Valor de la cartera en la divisa del objetivo. */
  currentValue: number;
  /** Patrimonio objetivo. */
  target: number;
  /** Divisa del objetivo (código ISO). */
  currency: string;
  /** Enlace a la cartera. */
  portfolioUrl: string;
  /** Página de baja (confirma con un botón: un GET no da de baja, ver el controlador). */
  unsubscribeUrl: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const INTL_LOCALE: Record<EmailLocale, string> = { es: 'es-ES', en: 'en-GB' };

const COPY = {
  es: {
    subject: (m: number) =>
      m >= 100 ? 'Tu cartera ha alcanzado tu objetivo FIRE' : `Tu cartera ha llegado al ${m} % de tu objetivo FIRE`,
    heading: (m: number) => (m >= 100 ? 'Has alcanzado tu objetivo' : `Has llegado al ${m} % de tu objetivo`),
    body: (value: string, target: string) =>
      `Según la valoración de esta noche, tu cartera suma ${value}, frente a un objetivo de independencia financiera de ${target}.`,
    cta: 'Ver mi cartera',
    disclaimer:
      'Es un aviso informativo calculado con los datos que has introducido en Sextante y los precios del día. No es asesoramiento financiero.',
    why: 'Recibes este correo porque activaste los avisos de hitos en tu cuenta de Sextante.',
    unsubscribe: 'Dejar de recibir estos avisos',
  },
  en: {
    subject: (m: number) =>
      m >= 100 ? 'Your portfolio has reached your FIRE goal' : `Your portfolio has reached ${m}% of your FIRE goal`,
    heading: (m: number) => (m >= 100 ? 'You have reached your goal' : `You have reached ${m}% of your goal`),
    body: (value: string, target: string) =>
      `Based on tonight's valuation, your portfolio is worth ${value}, against a financial independence goal of ${target}.`,
    cta: 'View my portfolio',
    disclaimer:
      'This is an informational notice based on the data you entered in Sextante and today’s prices. It is not financial advice.',
    why: 'You are receiving this email because you turned on milestone notices in your Sextante account.',
    unsubscribe: 'Stop receiving these notices',
  },
} as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(amount: number, currency: string, locale: EmailLocale): string {
  try {
    return new Intl.NumberFormat(INTL_LOCALE[locale], {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // Código de divisa que `Intl` no reconoce: mejor la cifra con el código que no enviar nada.
    return `${Math.round(amount)} ${currency}`;
  }
}

export function renderFireMilestoneEmail(data: FireMilestoneEmail, logoUrl: string): RenderedEmail {
  const copy = COPY[data.locale];
  const value = money(data.currentValue, data.currency, data.locale);
  const target = money(data.target, data.currency, data.locale);
  const subject = copy.subject(data.milestone);

  const text = [
    'Sextante',
    '',
    copy.heading(data.milestone),
    '',
    copy.body(value, target),
    '',
    `${copy.cta}: ${data.portfolioUrl}`,
    '',
    copy.disclaimer,
    '',
    copy.why,
    `${copy.unsubscribe}: ${data.unsubscribeUrl}`,
  ].join('\n');

  const portfolio = escapeHtml(data.portfolioUrl);
  const unsubscribe = escapeHtml(data.unsubscribeUrl);
  const html = `<!doctype html>
<html lang="${data.locale}">
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
                <h1 style="margin:0 0 12px 0;font-size:18px;line-height:1.4;color:#0f172a;">${escapeHtml(copy.heading(data.milestone))}</h1>
                <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#334155;">${escapeHtml(copy.body(value, target))}</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 32px 24px 32px;">
                <a href="${portfolio}" style="display:inline-block;padding:12px 28px;background-color:#0f172a;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">${escapeHtml(copy.cta)}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px 32px;border-top:1px solid #e5e7eb;">
                <p style="margin:16px 0 8px 0;font-size:13px;line-height:1.6;color:#64748b;">${escapeHtml(copy.disclaimer)}</p>
                <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">${escapeHtml(copy.why)} <a href="${unsubscribe}" style="color:#2563eb;text-decoration:underline;">${escapeHtml(copy.unsubscribe)}</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}
