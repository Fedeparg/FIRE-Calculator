import { BadRequestException, ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, desc, eq, ne } from 'drizzle-orm';

import { DRIZZLE, type Database } from '../db/database.module.js';
import { positions, type Position } from '../db/schema.js';
import { PriceHistoryService } from '../prices/price-history.service.js';
import type { CombinePositionDto } from './dto/combine-position.dto.js';
import type { CreatePositionDto } from './dto/create-position.dto.js';
import type { UpdatePositionDto } from './dto/update-position.dto.js';
import { brokerEquals, findOwnedPosition, type DatabaseOrTransaction } from './position-access.js';
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

  /** Crea una posición aplicando antes la regla de duplicados (`assertCanUseTickerBroker`). */
  async create(userId: string, dto: CreatePositionDto): Promise<PositionResponse> {
    const ticker = this.normalizeTicker(dto.ticker);
    const broker = dto.broker?.trim() ?? '';

    await this.assertCanUseTickerBroker(userId, ticker, broker);

    try {
      // Alta y lote inicial en la misma transacción: sin lotes, el primer recálculo la pondría a cero.
      const row = await this.db.transaction(async (tx) => {
        const [inserted] = await tx
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
          .returning();

        await this.lots.appendLotOwned(tx, {
          positionId: inserted.id,
          userId,
          kind: 'buy',
          quantity: inserted.quantity,
          price: inserted.avgPrice,
          // Como el backfill: la fecha de alta (UTC) es lo más cercano a la compra real que se conoce.
          tradedAt: isoDate(inserted.createdAt),
        });
        return inserted;
      });

      // Precio en caliente, fuera de la transacción (es red); tolerante a fallos.
      await this.prices.primeSymbol(row.ticker, row.currency);
      // Evento sin esperar: no debe alargar la respuesta del alta (ver `position-events.ts`).
      this.events.emit(POSITION_CREATED_EVENT, { userId } satisfies PositionCreatedEvent);
      return toPositionResponse(row);
    } catch (error) {
      // La única FK es `userId → users.id`: JWT válido pero usuario inexistente (cuenta
      // borrada, BD reiniciada en dev) es sesión muerta → 401, no 500.
      if (isPgError(error, PG_FOREIGN_KEY_VIOLATION)) {
        throw new UnauthorizedException('La sesión ya no es válida; vuelve a iniciar sesión');
      }
      // Alta concurrente del mismo (símbolo, bróker): la comprobación previa no vio la otra fila
      // (aún sin confirmar) y el índice único la ha parado. Se responde como si la hubiera visto:
      // 409 DUPLICATE con la existente (o BROKER_REQUIRED), para ofrecer combinar.
      if (isPgError(error, PG_UNIQUE_VIOLATION)) {
        await this.assertCanUseTickerBroker(userId, ticker, broker);
      }
      throw error;
    }
  }

  /** Solo las posiciones del usuario, más recientes primero. */
  async findAllByUser(userId: string): Promise<PositionResponse[]> {
    const rows = await this.db
      .select()
      .from(positions)
      .where(eq(positions.userId, userId))
      .orderBy(desc(positions.createdAt));

    return rows.map((row) => toPositionResponse(row));
  }

  /**
   * Combina una compra con una posición existente: la registra como lote y deja que el
   * recálculo derive cantidad y precio medio con aritmética decimal exacta (`lot-aggregate.ts`).
   * 400 si la divisa difiere (no se promedia EUR con USD).
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
        // El DTO no lleva fecha: la compra es de hoy (otra fecha, por los endpoints de lotes).
        tradedAt: todayUtc(),
      });
      return this.reread(tx, id);
    });

    return toPositionResponse(row);
  }

  /** Edición manual; 409 si `ticker`/`broker` chocan con otra posición del usuario. */
  async update(userId: string, id: string, dto: UpdatePositionDto): Promise<PositionResponse> {
    const current = await this.findOwned(userId, id);

    const ticker = dto.ticker !== undefined ? this.normalizeTicker(dto.ticker) : current.ticker;
    const broker = dto.broker !== undefined ? dto.broker.trim() || '' : (current.broker ?? '');

    const tickerChanged = ticker !== current.ticker;
    const brokerChanged = broker.toLowerCase() !== (current.broker ?? '').toLowerCase();
    if (tickerChanged || brokerChanged) {
      await this.assertCanUseTickerBroker(userId, ticker, broker, id);
    }

    // El formulario envía siempre ambos importes: solo es una declaración si alguno difiere del
    // actual (cambiar nombre o bróker no debe tocar los lotes).
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
        .where(eq(positions.id, id))
        .returning();

      if (!declaresAmounts) return updated;

      // Editar los importes declara el estado actual: los lotes se realinean (ver `declareState`).
      await this.lots.declareState(tx, {
        positionId: id,
        userId,
        quantity: updated.quantity,
        price: updated.avgPrice,
      });
      return this.reread(tx, id);
    });

    // Símbolo nuevo: su precio puede no estar cacheado.
    if (row.ticker !== current.ticker) {
      await this.prices.primeSymbol(row.ticker, row.currency);
      this.events.emit(POSITION_CREATED_EVENT, { userId } satisfies PositionCreatedEvent);
    } else if (declaresAmounts) {
      // Los lotes realineados cambian la reconstrucción aunque el símbolo no.
      this.events.emit(LOT_CHANGED_EVENT, { userId, positionId: id } satisfies LotChangedEvent);
    }
    return toPositionResponse(row);
  }

  /** Borra una posición propia: 404 si no existe o es de otro usuario. */
  async remove(userId: string, id: string): Promise<void> {
    await this.findOwned(userId, id);
    await this.db.delete(positions).where(eq(positions.id, id));
  }

  /** Delega en el helper compartido con el servicio de lotes (ver `position-access.ts`). */
  private findOwned(userId: string, id: string): Promise<Position> {
    return findOwnedPosition(this.db, userId, id);
  }

  /** Relee la posición tras un recálculo de lotes. */
  private async reread(tx: DatabaseOrTransaction, id: string): Promise<Position> {
    const [row] = await tx.select().from(positions).where(eq(positions.id, id));
    return row;
  }

  /**
   * Regla de duplicados para `(ticker, broker)` (bróker recortado; vacío = sin bróker):
   * 409 `BROKER_REQUIRED` si no hay bróker pero ya existe el símbolo, y 409 `DUPLICATE` (con la
   * existente, para ofrecer combinar) si el par existe (bróker case-insensitive).
   * `excludeId` excluye la propia fila en ediciones.
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

  /** Normaliza el símbolo: sin espacios y en mayúsculas ("iwda" y "IWDA" son el mismo). */
  private normalizeTicker(ticker: string): string {
    return ticker.trim().toUpperCase();
  }
}
