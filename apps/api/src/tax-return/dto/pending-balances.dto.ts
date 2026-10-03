import { z } from 'zod';

import { fiscalYearSchema } from '../../common/dto/fiscal-year.js';
import { amountSchema } from '../../common/dto/primitives.js';

/** A pending negative balance from a tax year Sextante does not compute. */
export const pendingBalanceSchema = z.strictObject({
  originYear: fiscalYearSchema.describe('Tax year in which the negative balance arose.'),
  kind: z
    .enum(['gains', 'capitalIncome'])
    .describe(
      'gains: capital gains and losses (ganancias y pérdidas patrimoniales); capitalIncome: investment income (rendimientos del capital mobiliario).',
    ),
  amount: amountSchema.positive().describe('Amount still to be offset, in euros (positive).'),
});

/** Body of PUT /api/tax-return/pending-balances: the full list, which replaces the previous one. */
export const replacePendingBalancesSchema = z.strictObject({
  balances: z
    .array(pendingBalanceSchema)
    .max(20)
    .refine((list) => new Set(list.map((b) => `${b.originYear}:${b.kind}`)).size === list.length, {
      error: 'un mismo ejercicio y tipo solo puede aparecer una vez',
    }),
});

export type ReplacePendingBalancesDto = z.infer<typeof replacePendingBalancesSchema>;
