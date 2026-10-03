import { z } from 'zod';

import { INCOME_KINDS, withholdingsFitGross } from '@sextante/core/fiscal/income';
import { ISIN_PATTERN } from '@sextante/core/portfolio/isin';
import { amountSchema, currencySchema, trimmedText } from '../../common/dto/primitives.js';

/** A payment's fields, without the cross-field rules (shared with the partial update). */
export const incomeFieldsSchema = z.strictObject({
  kind: z.enum(INCOME_KINDS).describe('dividend (dividendo), interest (intereses) o benefit (recompensa del bróker).'),
  paidAt: z.iso
    .date({ error: 'paidAt debe ser una fecha real con el formato YYYY-MM-DD' })
    .describe('Fecha de cobro (YYYY-MM-DD): decide el ejercicio.'),
  positionId: z.uuid().nullable().optional().describe('Posición de la que sale el cobro (opcional).'),
  isin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(ISIN_PATTERN, { error: 'isin no tiene el formato de un ISIN' })
    .nullable()
    .optional()
    .describe('ISIN del valor (opcional).'),
  name: trimmedText(100).nullable().optional().describe('Valor o cuenta de la que sale (opcional).'),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, { error: 'country debe ser un código ISO de dos letras' })
    .nullable()
    .optional()
    .describe('País de la fuente, ISO de dos letras (p. ej. US). Necesario para la doble imposición.'),
  currency: currencySchema.optional().describe('Divisa del cobro (por defecto EUR).'),
  gross: amountSchema.positive().describe('Importe íntegro, antes de retenciones.'),
  withholdingOrigin: amountSchema
    .nullable()
    .optional()
    .describe('Retención en el país de la fuente; null si no se sabe.'),
  withholdingSpain: amountSchema.optional().describe('Retención practicada en España (por defecto 0).'),
  reportedToAeat: z.boolean().optional().describe('El pagador ya lo comunicó a Hacienda (sale en el borrador).'),
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
