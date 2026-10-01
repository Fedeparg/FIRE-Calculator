/**
 * Búsqueda de instrumentos: traduce lo que el usuario teclea ("bitcoin", "apple", "world
 * etf") a una lista de instrumentos concretos entre los que elegir, devolviendo el símbolo
 * EXACTO de la fuente de precios. Resuelve de raíz la ambigüedad de un ticker suelto (p. ej.
 * "BTC" cotiza como un ETF real en NYSE; Bitcoin es "BTC-USD"): en vez de adivinar, el
 * usuario ve nombre + tipo + mercado y elige. Ver `_local/datos-inversiones-api.md`.
 *
 * Es una abstracción aparte de `PriceProvider` a propósito: cotizar y buscar son
 * responsabilidades distintas, y una fuente de pago futura podría cubrir solo una.
 */

/** Tipos de instrumento que exponemos al usuario (normalizados desde la fuente). */
export type InstrumentType = 'equity' | 'etf' | 'fund' | 'crypto' | 'index' | 'currency' | 'other';

/** Un resultado de búsqueda: el símbolo exacto a guardar más lo necesario para distinguirlo. */
export interface InstrumentSearchResult {
  /** Símbolo exacto de la fuente, listo para guardar como `ticker` (p. ej. "BTC-USD", "AAPL"). */
  symbol: string;
  /** Nombre legible del instrumento (p. ej. "Bitcoin USD", "Apple Inc."). */
  name: string;
  /** Tipo normalizado, para el icono/etiqueta de la UI. */
  type: InstrumentType;
  /** Mercado donde cotiza (p. ej. "NASDAQ", "CCC" para cripto), si la fuente lo da. */
  exchange: string | null;
}

export interface InstrumentSearchProvider {
  /**
   * Busca instrumentos por texto libre. Devuelve lista vacía si no hay coincidencias o si
   * la consulta es demasiado corta; nunca lanza por un fallo de la fuente (devuelve []),
   * para que el buscador degrade con suavidad.
   */
  search(query: string): Promise<InstrumentSearchResult[]>;
}

/** Token de inyección para el proveedor de búsqueda activo. */
export const INSTRUMENT_SEARCH = Symbol('INSTRUMENT_SEARCH');
