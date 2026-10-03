/**
 * Traduce lo tecleado (símbolo o ISIN) al símbolo de la fuente de precios. `resolve` llama
 * a OpenFIGI (refresco diario); `resolveCached` y `resolveManyCached` solo miran la caché,
 * para que cargar la cartera no genere tráfico externo.
 */
export interface SymbolResolver {
  resolve(tickerOrIsin: string): Promise<string | null>;
  resolveCached(tickerOrIsin: string): Promise<string | null>;
  /** Lo mismo que `resolveCached` para muchos a la vez, en UNA consulta: entrada → símbolo (o null). */
  resolveManyCached(tickersOrIsins: readonly string[]): Promise<Map<string, string | null>>;
}

export const SYMBOL_RESOLVER = Symbol('SYMBOL_RESOLVER');

export function normalizeQuery(tickerOrIsin: string): string {
  return tickerOrIsin.trim().toUpperCase();
}
