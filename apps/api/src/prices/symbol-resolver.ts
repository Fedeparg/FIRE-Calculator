/**
 * Maps what the user typed (symbol or ISIN) to the price source's symbol. `resolve` calls
 * OpenFIGI (daily refresh); `resolveCached` and `resolveManyCached` only read the cache, so that
 * loading the portfolio generates no external traffic.
 */
export interface SymbolResolver {
  resolve(tickerOrIsin: string): Promise<string | null>;
  resolveCached(tickerOrIsin: string): Promise<string | null>;
  /** Same as `resolveCached` for many at once, in ONE query: input → symbol (or null). */
  resolveManyCached(tickersOrIsins: readonly string[]): Promise<Map<string, string | null>>;
}

export const SYMBOL_RESOLVER = Symbol('SYMBOL_RESOLVER');

export function normalizeQuery(tickerOrIsin: string): string {
  return tickerOrIsin.trim().toUpperCase();
}
