import { z } from 'zod';

/** Query de GET /api/income: filtros opcionales por ejercicio y por posición. */
export const incomeQuerySchema = z.strictObject({
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  positionId: z.uuid().optional(),
});

export type IncomeQueryDto = z.infer<typeof incomeQuerySchema>;
