import type { z } from 'zod';

import { incomeFieldsSchema } from './create-income.dto.js';

/** Body of PATCH /api/income/:id: any subset of fields, at least one. */
export const updateIncomeSchema = incomeFieldsSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { error: 'no hay ningún campo que actualizar' });

export type UpdateIncomeDto = z.infer<typeof updateIncomeSchema>;
