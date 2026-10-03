import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { firstItem } from '@sextante/core/arrays';
import type { ImportedIncome, ImportFailureCode, ImportIncomeSummary } from '@sextante/core/imports/types';

import { isPgError, PG_UNIQUE_VIOLATION } from '../common/pg-error.js';
import { DRIZZLE, type Database } from '../db/database.module.js';
import { positions, type Position } from '../db/schema.js';
import { IncomeService } from '../income/income.service.js';
import { LotAggregateError } from '../positions/lot-aggregate.js';
import { brokerEquals, type DatabaseOrTransaction } from '../positions/position-access.js';
import { PositionLotsService } from '../positions/position-lots.service.js';
import {
  incomeExternalIdOf,
  toLotInput,
  TRADE_REPUBLIC_BROKER,
  type InstrumentGroup,
} from './trade-republic-import.model.js';

/** `positions.name` es `varchar(100)`. */
const NAME_MAX_LENGTH = 100;

/** Resultado de escribir un instrumento: la posición tal como quedó y cuántos lotes entraron. */
export type InstrumentWriteOutcome = { position: Position; wasCreated: boolean; inserted: number };

/**
 * Lado de ESCRITURA de la importación de Trade Republic: crea o amplía la posición de cada
 * instrumento (una transacción por posición, para que una que quede en negativo solo revierta la
 * suya) y guarda los cobros. Los lotes entran con `PositionLotsService.appendImported`, así que la
 * posición se recalcula con el mismo `recompute` que las altas manuales. Idempotente por
 * `external_id`.
 */
@Injectable()
export class TradeImportWriter {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly lots: PositionLotsService,
    private readonly income: IncomeService,
  ) {}

  /** Escribe las operaciones nuevas de un instrumento en su propia transacción. */
  importInstrument(
    userId: string,
    group: InstrumentGroup,
    existing: Position | undefined,
  ): Promise<InstrumentWriteOutcome> {
    return this.db.transaction((tx) => this.writeInstrument(tx, userId, group, existing));
  }

  /** Da la clase de activo del bróker a una posición importada antes de que se guardara; devuelve la posición. */
  backfillAssetClass(position: Position | undefined, group: InstrumentGroup): Promise<Position | undefined> {
    return this.backfillAssetClassIn(this.db, position, group);
  }

  /**
   * Guarda los cobros en una transacción, enlazando cada uno con la posición de Trade Republic de su
   * ISIN si la hay. Idempotente por `external_id`.
   */
  async importIncome(userId: string, items: readonly ImportedIncome[]): Promise<ImportIncomeSummary> {
    if (items.length === 0) return { created: 0, duplicates: 0, reportedToAeat: 0 };
    const known = await this.income.findImportedIds(userId, items.map(incomeExternalIdOf));
    const fresh = items.filter((item) => !known.has(incomeExternalIdOf(item)));
    const isins = [...new Set(fresh.map((item) => item.isin).filter((isin): isin is string => isin !== null))];
    const positionByIsin = new Map<string, string>();
    if (isins.length > 0) {
      const rows = await this.db
        .select({ id: positions.id, ticker: positions.ticker })
        .from(positions)
        .where(
          and(eq(positions.userId, userId), inArray(positions.ticker, isins), brokerEquals(TRADE_REPUBLIC_BROKER)),
        );
      for (const row of rows) positionByIsin.set(row.ticker, row.id);
    }

    const created = await this.db.transaction((tx) =>
      this.income.appendImported(
        tx,
        userId,
        fresh.map((item) => ({
          ...item,
          externalId: incomeExternalIdOf(item),
          positionId: item.isin ? (positionByIsin.get(item.isin) ?? null) : null,
        })),
      ),
    );
    return {
      created,
      // Incluye lo que otra petición concurrente importó entre la lectura y la escritura.
      duplicates: items.length - created,
      reportedToAeat: fresh.filter((item) => item.reportedToAeat).length,
    };
  }

  private async writeInstrument(
    tx: DatabaseOrTransaction,
    userId: string,
    group: InstrumentGroup,
    existing: Position | undefined,
  ): Promise<InstrumentWriteOutcome> {
    let position = existing;
    const wasCreated = position === undefined;

    if (position === undefined) {
      position = firstItem(
        await tx
          .insert(positions)
          .values({
            userId,
            ticker: group.isin,
            name: group.name.slice(0, NAME_MAX_LENGTH) || null,
            // La foto real la escribe `appendImported` al recalcular; aquí solo el hueco.
            quantity: '0',
            avgPrice: '0',
            broker: TRADE_REPUBLIC_BROKER,
            currency: 'EUR',
            isDerivative: group.assetClass === 'derivative',
            assetClass: group.assetClass,
          })
          .returning(),
      );
    }

    if (!wasCreated) position = (await this.backfillAssetClassIn(tx, position, group)) ?? position;

    const { inserted } = await this.lots.appendImported(tx, {
      positionId: position.id,
      userId,
      lots: group.fresh.map(toLotInput),
    });

    if (wasCreated && inserted === 0) {
      // Otra petición concurrente ya había importado todos estos lotes: no dejar una posición vacía.
      await tx.delete(positions).where(eq(positions.id, position.id));
      return { position, wasCreated: false, inserted };
    }

    // La posición existe: la ha escrito esta misma transacción.
    const fresh = firstItem(await tx.select().from(positions).where(eq(positions.id, position.id)));
    return { position: fresh, wasCreated, inserted };
  }

  private async backfillAssetClassIn(
    db: DatabaseOrTransaction,
    position: Position | undefined,
    group: InstrumentGroup,
  ): Promise<Position | undefined> {
    if (!position || position.assetClass !== null) return position;
    const [updated] = await db
      .update(positions)
      .set({ assetClass: group.assetClass })
      .where(and(eq(positions.id, position.id), eq(positions.userId, position.userId)))
      .returning();
    return updated ?? position;
  }
}

/** Traduce el error de la transacción de un instrumento al código que ve el usuario. */
export function failureOf(error: unknown): ImportFailureCode {
  if (error instanceof LotAggregateError && (error.code === 'NEGATIVE_QUANTITY' || error.code === 'OVERFLOW')) {
    return error.code;
  }
  // Un lote con el mismo `external_id` lo insertó a la vez otra importación del mismo fichero:
  // no es un fallo inesperado, basta con volver a importar (la deduplicación lo completará).
  if (isPgError(error, PG_UNIQUE_VIOLATION)) return 'CONFLICT';
  return 'UNEXPECTED';
}
