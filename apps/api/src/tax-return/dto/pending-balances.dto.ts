import { z } from 'zod';

import { fiscalYearSchema } from '../../common/dto/fiscal-year.js';
import { amountSchema } from '../../common/dto/primitives.js';

/** Un saldo negativo pendiente de un ejercicio que Sextante no calcula. */
export const pendingBalanceSchema = z.strictObject({
  originYear: fiscalYearSchema.describe('Ejercicio en que se generó el saldo negativo.'),
  kind: z
    .enum(['gains', 'capitalIncome'])
    .describe('gains: ganancias y pérdidas patrimoniales; capitalIncome: rendimientos del capital mobiliario.'),
  amount: amountSchema.positive().describe('Importe pendiente de compensar, en euros (positivo).'),
});

/** Cuerpo de PUT /api/tax-return/pending-balances: la lista completa, que sustituye a la anterior. */
export const replacePendingBalancesSchema = z.strictObject({
  balances: z
    .array(pendingBalanceSchema)
    .max(20)
    .refine((list) => new Set(list.map((b) => `${b.originYear}:${b.kind}`)).size === list.length, {
      error: 'un mismo ejercicio y tipo solo puede aparecer una vez',
    }),
});

export type ReplacePendingBalancesDto = z.infer<typeof replacePendingBalancesSchema>;
