/** Free-text search that returns the source's exact symbol ("BTC" is an ETF; Bitcoin is "BTC-USD"). */

export type InstrumentType = 'equity' | 'etf' | 'fund' | 'crypto' | 'index' | 'currency' | 'other';

export interface InstrumentSearchResult {
  /** The source's exact symbol, ready to store as `ticker` (e.g. "BTC-USD"). */
  symbol: string;
  name: string;
  type: InstrumentType;
  exchange: string | null;
}

export interface InstrumentSearchProvider {
  /** Empty list when nothing matches or the query is short; never throws on a source failure. */
  search(query: string): Promise<InstrumentSearchResult[]>;
}

export const INSTRUMENT_SEARCH = Symbol('INSTRUMENT_SEARCH');
