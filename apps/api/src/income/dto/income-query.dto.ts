import { z } from 'zod';

import { fiscalYearParamSchema } from '../../common/dto/fiscal-year.js';

/** Query of GET /api/income: optional filters by tax year and by position. */
export const incomeQuerySchema = z.strictObject({
  year: fiscalYearParamSchema.optional(),
  positionId: z.uuid().optional(),
});

export type IncomeQueryDto = z.infer<typeof incomeQuerySchema>;
