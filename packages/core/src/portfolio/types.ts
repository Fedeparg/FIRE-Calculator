/**
 * Tipos de la cartera, compartidos por el server component y el island de cliente. No debe importar
 * `server-only` ni `next/headers` para poder cargarse en el bundle del cliente.
 */

/** Precio tal como lo sirve `GET /api/prices`. */
export type PriceInfo = {
  symbol: string;
  close: number;
  currency: string;
  date: string;
  /** Instante ISO de lectura; con refresco intradía cambia en el día. */
  fetchedAt: string;
  previousClose: number | null;
};

export type FxRates = {
  rates: Record<string, number>;
  asOf: string | null;
};

export type InstrumentType = "equity" | "etf" | "fund" | "crypto" | "index" | "currency" | "other";

export type InstrumentSearchResult = {
  symbol: string;
  name: string;
  type: InstrumentType;
  exchange: string | null;
};

export type Position = {
  id: string;
  ticker: string;
  name: string | null;
  quantity: number;
  avgPrice: number;
  broker: string | null;
  currency: string;
  /** Derivado: se registra pero no se valora ni entra en los totales. */
  isDerivative: boolean;
  createdAt: string;
};

export type PositionLotKind = "buy" | "sell";

/**
 * Operación de una posición (`GET /api/positions/:positionId/lots`). No lleva divisa propia: sus
 * importes están en la de su posición, lo que permite sumarlos sin convertir.
 */
export type PositionLot = {
  id: string;
  positionId: string;
  kind: PositionLotKind;
  quantity: number;
  price: number;
  /** Comisiones y gastos: no entran en el precio medio, sí en la fiscalidad. */
  fees: number;
  tradedAt: string;
  note: string | null;
  createdAt: string;
};

export type LotPayload = {
  kind: PositionLotKind;
  quantity: number;
  price: number;
  fees: number;
  tradedAt: string;
  note?: string;
};

export type PositionPayload = {
  ticker: string;
  name?: string;
  quantity: number;
  avgPrice: number;
  broker?: string;
  currency: string;
};

export interface HistoryPointDto {
  date: string;
  invested: number | null;
  marketValue: number | null;
  pnlAbs: number | null;
  pnlPct: number | null;
  valuedPositions: number;
  totalPositions: number;
  /** `true` si el punto es anterior al seguimiento en Sextante: reconstrucción desde los lotes (ver `portfolio-snapshots.service.ts`). */
  estimated: boolean;
}

export interface PortfolioHistoryDto {
  display: string;
  /** Divisa de almacenamiento (EUR). */
  base: string;
  points: HistoryPointDto[];
}
