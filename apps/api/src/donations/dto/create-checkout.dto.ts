import { z } from 'zod';

import { DONATION_MAX_EUR, DONATION_MIN_EUR } from '../donations.constants.js';

/** Cuerpo de POST /donations/checkout: importe de la donación en euros enteros. */
export const createCheckoutSchema = z.strictObject({
  amount: z.number().int().min(DONATION_MIN_EUR).max(DONATION_MAX_EUR),
  /** Locale para construir la URL de retorno (página de gracias) en el idioma correcto. */
  locale: z.enum(['es', 'en']).optional(),
});

export type CreateCheckoutDto = z.infer<typeof createCheckoutSchema>;
