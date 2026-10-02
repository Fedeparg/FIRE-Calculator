/** Abstracción de la fuente de precios (hoy Yahoo). */
export interface Quote {
  /** Símbolo tal y como lo entiende la fuente (p.ej. "AAPL", "EUNL.DE", "BTC-USD"). */
  symbol: string;
  close: number;
  /** ISO 4217. */
  currency: string;
  /** Fecha del cierre, YYYY-MM-DD (UTC). */
  date: string;
}

/** Split de un instrumento: `ratio` = acciones nuevas por cada antigua (10 en un 10:1). */
export interface SplitEvent {
  symbol: string;
  /** Primer día cotizando ya con el split, YYYY-MM-DD (UTC). */
  date: string;
  ratio: number;
}

/** Dividendo por acción, en la divisa de cotización y ajustado por splits posteriores (como lo da la fuente). */
export interface DividendEvent {
  symbol: string;
  /** Fecha ex-dividendo, YYYY-MM-DD (UTC). */
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
  /** Se guarda en `instrument_prices.source` para trazabilidad. */
  readonly name: string;

  /** Los símbolos que fallen o no existan no aparecen en el mapa: el job debe poder refrescar el resto. */
  getQuotes(symbols: string[]): Promise<Map<string, Quote>>;

  /**
   * Cierres diarios (~5 años, antiguo a reciente) ajustados por splits; los splits van aparte
   * para expresar las cantidades históricas en la misma base. Solo para alta/importación y
   * reparar huecos, no para el refresco diario. Serie vacía, sin lanzar, si falla la fuente.
   */
  getHistory(symbol: string): Promise<PriceHistory>;
}

export const PRICE_PROVIDER = Symbol('PRICE_PROVIDER');
