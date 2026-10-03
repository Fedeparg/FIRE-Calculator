import { z } from 'zod';

import { ECB_FIRST_DATE, MAX_REFERENCE_CURRENCIES } from '../constants.js';

/**
 * Query of GET /api/fx/reference-rates. `currencies` is a comma-separated list of ISO 4217 codes
 * (`USD,CHF`); `from`, the date of the oldest transaction that must be converted.
 */
export const referenceRatesQuerySchema = z.strictObject({
  currencies: z
    .string()
    .trim()
    .transform((value) => [
      ...new Set(
        value
          .split(',')
          .map((c) => c.trim().toUpperCase())
          .filter(Boolean),
      ),
    ])
    .pipe(
      z
        .array(z.string().regex(/^[A-Z]{3}$/))
        .min(1)
        .max(MAX_REFERENCE_CURRENCIES),
    ),
  from: z.iso
    .date()
    .refine((date) => date >= ECB_FIRST_DATE, { message: `from must be on or after ${ECB_FIRST_DATE}` }),
});

export type ReferenceRatesQueryDto = z.infer<typeof referenceRatesQuerySchema>;
