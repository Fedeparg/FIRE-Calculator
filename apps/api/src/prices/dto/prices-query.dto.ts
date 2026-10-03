import { z } from 'zod';

/** Tope de símbolos por petición: holgado para una cartera real y acota el `IN (…)` de la consulta. */
export const MAX_PRICE_SYMBOLS = 200;
/** Igual que la columna `positions.ticker` (`varchar(20)`): un ticker más largo no puede existir. */
const MAX_SYMBOL_LENGTH = 20;

/** Query de GET /api/prices: `?symbols=AAPL,EUNL.DE,BTC-USD` (opcional; sin él, ningún precio). */
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
