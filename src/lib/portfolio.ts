/**
 * Tipos y constantes de la cartera, compartidos por el server component y el island de
 * cliente. NO debe importar `server-only` ni `next/headers`: tiene que poder cargarse
 * en el bundle del cliente. El fetch server-side vive en `portfolio.server.ts`.
 */

/** Divisas admitidas (en paridad con el backend `SUPPORTED_CURRENCIES`). */
export const PORTFOLIO_CURRENCIES = ["EUR", "USD", "GBP"] as const;
export type PortfolioCurrency = (typeof PORTFOLIO_CURRENCIES)[number];

/** Una posición tal y como la devuelve la API (números ya parseados, fecha ISO). */
export type Position = {
  id: string;
  ticker: string;
  name: string | null;
  quantity: number;
  avgPrice: number;
  broker: string;
  currency: string;
  createdAt: string;
};
