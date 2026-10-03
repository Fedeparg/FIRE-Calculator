import type {
  ImportedAssetClass,
  ImportedIncome,
  ImportedTrade,
  ImportFailureCode,
  ImportResultPosition,
} from '@sextante/core/imports/types';

import type { ImportedLotInput } from '../positions/position-lots.service.js';

/**
 * Shared pieces of the Trade Republic import used by the planner (preview), the writer (confirm)
 * and the orchestrator: the broker, the external ids and the grouping by ISIN.
 */

/** Import broker: the position's broker name and the prefix of the external ids. */
export const TRADE_REPUBLIC_BROKER = 'Trade Republic';
const EXTERNAL_ID_PREFIX = 'trade-republic:';

/** Trades of one ISIN, split between those still to import and those already imported. */
export type InstrumentGroup = {
  isin: string;
  name: string;
  assetClass: ImportedAssetClass;
  fresh: ImportedTrade[];
  duplicates: number;
};

/** A trade's `external_id`: broker prefix + id from the file (idempotency). */
export function externalIdOf(trade: ImportedTrade): string {
  return `${EXTERNAL_ID_PREFIX}${trade.externalId}`;
}

/** An income payment's `external_id`, with the same prefix as the trades. */
export function incomeExternalIdOf(item: ImportedIncome): string {
  return `${EXTERNAL_ID_PREFIX}${item.externalId}`;
}

/** A trade from the file as a lot for `PositionLotsService.appendImported`. */
export function toLotInput(trade: ImportedTrade): ImportedLotInput {
  return {
    externalId: externalIdOf(trade),
    kind: trade.kind,
    quantity: trade.quantity,
    price: trade.price,
    fees: trade.fees,
    tradedAt: trade.tradedAt,
  };
}

/** Confirm-result row for one instrument. */
export function resultOf(
  group: InstrumentGroup,
  status: ImportResultPosition['status'],
  lotsCreated: number,
  quantity: number | null,
  failure: ImportFailureCode | null,
): ImportResultPosition {
  return {
    isin: group.isin,
    name: group.name,
    status,
    lotsCreated,
    // Includes whatever a concurrent request imported between the split and the write.
    duplicates: group.duplicates + (status === 'failed' ? 0 : group.fresh.length - lotsCreated),
    quantity,
    failure,
  };
}

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
