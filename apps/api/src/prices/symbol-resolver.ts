/**
 * Traduce lo tecleado (símbolo o ISIN) al símbolo de la fuente de precios. `resolve` llama
 * a OpenFIGI (refresco diario); `resolveCached` solo mira la caché, para que cargar la
 * cartera no genere tráfico externo.
 */
export interface SymbolResolver {
  resolve(tickerOrIsin: string): Promise<string | null>;
  resolveCached(tickerOrIsin: string): Promise<string | null>;
}

export const SYMBOL_RESOLVER = Symbol('SYMBOL_RESOLVER');

export function normalizeQuery(tickerOrIsin: string): string {
  return tickerOrIsin.trim().toUpperCase();
}
