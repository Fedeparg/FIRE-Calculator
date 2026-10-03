import type {
  ImportedAssetClass,
  ImportedIncome,
  ImportedTrade,
  ImportFailureCode,
  ImportResultPosition,
} from '@sextante/core/imports/types';

import type { ImportedLotInput } from '../positions/position-lots.service.js';

/**
 * Piezas comunes de la importación de Trade Republic que comparten el planificador (vista previa),
 * el escritor (confirmación) y el orquestador: el bróker, los ids externos y el agrupado por ISIN.
 */

/** Bróker de la importación: nombre de la posición y prefijo de los ids externos. */
export const TRADE_REPUBLIC_BROKER = 'Trade Republic';
const EXTERNAL_ID_PREFIX = 'trade-republic:';

/** Operaciones de un ISIN, separadas entre las que faltan por importar y las ya importadas. */
export type InstrumentGroup = {
  isin: string;
  name: string;
  assetClass: ImportedAssetClass;
  fresh: ImportedTrade[];
  duplicates: number;
};

/** `external_id` de una operación: prefijo del bróker + id del fichero (idempotencia). */
export function externalIdOf(trade: ImportedTrade): string {
  return `${EXTERNAL_ID_PREFIX}${trade.externalId}`;
}

/** `external_id` de un cobro, con el mismo prefijo que las operaciones. */
export function incomeExternalIdOf(item: ImportedIncome): string {
  return `${EXTERNAL_ID_PREFIX}${item.externalId}`;
}

/** Operación del fichero como lote para `PositionLotsService.appendImported`. */
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

/** Fila del resultado de la confirmación para un instrumento. */
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
    // Incluye lo que otra petición concurrente importó entre el reparto y la escritura.
    duplicates: group.duplicates + (status === 'failed' ? 0 : group.fresh.length - lotsCreated),
    quantity,
    failure,
  };
}

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
