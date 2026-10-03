import { z } from 'zod';

/** Longer than any name or ISIN someone types into the search box; bounds what is forwarded to Yahoo. */
const MAX_QUERY_LENGTH = 40;

/** Query of GET /api/instruments/search: `?q=` (optional; a short or empty one yields no results). */
export const instrumentSearchQuerySchema = z.strictObject({
  q: z.string().trim().max(MAX_QUERY_LENGTH).default(''),
});

export type InstrumentSearchQueryDto = z.infer<typeof instrumentSearchQuerySchema>;
