import type { AssetClass } from '@sextante/core/portfolio/types';

import type { Position, PositionLot } from '../db/schema.js';

/** Posición para el frontend: los `numeric` (string en Drizzle) se exponen como `number` porque la vista es de solo lectura. */
export type PositionResponse = {
  id: string;
  ticker: string;
  name: string | null;
  quantity: number;
  avgPrice: number;
  broker: string | null;
  currency: string;
  /** Derivado: se registra pero no se valora ni entra en los totales. */
  isDerivative: boolean;
  assetClass: AssetClass | null;
  createdAt: string;
};

/** Lote para el frontend: `numeric` como `number` (solo lectura; los cálculos internos no pasan por aquí). */
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
 * Mapeadores fila → respuesta de posiciones y lotes. Viven fuera de los servicios para que los
 * reutilicen igual REST, el MCP y el export RGPD.
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
