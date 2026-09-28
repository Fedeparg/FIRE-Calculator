/**
 * Tipos y constantes de la cartera, compartidos por el server component y el island de
 * cliente. NO debe importar `server-only` ni `next/headers`: tiene que poder cargarse
 * en el bundle del cliente. El fetch server-side vive en `portfolio.server.ts`.
 */

/**
 * Divisas admitidas: las 10 más negociadas del mundo (turnover FX, BIS). Debe mantenerse
 * EN PARIDAD EXACTA con el backend `SUPPORTED_CURRENCIES` (`@IsIn`): una divisa que el
 * backend no acepte provocaría un 400 al guardar. EUR primero (es el valor por defecto).
 */
export const PORTFOLIO_CURRENCIES = [
  "EUR",
  "USD",
  "GBP",
  "JPY",
  "CHF",
  "CAD",
  "AUD",
  "CNY",
  "HKD",
  "SGD",
] as const;
export type PortfolioCurrency = (typeof PORTFOLIO_CURRENCIES)[number];

/** Precio de un instrumento tal y como lo sirve `GET /api/prices` (lectura de nuestra DB). */
export type PriceInfo = {
  symbol: string;
  close: number;
  currency: string;
  date: string;
  /** Instante ISO en que se leyó de la fuente (con el refresco intradía, cambia en el día). */
  fetchedAt: string;
};

/** Tasas FX que sirve `GET /api/fx`: USD por unidad de cada divisa (USD = 1). */
export type FxRates = {
  rates: Record<string, number>;
  asOf: string | null;
};

/** Tipo de instrumento normalizado que sirve `GET /api/instruments/search`. */
export type InstrumentType =
  | "equity"
  | "etf"
  | "fund"
  | "crypto"
  | "index"
  | "currency"
  | "other";

/** Un resultado del buscador de instrumentos: símbolo exacto a guardar + cómo distinguirlo. */
export type InstrumentSearchResult = {
  symbol: string;
  name: string;
  type: InstrumentType;
  exchange: string | null;
};

/** Una posición tal y como la devuelve la API (números ya parseados, fecha ISO). */
export type Position = {
  id: string;
  ticker: string;
  name: string | null;
  quantity: number;
  avgPrice: number;
  broker: string | null;
  currency: string;
  createdAt: string;
};

/** Tipo de operación de un lote: compra o venta. */
export type PositionLotKind = "buy" | "sell";

/**
 * Una operación concreta del histórico de una posición, tal y como la devuelve
 * `GET /api/positions/:positionId/lots`.
 *
 * IMPORTANTE: un lote NO lleva divisa propia. Sus importes están siempre en la divisa de la
 * posición a la que pertenece (`Position.currency`), que es lo que permite sumarlos entre sí
 * sin convertir nada.
 */
export type PositionLot = {
  id: string;
  positionId: string;
  kind: PositionLotKind;
  quantity: number;
  price: number;
  /** Comisiones y gastos de la operación. No entran en el precio medio; sí en la fiscalidad. */
  fees: number;
  /** Fecha de la operación (`YYYY-MM-DD`). */
  tradedAt: string;
  note: string | null;
  createdAt: string;
};
