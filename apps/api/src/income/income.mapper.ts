import type { IncomeEvent } from '@sextante/core/fiscal/income';

import { numberOrNull } from '../common/numeric.js';
import type { IncomeEventRow } from '../db/schema.js';

/** Fila de `income_events` → cobro de la API (los `numeric` como `number`). Lo comparten REST, el MCP y el export RGPD. */
export function toIncomeEvent(row: IncomeEventRow): IncomeEvent {
  return {
    id: row.id,
    positionId: row.positionId,
    kind: row.kind,
    paidAt: row.paidAt,
    isin: row.isin,
    name: row.name,
    country: row.country,
    currency: row.currency,
    gross: Number(row.gross),
    withholdingOrigin: numberOrNull(row.withholdingOrigin),
    withholdingSpain: Number(row.withholdingSpain),
    reportedToAeat: row.reportedToAeat,
    source: row.source,
    grossSource: row.grossSource,
    withholdingOriginSource: row.withholdingOrigin === null ? null : row.withholdingOriginSource,
    quantity: numberOrNull(row.quantity),
    originalAmount: numberOrNull(row.originalAmount),
    originalCurrency: row.originalCurrency,
    createdAt: row.createdAt.toISOString(),
  };
}
