import { z } from 'zod';

import { DONATION_MAX_EUR, DONATION_MIN_EUR } from '../donations.constants.js';

/** Body of POST /donations/checkout: the donation amount in whole euros. */
export const createCheckoutSchema = z.strictObject({
  amount: z.number().int().min(DONATION_MIN_EUR).max(DONATION_MAX_EUR),
  /** Locale used to build the return URL (thank-you page) in the right language. */
  locale: z.enum(['es', 'en']).optional(),
});

export type CreateCheckoutDto = z.infer<typeof createCheckoutSchema>;
