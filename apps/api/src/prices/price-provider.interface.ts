/** Abstraction of the price source (Yahoo today). */
export interface Quote {
  /** Symbol as the source understands it (e.g. "AAPL", "EUNL.DE", "BTC-USD"). */
  symbol: string;
  close: number;
  /** ISO 4217. */
  currency: string;
  /** Close date, YYYY-MM-DD (UTC). */
  date: string;
}

/** Split of an instrument: `ratio` = new shares per old share (10 in a 10:1 split). */
export interface SplitEvent {
  symbol: string;
  /** First trading day after the split, YYYY-MM-DD (UTC). */
  date: string;
  ratio: number;
}

/** Dividend per share, in the quote currency and adjusted for later splits (as the source reports it). */
export interface DividendEvent {
  symbol: string;
  /** Ex-dividend date, YYYY-MM-DD (UTC). */
  exDate: string;
  amount: number;
  currency: string;
}

export interface PriceHistory {
  quotes: Quote[];
  splits: SplitEvent[];
  dividends: DividendEvent[];
}

export interface PriceProvider {
  /** Stored in `instrument_prices.source` for traceability. */
  readonly name: string;

  /** Symbols that fail or do not exist are absent from the map: the job must still refresh the rest. */
  getQuotes(symbols: string[]): Promise<Map<string, Quote>>;

  /**
   * Daily closes (~5 years, oldest to newest) adjusted for splits; the splits come separately so
   * historical quantities can be expressed on the same basis. Only for new positions/imports and
   * gap repair, not for the daily refresh. Empty series, without throwing, if the source fails.
   */
  getHistory(symbol: string): Promise<PriceHistory>;
}

export const PRICE_PROVIDER = Symbol('PRICE_PROVIDER');
