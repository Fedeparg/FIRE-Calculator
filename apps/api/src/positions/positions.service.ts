import { BadRequestException, ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, desc, eq, ne } from 'drizzle-orm';
import { firstItem } from '@sextante/core/arrays';

import { DRIZZLE, type Database } from '../db/database.module.js';
import { positions, type Position } from '../db/schema.js';
import { PriceHistoryService } from '../prices/price-history.service.js';
import type { CombinePositionDto } from './dto/combine-position.dto.js';
import type { CreatePositionDto } from './dto/create-position.dto.js';
import type { UpdatePositionDto } from './dto/update-position.dto.js';
import {
  brokerEquals,
  findOwnedPosition,
  ownedPosition,
  positionNotFound,
  type DatabaseOrTransaction,
} from './position-access.js';
import { PositionLotsService, sameAmount } from './position-lots.service.js';
import { toPositionResponse, type PositionResponse } from './position.mapper.js';
import {
  LOT_CHANGED_EVENT,
  POSITION_CREATED_EVENT,
  type LotChangedEvent,
  type PositionCreatedEvent,
} from './position-events.js';
import { isoDate, todayUtc } from '../common/dates.js';
import { isPgError, PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION } from '../common/pg-error.js';

@Injectable()
export class PositionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly prices: PriceHistoryService,
    private readonly lots: PositionLotsService,
    private readonly events: EventEmitter2,
  ) {}

  /** Creates a position after applying the duplicate rule (`assertCanUseTickerBroker`). */
  async create(userId: string, dto: CreatePositionDto): Promise<PositionResponse> {
    const ticker = this.normalizeTicker(dto.ticker);
    const broker = dto.broker?.trim() ?? '';

    await this.assertCanUseTickerBroker(userId, ticker, broker);

    try {
      // Creation and initial lot in the same transaction: without lots, the first recompute would zero it.
      const row = await this.db.transaction(async (tx) => {
        const inserted = firstItem(
          await tx
            .insert(positions)
            .values({
              userId,
              ticker,
              name: dto.name ?? null,
              quantity: dto.quantity.toString(),
              avgPrice: dto.avgPrice.toString(),
              broker: broker || null,
              currency: dto.currency ?? 'EUR',
              assetClass: dto.assetClass ?? null,
            })
            .returning(),
        );

        await this.lots.appendLotOwned(tx, {
          positionId: inserted.id,
          userId,
          kind: 'buy',
          quantity: inserted.quantity,
          price: inserted.avgPrice,
          // Like the backfill: the creation date (UTC) is the closest known date to the real buy.
          tradedAt: isoDate(inserted.createdAt),
        });
        return inserted;
      });

      // On-the-fly price, outside the transaction (it hits the network); fault-tolerant.
      await this.prices.primeSymbol(row.ticker, row.currency);
      // Fire-and-forget event: it must not delay the creation response (see `position-events.ts`).
      this.events.emit(POSITION_CREATED_EVENT, { userId } satisfies PositionCreatedEvent);
      return toPositionResponse(row);
    } catch (error) {
      // The only FK is `userId → users.id`: a valid JWT for a non-existent user (deleted
      // account, DB reset in dev) is a dead session → 401, not 500.
      if (isPgError(error, PG_FOREIGN_KEY_VIOLATION)) {
        throw new UnauthorizedException('La sesión ya no es válida; vuelve a iniciar sesión');
      }
      // Concurrent creation of the same (symbol, broker): the earlier check did not see the other
      // row (not yet committed) and the unique index stopped it. Respond as if it had been seen:
      // 409 DUPLICATE with the existing one (or BROKER_REQUIRED), to offer combining.
      if (isPgError(error, PG_UNIQUE_VIOLATION)) {
        await this.assertCanUseTickerBroker(userId, ticker, broker);
      }
      throw error;
    }
  }

  /** Only the user's positions, newest first. */
  async findAllByUser(userId: string): Promise<PositionResponse[]> {
    const rows = await this.db
      .select()
      .from(positions)
      .where(eq(positions.userId, userId))
      .orderBy(desc(positions.createdAt));

    return rows.map((row) => toPositionResponse(row));
  }

  /**
   * Combines a buy with an existing position: records it as a lot and lets the recompute derive
   * quantity and average price with exact decimal arithmetic (`lot-aggregate.ts`).
   * 400 if the currency differs (EUR is not averaged with USD).
   */
  async combine(userId: string, id: string, dto: CombinePositionDto): Promise<PositionResponse> {
    const current = await this.findOwned(userId, id);

    if (dto.currency && dto.currency !== current.currency) {
      throw new BadRequestException('No se pueden combinar posiciones en distinta divisa');
    }

    const row = await this.db.transaction(async (tx) => {
      await this.lots.appendLotOwned(tx, {
        positionId: id,
        userId,
        kind: 'buy',
        quantity: dto.quantity.toString(),
        price: dto.avgPrice.toString(),
        // The DTO has no date: the buy is today's (other dates go through the lot endpoints).
        tradedAt: todayUtc(),
      });
      return this.reread(tx, id);
    });

    return toPositionResponse(row);
  }

  /** Manual edit; 409 if `ticker`/`broker` clash with another of the user's positions. */
  async update(userId: string, id: string, dto: UpdatePositionDto): Promise<PositionResponse> {
    const current = await this.findOwned(userId, id);

    const ticker = dto.ticker !== undefined ? this.normalizeTicker(dto.ticker) : current.ticker;
    const broker = dto.broker !== undefined ? dto.broker.trim() || '' : (current.broker ?? '');

    const tickerChanged = ticker !== current.ticker;
    const brokerChanged = broker.toLowerCase() !== (current.broker ?? '').toLowerCase();
    if (tickerChanged || brokerChanged) {
      await this.assertCanUseTickerBroker(userId, ticker, broker, id);
    }

    // The form always sends both amounts: it is only a declaration if one differs from the
    // current value (changing the name or broker must not touch the lots).
    const declaresAmounts =
      (dto.quantity !== undefined && !sameAmount(dto.quantity.toString(), current.quantity)) ||
      (dto.avgPrice !== undefined && !sameAmount(dto.avgPrice.toString(), current.avgPrice));

    const row = await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(positions)
        .set({
          ticker,
          broker: broker || null,
          name: dto.name !== undefined ? dto.name || null : current.name,
          quantity: dto.quantity !== undefined ? dto.quantity.toString() : current.quantity,
          avgPrice: dto.avgPrice !== undefined ? dto.avgPrice.toString() : current.avgPrice,
          currency: dto.currency ?? current.currency,
          assetClass: dto.assetClass ?? current.assetClass,
          updatedAt: new Date(),
        })
        .where(ownedPosition(userId, id))
        .returning();
      // Deleted between the ownership check and the write.
      if (!updated) throw positionNotFound();

      if (!declaresAmounts) return updated;

      // Editing the amounts declares the current state: the lots are realigned (see `declareState`).
      await this.lots.declareState(tx, {
        positionId: id,
        userId,
        quantity: updated.quantity,
        price: updated.avgPrice,
      });
      return this.reread(tx, id);
    });

    // New symbol: its price may not be cached.
    if (row.ticker !== current.ticker) {
      await this.prices.primeSymbol(row.ticker, row.currency);
      this.events.emit(POSITION_CREATED_EVENT, { userId } satisfies PositionCreatedEvent);
    } else if (declaresAmounts) {
      // Realigned lots change the rebuild even though the symbol does not.
      this.events.emit(LOT_CHANGED_EVENT, { userId, positionId: id } satisfies LotChangedEvent);
    }
    return toPositionResponse(row);
  }

  /** Deletes one of the user's positions: 404 if it does not exist or belongs to another user. */
  async remove(userId: string, id: string): Promise<void> {
    const deleted = await this.db.delete(positions).where(ownedPosition(userId, id)).returning({ id: positions.id });
    if (deleted.length === 0) throw positionNotFound();
  }

  /** Delegates to the helper shared with the lots service (see `position-access.ts`). */
  private findOwned(userId: string, id: string): Promise<Position> {
    return findOwnedPosition(this.db, userId, id);
  }

  /** Re-reads the position after a lot recompute. */
  private async reread(tx: DatabaseOrTransaction, id: string): Promise<Position> {
    // The position exists: it was just recomputed inside the same transaction.
    return firstItem(await tx.select().from(positions).where(eq(positions.id, id)));
  }

  /**
   * Duplicate rule for `(ticker, broker)` (trimmed broker; empty = no broker):
   * 409 `BROKER_REQUIRED` if there is no broker but the symbol already exists, and 409 `DUPLICATE`
   * (with the existing one, to offer combining) if the pair exists (case-insensitive broker).
   * `excludeId` excludes the row itself on edits.
   */
  private async assertCanUseTickerBroker(
    userId: string,
    ticker: string,
    broker: string,
    excludeId?: string,
  ): Promise<void> {
    if (broker === '') {
      if (await this.symbolExists(userId, ticker, excludeId)) {
        throw new ConflictException({
          code: 'BROKER_REQUIRED',
          message: 'Ya tienes este símbolo; indica un bróker para distinguirlo',
        });
      }
      return;
    }

    const conditions = [eq(positions.userId, userId), eq(positions.ticker, ticker), brokerEquals(broker)];
    if (excludeId) {
      conditions.push(ne(positions.id, excludeId));
    }
    const [existing] = await this.db
      .select()
      .from(positions)
      .where(and(...conditions))
      .limit(1);
    if (existing) {
      throw new ConflictException({
        code: 'DUPLICATE',
        message: 'Ya tienes este símbolo en este bróker',
        existing: toPositionResponse(existing),
      });
    }
  }

  private async symbolExists(userId: string, ticker: string, excludeId?: string): Promise<boolean> {
    const conditions = [eq(positions.userId, userId), eq(positions.ticker, ticker)];
    if (excludeId) {
      conditions.push(ne(positions.id, excludeId));
    }
    const [row] = await this.db
      .select({ id: positions.id })
      .from(positions)
      .where(and(...conditions))
      .limit(1);
    return Boolean(row);
  }

  /** Normalises the symbol: trimmed and upper-cased ("iwda" and "IWDA" are the same). */
  private normalizeTicker(ticker: string): string {
    return ticker.trim().toUpperCase();
  }
}
