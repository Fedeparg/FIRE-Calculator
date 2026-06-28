/**
 * Abstracción de la fuente de precios. El resto del sistema no sabe de dónde vienen los
 * datos: hoy Yahoo (no oficial, gratis), mañana una fuente de pago (EODHD/Twelve Data) sin
 * tocar nada salvo añadir otra implementación. Ver `_local/datos-inversiones-api.md`.
 *
 * La interfaz es "batch-shaped" a propósito (`symbols[]`): aunque Yahoo obligue hoy a una
 * llamada por símbolo, un proveedor de pago futuro puede resolver el lote en una sola.
 */
export interface Quote {
  /** Símbolo tal y como lo entiende la fuente (p.ej. "AAPL", "EUNL.DE", "BTC-USD"). */
  symbol: string;
  /** Precio de cierre / último. */
  close: number;
  /** Divisa del precio (ISO 4217, p.ej. "EUR", "USD"). */
  currency: string;
  /** Fecha del cierre en formato YYYY-MM-DD (UTC). */
  date: string;
}

export interface PriceProvider {
  /** Nombre corto del proveedor, para trazabilidad (se guarda en `instrument_prices.source`). */
  readonly name: string;

  /**
   * Devuelve la cotización de cada símbolo pedido. Los símbolos que fallen o no existan
   * simplemente NO aparecen en el mapa (no se lanza por un símbolo malo): el job debe
   * poder refrescar el resto aunque uno falle.
   */
  getQuotes(symbols: string[]): Promise<Map<string, Quote>>;
}

/** Token de inyección para el proveedor de precios activo. */
export const PRICE_PROVIDER = Symbol('PRICE_PROVIDER');
