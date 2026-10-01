/**
 * Traduce lo que el usuario teclea (`positions.ticker`: un símbolo o un ISIN) al símbolo
 * que entiende la fuente de precios (Yahoo: "AAPL", "EUNL.DE", "BTC-USD").
 *
 * Dos caminos a propósito:
 * - `resolve` hace la resolución completa (cara: OpenFIGI + validación contra la fuente) y
 *   la cachea. La usa el refresco diario (proceso de fondo).
 * - `resolveCached` solo lee la caché (sin llamadas externas). La usa la ruta de lectura
 *   del usuario (`getPrices`), para que cargar la cartera nunca dispare tráfico externo ni
 *   latencia: un símbolo aún sin resolver simplemente no tiene precio hasta el próximo
 *   refresco. Coherente con "el usuario SIEMPRE lee de nuestra DB".
 *
 * Cambiar de implementación es sustituir la clase en el módulo; ni
 * `PricesService` ni el esquema cambian. Ver `_local/datos-inversiones-api.md`.
 */
export interface SymbolResolver {
  /** Resolución completa (cache-first; en miss consulta la fuente y cachea). Para el refresco. */
  resolve(tickerOrIsin: string): Promise<string | null>;
  /** Solo caché, sin llamadas externas. Para la ruta de lectura del usuario (`getPrices`). */
  resolveCached(tickerOrIsin: string): Promise<string | null>;
}

/** Token de inyección para el resolver activo. */
export const SYMBOL_RESOLVER = Symbol('SYMBOL_RESOLVER');

/** Normaliza lo tecleado: sin espacios y en mayúsculas (los símbolos de Yahoo lo son). */
export function normalizeQuery(tickerOrIsin: string): string {
  return tickerOrIsin.trim().toUpperCase();
}
