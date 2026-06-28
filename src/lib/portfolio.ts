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
