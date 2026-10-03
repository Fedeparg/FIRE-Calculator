import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, asc, eq, type SQL } from 'drizzle-orm';
import { firstItem } from '@sextante/core/arrays';

import { DRIZZLE, type Database } from '../db/database.module.js';
import { positionLots, positions, type PositionLot } from '../db/schema.js';
import type { CreatePositionLotDto } from './dto/create-position-lot.dto.js';
import type { UpdatePositionLotDto } from './dto/update-position-lot.dto.js';
import { aggregateLots, AMOUNT_SCALE, LotAggregateError, parseDecimal, type LotAggregate } from './lot-aggregate.js';
import { findOwnedPosition, type DatabaseOrTransaction } from './position-access.js';
import { toPositionLotResponse, type PositionLotResponse } from './position.mapper.js';
import { LOT_CHANGED_EVENT, type LotChangedEvent } from './position-events.js';
import { todayUtc } from '../common/dates.js';

/** A lot imported from a broker (amounts as decimal `string`). */
export type ImportedLotInput = {
  externalId: string;
  kind: 'buy' | 'sell';
  quantity: string;
  price: string;
  fees: string;
  tradedAt: string;
};

/**
 * Lot CRUD and recompute of `positions.quantity/avgPrice` from the lots. Every mutation runs
 * inside a transaction that ends by rewriting those fields, so the snapshot (`positions`) and the
 * lots always agree. Ownership is checked with `findOwnedPosition` rather than `PositionsService`,
 * which injects this service (avoids a cycle).
 */
