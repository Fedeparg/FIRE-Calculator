import type { AssetClass } from '@sextante/core/portfolio/types';

import type { Position, PositionLot } from '../db/schema.js';

/** Position for the frontend: `numeric` columns (strings in Drizzle) are exposed as `number` because the view is read-only. */
export type PositionResponse = {
  id: string;
  ticker: string;
  name: string | null;
  quantity: number;
  avgPrice: number;
  broker: string | null;
  currency: string;
  /** Derivative: recorded but neither valued nor included in totals. */
  isDerivative: boolean;
  assetClass: AssetClass | null;
  createdAt: string;
};

/** Lot for the frontend: `numeric` as `number` (read-only; internal calculations do not go through here). */
export type PositionLotResponse = {
  id: string;
  positionId: string;
  kind: 'buy' | 'sell';
  quantity: number;
  price: number;
  fees: number;
  tradedAt: string;
  note: string | null;
  createdAt: string;
};

/**
 * Row → response mappers for positions and lots. They live outside the services so REST, MCP and
 * the GDPR (RGPD) export reuse them alike.
 */
export function toPositionResponse(row: Position): PositionResponse {
  return {
    id: row.id,
    ticker: row.ticker,
    name: row.name,
    quantity: Number(row.quantity),
    avgPrice: Number(row.avgPrice),
    broker: row.broker,
    currency: row.currency,
    isDerivative: row.isDerivative,
    assetClass: row.assetClass,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toPositionLotResponse(row: PositionLot): PositionLotResponse {
  return {
    id: row.id,
    positionId: row.positionId,
    kind: row.kind,
    quantity: Number(row.quantity),
    price: Number(row.price),
    fees: Number(row.fees),
    tradedAt: row.tradedAt,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}
