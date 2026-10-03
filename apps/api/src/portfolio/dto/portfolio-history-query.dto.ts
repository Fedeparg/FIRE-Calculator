import { z } from 'zod';

import { SUPPORTED_CURRENCIES } from '@sextante/core/contracts';
import { HISTORY_MAX_DAYS } from '../portfolio-snapshots.service.js';

/**
 * Query of GET /api/portfolio/history. Strict: a non-numeric `days` or an unknown parameter
 * yields a 400. `z.coerce` is needed because query params arrive as text.
 */
export const portfolioHistoryQuerySchema = z.strictObject({
  /** Look-back window in days; defaults to the service's. */
  days: z.coerce.number().int().min(1).max(HISTORY_MAX_DAYS).optional(),
  /** Currency to re-express the series in (data is stored in EUR). */
  display: z.enum(SUPPORTED_CURRENCIES).optional(),
});

export type PortfolioHistoryQueryDto = z.infer<typeof portfolioHistoryQuerySchema>;
