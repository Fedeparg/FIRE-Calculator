import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import type { StoredSnapshot } from '@sextante/core/portfolio/staleness';

import { DRIZZLE, type Database } from '../db/database.module.js';
import { portfolioSnapshots } from '../db/schema.js';
import type { DatabaseOrTransaction } from '../positions/position-access.js';

/** Filas por sentencia al escribir el histórico reconstruido (evita una sentencia por día). */
const CHUNK_SIZE = 200;

/** Fila de `portfolio_snapshots` lista para insertar: los valores del día, de quién y si es estimada. */
export type SnapshotInsert = StoredSnapshot & { userId: string };

/** Fila completa de `portfolio_snapshots`. */
type SnapshotRow = typeof portfolioSnapshots.$inferSelect;

/** Fila guardada con lo que necesita el diff de la reconstrucción y la regla de obsolescencia. */
export type ExistingSnapshot = StoredSnapshot & { updatedAt: Date };

/**
 * Acceso a `portfolio_snapshots`: las lecturas y escrituras de SQL del histórico, para que
 * `PortfolioSnapshotsService` quede en la orquestación (qué capturar y qué reconstruir) y la
 * decisión de qué escribir sea pura (`planSnapshotWrites`). Las operaciones de la reconstrucción
 * reciben la transacción del llamante, que tiene el cerrojo del usuario.
 */
@Injectable()
export class SnapshotRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Captura real de un día: sustituye cualquier fila de esa fecha, estimada o no. */
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
   * Lo guardado de un usuario, solo con las columnas que compara el diff. `fx_rates` (jsonb) se
   * sigue trayendo: compararlo en SQL por hash exigiría reproducir en JS el texto canónico de
   * jsonb, y un desajuste haría que cada noche se reescribiera todo como "cambiado".
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
   * Escribe las filas de la reconstrucción por bloques. Una estimada se pisa siempre; una real
   * solo si es de `staleReal` y no ha cambiado desde `readAt` (carrera con la captura nocturna,
   * que la habría reescrito fresca después de leerla).
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

  /** Retira estimaciones por fecha, por bloques. Nunca toca una captura real. */
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

  /** Serie de un usuario desde `from` (incluido), de la más antigua a la más reciente. */
  listSince(userId: string, from: string): Promise<SnapshotRow[]> {
    return this.db
      .select()
      .from(portfolioSnapshots)
      .where(and(eq(portfolioSnapshots.userId, userId), gte(portfolioSnapshots.date, from)))
      .orderBy(asc(portfolioSnapshots.date));
  }
}
