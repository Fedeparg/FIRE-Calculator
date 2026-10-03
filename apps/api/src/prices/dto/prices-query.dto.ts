import { z } from 'zod';

/** Cap on symbols per request: ample for a real portfolio, and it bounds the query's `IN (…)`. */
export const MAX_PRICE_SYMBOLS = 200;
/** Matches the `positions.ticker` column (`varchar(20)`): a longer ticker cannot exist. */
const MAX_SYMBOL_LENGTH = 20;

/** Query of GET /api/prices: `?symbols=AAPL,EUNL.DE,BTC-USD` (optional; without it, no prices). */
export const pricesQuerySchema = z.strictObject({
  symbols: z
    .string()
    .optional()
    .transform((value) => [
      ...new Set(
        (value ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ])
    .pipe(z.array(z.string().max(MAX_SYMBOL_LENGTH)).max(MAX_PRICE_SYMBOLS)),
});

export type PricesQueryDto = z.infer<typeof pricesQuerySchema>;
