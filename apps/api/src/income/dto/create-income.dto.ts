import { z } from 'zod';

import { INCOME_KINDS, withholdingsFitGross } from '@sextante/core/fiscal/income';
import { ISIN_PATTERN } from '@sextante/core/portfolio/isin';
import { amountSchema, currencySchema, trimmedText } from '../../common/dto/primitives.js';

/** A payment's fields, without the cross-field rules (shared with the partial update). */
export const incomeFieldsSchema = z.strictObject({
  kind: z
    .enum(INCOME_KINDS)
    .describe('dividend, interest or benefit (a broker reward such as saveback, declared as interest).'),
  paidAt: z.iso
    .date({ error: 'paidAt debe ser una fecha real con el formato YYYY-MM-DD' })
    .describe('Payment date (YYYY-MM-DD): it decides the tax year.'),
  positionId: z.uuid().nullable().optional().describe('Position the payment comes from (optional).'),
  isin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(ISIN_PATTERN, { error: 'isin no tiene el formato de un ISIN' })
    .nullable()
    .optional()
    .describe('ISIN of the security (optional).'),
  name: trimmedText(100).nullable().optional().describe('Security or account it comes from (optional).'),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, { error: 'country debe ser un código ISO de dos letras' })
    .nullable()
    .optional()
    .describe('Source country, two-letter ISO code (e.g. US). Needed for the double taxation relief.'),
  currency: currencySchema.optional().describe('Currency of the payment (default EUR).'),
  gross: amountSchema.positive().describe('Gross amount, before withholding tax.'),
  withholdingOrigin: amountSchema
    .nullable()
    .optional()
    .describe('Withholding tax in the source country; null if unknown.'),
  withholdingSpain: amountSchema.optional().describe('Withholding tax applied in Spain (default 0).'),
  reportedToAeat: z
    .boolean()
    .optional()
    .describe(
      'The payer already reported it to the Spanish tax agency (AEAT), so it appears in the draft return (borrador).',
    ),
});

/** Withholdings cannot exceed the gross amount (compared in micro-units, see `withholdingsFitGross`). */
export function withholdingsWithinGross(value: {
  gross?: number;
  withholdingOrigin?: number | null;
  withholdingSpain?: number;
}): boolean {
  if (value.gross === undefined) return true;
  return withholdingsFitGross(value.gross, value.withholdingOrigin, value.withholdingSpain);
}

/** Body of POST /api/income. */
export const createIncomeSchema = incomeFieldsSchema.refine(withholdingsWithinGross, {
  error: 'las retenciones no pueden superar el íntegro',
  path: ['gross'],
});

export type CreateIncomeDto = z.infer<typeof createIncomeSchema>;
