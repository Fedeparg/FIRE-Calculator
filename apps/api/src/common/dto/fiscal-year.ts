import { z } from 'zod';

/**
 * Range of tax years the API accepts (REST and MCP). Starting at 1990 comfortably covers any real
 * data of a retail investor; the upper bound only rejects garbage.
 */
export const MIN_FISCAL_YEAR = 1990;
export const MAX_FISCAL_YEAR = 2100;

/** Tax year (an integer year within the range). */
export const fiscalYearSchema = z.number().int().min(MIN_FISCAL_YEAR).max(MAX_FISCAL_YEAR);

/** Tax year that arrives as text (path or query) and is converted to a number. */
export const fiscalYearParamSchema = z.coerce.number().pipe(fiscalYearSchema);
