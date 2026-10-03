/**
 * Portfolio types, shared by the server component and the client island. It must not import
 * `server-only` or `next/headers` so it can be loaded in the client bundle.
 */

/** Price as served by `GET /api/prices`. */
export type PriceInfo = {
  symbol: string;
  close: number;
  currency: string;
  date: string;
  /** ISO read instant; with intraday refreshes it changes during the day. */
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

/**
 * Asset class, to know which block of the tax return its sales go in: stocks (boxes for shares
 * admitted to trading, "acciones admitidas a negociación"), funds and ETFs (collective investment
 * undertakings, "instituciones de inversión colectiva"), derivatives (other assets, "otros
 * elementos patrimoniales") or other. `null` while unknown.
 */
export const ASSET_CLASSES = ["stock", "fund", "derivative", "other"] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export type Position = {
  id: string;
  ticker: string;
  name: string | null;
  quantity: number;
  avgPrice: number;
  broker: string | null;
  currency: string;
  /** Derivative: recorded but neither valued nor included in the totals. */
  isDerivative: boolean;
  assetClass: AssetClass | null;
  createdAt: string;
};

export type PositionLotKind = "buy" | "sell";

/**
 * Trade of a position (`GET /api/positions/:positionId/lots`). It has no currency of its own: its
 * amounts are in its position's currency, so they can be summed without converting.
 */
export type PositionLot = {
  id: string;
  positionId: string;
  kind: PositionLotKind;
  /** Units; always > 0 (`kind` gives the sign). */
  quantity: number;
  /** Unit price of the trade. */
  price: number;
  /** Fees and costs: excluded from the average price, included for tax purposes. */
  fees: number;
  /** Trade date (`YYYY-MM-DD`). */
  tradedAt: string;
  note: string | null;
  /** DB creation instant (ISO); breaks ties between same-day trades. */
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
  assetClass?: AssetClass;
};

export interface HistoryPointDto {
  date: string;
  invested: number | null;
  marketValue: number | null;
  pnlAbs: number | null;
  pnlPct: number | null;
  valuedPositions: number;
  totalPositions: number;
  /** `true` if the point predates tracking in Sextante: reconstructed from the lots (see `portfolio-snapshots.service.ts`). */
  estimated: boolean;
}

export interface PortfolioHistoryDto {
  display: string;
  /** Storage currency (EUR). */
  base: string;
  points: HistoryPointDto[];
}
