import { z } from 'zod';

/** Más que cualquier nombre o ISIN que alguien teclee en el buscador; acota lo que se reenvía a Yahoo. */
const MAX_QUERY_LENGTH = 40;

/** Query de GET /api/instruments/search: `?q=` (opcional; corta o vacía, sin resultados). */
export const instrumentSearchQuerySchema = z.strictObject({
  q: z.string().trim().max(MAX_QUERY_LENGTH).default(''),
});

export type InstrumentSearchQueryDto = z.infer<typeof instrumentSearchQuerySchema>;
