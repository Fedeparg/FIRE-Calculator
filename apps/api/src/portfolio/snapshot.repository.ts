import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import type { StoredSnapshot } from '@sextante/core/portfolio/staleness';

import { DRIZZLE, type Database } from '../db/database.module.js';
import { portfolioSnapshots } from '../db/schema.js';
import type { DatabaseOrTransaction } from '../positions/position-access.js';

/** Rows per statement when writing the rebuilt history (avoids one statement per day). */
const CHUNK_SIZE = 200;

/** A `portfolio_snapshots` row ready to insert: the day's values, whose they are and whether estimated. */
export type SnapshotInsert = StoredSnapshot & { userId: string };

/** A full `portfolio_snapshots` row. */
type SnapshotRow = typeof portfolioSnapshots.$inferSelect;

/** A stored row with what the rebuild diff and the staleness rule need. */
export type ExistingSnapshot = StoredSnapshot & { updatedAt: Date };

/**
 * Access to `portfolio_snapshots`: the history's SQL reads and writes, so that
 * `PortfolioSnapshotsService` stays on orchestration (what to capture and what to rebuild) and
 * the decision of what to write stays pure (`planSnapshotWrites`). The rebuild operations
 * receive the caller's transaction, which holds the user's lock.
 */
@Injectable()
export class SnapshotRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** A real capture of one day: replaces any row for that date, estimated or not. */
  async upsertCapture(row: SnapshotInsert): Promise<void> {
    await this.db
      .insert(portfolioSnapshots)
      .values(row)
      .onConflictDoUpdate({
        target: [portfolioSnapshots.userId, portfolioSnapshots.date],
        set: {
          invested: row.invested,
          marketValue: row.marketValue,
          valuedPositions: row.valuedPositions,
          totalPositions: row.totalPositions,
          fxRates: row.fxRates,
          estimated: false,
          updatedAt: new Date(),
        },
      });
  }

  /**
   * A user's stored rows, with only the columns the diff compares. `fx_rates` (jsonb) is still
   * fetched: comparing it in SQL by hash would require reproducing jsonb's canonical text in JS,
   * and any mismatch would make every night rewrite everything as "changed".
   */
  loadExisting(tx: DatabaseOrTransaction, userId: string): Promise<ExistingSnapshot[]> {
    return tx
      .select({
        date: portfolioSnapshots.date,
        invested: portfolioSnapshots.invested,
        marketValue: portfolioSnapshots.marketValue,
        valuedPositions: portfolioSnapshots.valuedPositions,
        totalPositions: portfolioSnapshots.totalPositions,
        fxRates: portfolioSnapshots.fxRates,
        estimated: portfolioSnapshots.estimated,
        updatedAt: portfolioSnapshots.updatedAt,
      })
      .from(portfolioSnapshots)
      .where(eq(portfolioSnapshots.userId, userId));
  }

  /**
   * Writes the rebuild rows in chunks. An estimated row is always overwritten; a real one only
   * if it is in `staleReal` and has not changed since `readAt` (race with the nightly capture,
   * which would have rewritten it fresh after it was read).
   */
  async upsertReconstructed(
    tx: DatabaseOrTransaction,
    rows: readonly SnapshotInsert[],
    staleReal: ReadonlySet<string>,
    readAt: Date,
  ): Promise<void> {
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const staleInChunk = chunk.filter((row) => staleReal.has(row.date)).map((row) => row.date);
      const overwritable: SQL | undefined =
        staleInChunk.length > 0
          ? and(
              eq(portfolioSnapshots.estimated, false),
              inArray(portfolioSnapshots.date, staleInChunk),
              lte(portfolioSnapshots.updatedAt, readAt),
            )
          : undefined;
      await tx
        .insert(portfolioSnapshots)
        .values(chunk)
        .onConflictDoUpdate({
          target: [portfolioSnapshots.userId, portfolioSnapshots.date],
          set: {
            invested: sql`excluded.invested`,
            marketValue: sql`excluded.market_value`,
            valuedPositions: sql`excluded.valued_positions`,
            totalPositions: sql`excluded.total_positions`,
            fxRates: sql`excluded.fx_rates`,
            estimated: sql`excluded.estimated`,
            updatedAt: new Date(),
          },
          setWhere: overwritable
            ? or(eq(portfolioSnapshots.estimated, true), overwritable)
            : eq(portfolioSnapshots.estimated, true),
        });
    }
  }

  /** Removes estimates by date, in chunks. Never touches a real capture. */
  async deleteEstimated(tx: DatabaseOrTransaction, userId: string, dates: readonly string[]): Promise<void> {
    for (let i = 0; i < dates.length; i += CHUNK_SIZE) {
      await tx
        .delete(portfolioSnapshots)
        .where(
          and(
            eq(portfolioSnapshots.userId, userId),
            eq(portfolioSnapshots.estimated, true),
            inArray(portfolioSnapshots.date, dates.slice(i, i + CHUNK_SIZE)),
          ),
        );
    }
  }

  /** A user's series from `from` (inclusive), oldest first. */
  listSince(userId: string, from: string): Promise<SnapshotRow[]> {
    return this.db
      .select()
      .from(portfolioSnapshots)
      .where(and(eq(portfolioSnapshots.userId, userId), gte(portfolioSnapshots.date, from)))
      .orderBy(asc(portfolioSnapshots.date));
  }
}
