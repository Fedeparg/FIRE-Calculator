import { z } from 'zod';

import { fiscalYearParamSchema } from '../../common/dto/fiscal-year.js';

/** Query de GET /api/income: filtros opcionales por ejercicio y por posición. */
export const incomeQuerySchema = z.strictObject({
  year: fiscalYearParamSchema.optional(),
  positionId: z.uuid().optional(),
});

export type IncomeQueryDto = z.infer<typeof incomeQuerySchema>;
