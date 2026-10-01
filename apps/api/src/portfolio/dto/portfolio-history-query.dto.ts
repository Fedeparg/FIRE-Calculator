import { z } from 'zod';

import { SUPPORTED_CURRENCIES } from '@sextante/core/contracts';
import { HISTORY_MAX_DAYS } from '../portfolio-snapshots.service.js';

/**
 * Query de GET /api/portfolio/history. Estricta: un `days` no numérico o un parámetro desconocido
 * da 400. `z.coerce` es necesario porque los query params llegan como texto.
 */
export const portfolioHistoryQuerySchema = z.strictObject({
  /** Ventana en días hacia atrás; por defecto la del servicio. */
  days: z.coerce.number().int().min(1).max(HISTORY_MAX_DAYS).optional(),
  /** Divisa en la que reexpresar la serie (los datos se guardan en EUR). */
  display: z.enum(SUPPORTED_CURRENCIES).optional(),
});

export type PortfolioHistoryQueryDto = z.infer<typeof portfolioHistoryQuerySchema>;
