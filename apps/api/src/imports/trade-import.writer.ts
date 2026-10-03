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

/** `positions.name` is `varchar(100)`. */
const NAME_MAX_LENGTH = 100;

/** Outcome of writing one instrument: the position as it ended up and how many lots went in. */
export type InstrumentWriteOutcome = { position: Position; wasCreated: boolean; inserted: number };

/**
 * WRITE side of the Trade Republic import: creates or extends each instrument's position (one
 * transaction per position, so one that goes negative only rolls back its own) and stores the
 * income payments. Lots go in through `PositionLotsService.appendImported`, so the position is
 * recomputed with the same `recompute` as manual entries. Idempotent by `external_id`.
 */
@Injectable()
export class TradeImportWriter {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly lots: PositionLotsService,
    private readonly income: IncomeService,
  ) {}

  /** Writes an instrument's new trades in its own transaction. */
  importInstrument(
    userId: string,
    group: InstrumentGroup,
    existing: Position | undefined,
  ): Promise<InstrumentWriteOutcome> {
    return this.db.transaction((tx) => this.writeInstrument(tx, userId, group, existing));
  }

  /** Gives the broker's asset class to a position imported before it was stored; returns the position. */
  backfillAssetClass(position: Position | undefined, group: InstrumentGroup): Promise<Position | undefined> {
    return this.backfillAssetClassIn(this.db, position, group);
  }

  /**
   * Stores the income payments in one transaction, linking each to the Trade Republic position of
   * its ISIN when there is one. Idempotent by `external_id`.
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
      // Includes whatever a concurrent request imported between the read and the write.
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
            // `appendImported` writes the real snapshot when it recomputes; this is just the placeholder.
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
      // A concurrent request had already imported all these lots: do not leave an empty position.
      await tx.delete(positions).where(eq(positions.id, position.id));
      return { position, wasCreated: false, inserted };
    }

    // The position exists: this very transaction wrote it.
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

/** Maps the error of an instrument's transaction to the code the user sees. */
export function failureOf(error: unknown): ImportFailureCode {
  if (error instanceof LotAggregateError && (error.code === 'NEGATIVE_QUANTITY' || error.code === 'OVERFLOW')) {
    return error.code;
  }
  // Another import of the same file inserted a lot with the same `external_id` at the same time:
  // not an unexpected failure, importing again is enough (deduplication will complete it).
  if (isPgError(error, PG_UNIQUE_VIOLATION)) return 'CONFLICT';
  return 'UNEXPECTED';
}