@Injectable()
export class PositionLotsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly events: EventEmitter2,
  ) {}

  private emitLotChanged(userId: string, positionId: string, invalidateFrom?: string): void {
    this.events.emit(LOT_CHANGED_EVENT, {
      userId,
      positionId,
      invalidateFrom,
    } satisfies LotChangedEvent);
  }

  /** Lots of one of the user's positions, in chronological order. */
  async listByPosition(userId: string, positionId: string): Promise<PositionLotResponse[]> {
    await findOwnedPosition(this.db, userId, positionId);
    const rows = await this.selectLots(this.db, positionId);
    return rows.map((row) => toPositionLotResponse(row));
  }

  /** All of the user's lots (by the denormalised `userId`, no join); used by the GDPR export and the MCP trades tool. */
  async findAllByUser(userId: string): Promise<PositionLotResponse[]> {
    const rows = await this.db
      .select()
      .from(positionLots)
      .where(eq(positionLots.userId, userId))
      .orderBy(asc(positionLots.tradedAt), asc(positionLots.createdAt), asc(positionLots.id));

    return rows.map((row) => toPositionLotResponse(row));
  }

  /** Adds a lot and re-aggregates in one transaction: an invalid sequence (sell into negative) rolls it back. */
  async create(userId: string, positionId: string, dto: CreatePositionLotDto): Promise<PositionLotResponse> {
    const created = await this.db.transaction(async (tx) => {
      await findOwnedPosition(tx, userId, positionId);

      const row = firstItem(
        await tx
          .insert(positionLots)
          .values({
            positionId,
            userId,
            kind: dto.kind,
            quantity: dto.quantity.toString(),
            price: dto.price.toString(),
            fees: (dto.fees ?? 0).toString(),
            tradedAt: dto.tradedAt,
            note: dto.note || null,
          })
          .returning(),
      );

      await this.recompute(tx, positionId);
      return toPositionLotResponse(row);
    });
    this.emitLotChanged(userId, positionId);
    return created;
  }

  /** Edits a lot and re-aggregates (same transaction). */
  async update(
    userId: string,
    positionId: string,
    lotId: string,
    dto: UpdatePositionLotDto,
  ): Promise<PositionLotResponse> {
    let previousDate: string | undefined;
    let changed = true;
    const updated = await this.db.transaction(async (tx) => {
      await findOwnedPosition(tx, userId, positionId);
      const current = await this.findLot(tx, positionId, lotId);
      // Moving a lot to a later date empties the range [old, new) and its `updatedAt` only reaches
      // from the new date on: the old date is reported too.
      if (dto.tradedAt !== undefined && dto.tradedAt !== current.tradedAt) previousDate = current.tradedAt;

      // No real change means no write: touching `updatedAt` would invalidate real captures (see
      // `staleSnapshotDates`) over a cosmetic edit.
      const next = {
        kind: dto.kind ?? current.kind,
        quantity: dto.quantity !== undefined ? dto.quantity.toString() : current.quantity,
        price: dto.price !== undefined ? dto.price.toString() : current.price,
        fees: dto.fees !== undefined ? dto.fees.toString() : current.fees,
        tradedAt: dto.tradedAt ?? current.tradedAt,
        note: dto.note !== undefined ? dto.note || null : current.note,
      };
      if (
        next.kind === current.kind &&
        sameAmount(next.quantity, current.quantity) &&
        sameAmount(next.price, current.price) &&
        sameAmount(next.fees, current.fees) &&
        next.tradedAt === current.tradedAt &&
        next.note === current.note
      ) {
        changed = false;
        return toPositionLotResponse(current);
      }

      const [row] = await tx
        .update(positionLots)
        .set({
          kind: dto.kind ?? current.kind,
          quantity: dto.quantity !== undefined ? dto.quantity.toString() : current.quantity,
          price: dto.price !== undefined ? dto.price.toString() : current.price,
          fees: dto.fees !== undefined ? dto.fees.toString() : current.fees,
          tradedAt: dto.tradedAt ?? current.tradedAt,
          note: dto.note !== undefined ? dto.note || null : current.note,
          updatedAt: new Date(),
        })
        .where(this.ownedLot(userId, positionId, lotId))
        .returning();
      if (!row) throw lotNotFound();

      await this.recompute(tx, positionId);
      return toPositionLotResponse(row);
    });
    if (changed) this.emitLotChanged(userId, positionId, previousDate);
    return updated;
  }

  /** Deletes a lot and re-aggregates (same transaction). */
  async remove(userId: string, positionId: string, lotId: string): Promise<void> {
    // A deleted lot leaves no timestamp behind: its trade date is reported instead.
    const removedDate = await this.db.transaction(async (tx) => {
      await findOwnedPosition(tx, userId, positionId);
      const lot = await this.findLot(tx, positionId, lotId);
      const deleted = await tx
        .delete(positionLots)
        .where(this.ownedLot(userId, positionId, lotId))
        .returning({ id: positionLots.id });
      if (deleted.length === 0) throw lotNotFound();
      await this.recompute(tx, positionId);
      return lot.tradedAt;
    });
    this.emitLotChanged(userId, positionId, removedDate);
  }

  /** Adds a lot without checking ownership (the caller already did) and re-aggregates; used by `PositionsService` on create and combine. */
  async appendLotOwned(
    tx: DatabaseOrTransaction,
    input: {
      positionId: string;
      userId: string;
      kind: 'buy' | 'sell';
      quantity: string;
      price: string;
      tradedAt: string;
    },
  ): Promise<void> {
    await tx.insert(positionLots).values({
      positionId: input.positionId,
      userId: input.userId,
      kind: input.kind,
      quantity: input.quantity,
      price: input.price,
      tradedAt: input.tradedAt,
    });
    await this.recompute(tx, input.positionId);
  }

  /**
   * Adds imported lots (the caller already checked ownership) and re-aggregates once, not per
   * lot. Idempotent: `ON CONFLICT DO NOTHING` on `(user_id, external_id)` discards those already
   * imported, also under a concurrent request; returns how many went in.
   *
   * Lots arrive in execution order, but the aggregate breaks same-day ties by `createdAt` and
   * `defaultNow()` gives the whole transaction the same value: an increasing one (+1 ms) is
   * assigned to keep the broker's order in the moving average cost.
   * An invalid sequence (`NEGATIVE_QUANTITY`) makes `recompute` throw and the caller rolls back.
   */
  async appendImported(
    tx: DatabaseOrTransaction,
    input: { positionId: string; userId: string; lots: readonly ImportedLotInput[] },
  ): Promise<{ inserted: number; aggregate: LotAggregate }> {
    const base = Date.now();
    const inserted = await tx
      .insert(positionLots)
      .values(
        input.lots.map((lot, i) => ({
          positionId: input.positionId,
          userId: input.userId,
          kind: lot.kind,
          quantity: lot.quantity,
          price: lot.price,
          fees: lot.fees,
          tradedAt: lot.tradedAt,
          externalId: lot.externalId,
          createdAt: new Date(base + i),
        })),
      )
      .onConflictDoNothing()
      .returning({ id: positionLots.id });

    const aggregate = await this.recompute(tx, input.positionId);
    return { inserted: inserted.length, aggregate };
  }

  /**
   * Rewrites the lots so they reflect a quantity and average price declared by hand (UI or
   * MCP). It is a declaration of the current state, not a market trade (lowering the average
   * price is neither a buy nor a sell):
   *   - 1 lot: edited in place. 0 lots: the initial one is created.
   *   - more than 1: collapsed into one synthetic lot dated like the oldest. Destructive on
   *     purpose (lots and position out of sync would break the next recompute); the lot
   *     endpoints are there to keep the history.
   *   - with any sell it is rejected with 409 `HAS_SALES`: collapsing would erase realised gains
   *     (the basis of the capital gains report). Unless the amounts are the current ones: the form
   *     always sends them and changing only the name or broker must not fail.
   */
  async declareState(
    tx: DatabaseOrTransaction,
    input: { positionId: string; userId: string; quantity: string; price: string },
  ): Promise<void> {
    const existing = await this.selectLots(tx, input.positionId);

    if (existing.some((lot) => lot.kind === 'sell')) {
      const current = aggregateLots(existing);
      if (sameAmount(current.quantity, input.quantity) && sameAmount(current.avgPrice, input.price)) {
        return;
      }
      throw new ConflictException({
        code: 'HAS_SALES',
        message:
          'Esta posición tiene ventas registradas: cambia la cantidad o el precio medio desde sus operaciones para no perder el histórico',
      });
    }

    if (existing.length === 1) {
      const only = firstItem(existing);
      // Declaring what is already there does not touch the lot (see `staleSnapshotDates`).
      if (only.kind === 'buy' && sameAmount(only.quantity, input.quantity) && sameAmount(only.price, input.price)) {
        return;
      }
      await tx
        .update(positionLots)
        .set({ kind: 'buy', quantity: input.quantity, price: input.price, updatedAt: new Date() })
        .where(eq(positionLots.id, only.id));
    } else {
      const tradedAt = existing[0]?.tradedAt ?? todayUtc();
      if (existing.length > 1) {
        await tx.delete(positionLots).where(eq(positionLots.positionId, input.positionId));
      }
      await tx.insert(positionLots).values({
        positionId: input.positionId,
        userId: input.userId,
        kind: 'buy',
        quantity: input.quantity,
        price: input.price,
        tradedAt,
      });
    }

    await this.recompute(tx, input.positionId);
  }

  /** Re-aggregates the lots and writes the result to `positions`: the only place that syncs it; call inside the mutation's transaction. */
  async recompute(tx: DatabaseOrTransaction, positionId: string): Promise<LotAggregate> {
    // Locks the position row before re-reading the lots: without this, two concurrent mutations
    // (web + MCP, import + edit) each read the lots without the other's INSERT and the last
    // `UPDATE` wins (lost update). With the lock, the second one waits and, under READ COMMITTED,
    // its next `SELECT` already sees what the first one committed. `NO KEY UPDATE` rather than
    // `UPDATE`: the lot INSERT already holds a `KEY SHARE` on the position (through the FK), which
    // `FOR UPDATE` conflicts with (deadlock between the two); `NO KEY UPDATE` does not.
    await tx.select({ id: positions.id }).from(positions).where(eq(positions.id, positionId)).for('no key update');
    const lots = await this.selectLots(tx, positionId);
    const aggregate = aggregateLots(lots);

    await tx
      .update(positions)
      .set({
        quantity: aggregate.quantity,
        avgPrice: aggregate.avgPrice,
        updatedAt: new Date(),
      })
      .where(eq(positions.id, positionId));

    return aggregate;
  }

  /** A position's lots in the canonical order `(tradedAt, createdAt, id)`. */
  private selectLots(tx: DatabaseOrTransaction, positionId: string): Promise<PositionLot[]> {
    return tx
      .select()
      .from(positionLots)
      .where(eq(positionLots.positionId, positionId))
      .orderBy(asc(positionLots.tradedAt), asc(positionLots.createdAt), asc(positionLots.id));
  }

  /** Filtering by `positionId` (already validated as owned) makes another user's lot id give a 404. */
  private async findLot(tx: DatabaseOrTransaction, positionId: string, lotId: string): Promise<PositionLot> {
    const [row] = await tx
      .select()
      .from(positionLots)
      .where(and(eq(positionLots.id, lotId), eq(positionLots.positionId, positionId)));
    if (!row) {
      throw lotNotFound();
    }
    return row;
  }

  /**
   * Condition "lot `lotId`, of position `positionId`, belongs to `userId`". Writes use it on top
   * of `findOwnedPosition`/`findLot`: defence in depth (see `ownedPosition`).
   */
  private ownedLot(userId: string, positionId: string, lotId: string): SQL {
    return and(
      eq(positionLots.id, lotId),
      eq(positionLots.positionId, positionId),
      eq(positionLots.userId, userId),
    ) as SQL;
  }
}

function lotNotFound(): NotFoundException {
  return new NotFoundException('Lote no encontrado');
}

/** Same amount at the column's scale? Compares in fixed point; an unparsable value (e.g. exponential) counts as different. */
export function sameAmount(a: string, b: string): boolean {
  try {
    return parseDecimal(a, AMOUNT_SCALE) === parseDecimal(b, AMOUNT_SCALE);
  } catch (error) {
    if (error instanceof LotAggregateError) return false;
    throw error;
  }
}
