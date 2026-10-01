/** Búsqueda por texto libre que devuelve el símbolo exacto de la fuente ("BTC" es un ETF; Bitcoin es "BTC-USD"). */

export type InstrumentType = 'equity' | 'etf' | 'fund' | 'crypto' | 'index' | 'currency' | 'other';

export interface InstrumentSearchResult {
  /** Símbolo exacto de la fuente, listo para guardar como `ticker` (p. ej. "BTC-USD"). */
  symbol: string;
  name: string;
  type: InstrumentType;
  exchange: string | null;
}

export interface InstrumentSearchProvider {
  /** Lista vacía si no hay coincidencias o la consulta es corta; nunca lanza por fallo de la fuente. */
  search(query: string): Promise<InstrumentSearchResult[]>;
}

export const INSTRUMENT_SEARCH = Symbol('INSTRUMENT_SEARCH');
