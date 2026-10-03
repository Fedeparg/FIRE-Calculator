import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, asc, eq, type SQL } from 'drizzle-orm';

import { DRIZZLE, type Database } from '../db/database.module.js';
import { positionLots, positions, type PositionLot } from '../db/schema.js';
import type { CreatePositionLotDto } from './dto/create-position-lot.dto.js';
import type { UpdatePositionLotDto } from './dto/update-position-lot.dto.js';
import { aggregateLots, AMOUNT_SCALE, LotAggregateError, parseDecimal, type LotAggregate } from './lot-aggregate.js';
import { findOwnedPosition, type DatabaseOrTransaction } from './position-access.js';
import { toPositionLotResponse, type PositionLotResponse } from './position.mapper.js';
import { LOT_CHANGED_EVENT, type LotChangedEvent } from './position-events.js';
import { todayUtc } from '../common/dates.js';

/** Lote importado de un bróker (importes en decimal `string`). */
export type ImportedLotInput = {
  externalId: string;
  kind: 'buy' | 'sell';
  quantity: string;
  price: string;
  fees: string;
  tradedAt: string;
};

/**
 * CRUD de lotes y recálculo de `positions.quantity/avgPrice` a partir de ellos. Cada mutación
 * ocurre dentro de una transacción que termina reescribiendo esos campos, así que foto
 * (`positions`) y lotes dicen siempre lo mismo. La propiedad se comprueba con
 * `findOwnedPosition` y no con `PositionsService`, que inyecta a este servicio (evita ciclo).
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

  /** Lotes de una posición del usuario, en orden cronológico. */
  async listByPosition(userId: string, positionId: string): Promise<PositionLotResponse[]> {
    await findOwnedPosition(this.db, userId, positionId);
    const rows = await this.selectLots(this.db, positionId);
    return rows.map((row) => toPositionLotResponse(row));
  }

  /** Todos los lotes del usuario (por `userId` desnormalizado, sin join); los usan la exportación RGPD y la tool MCP de operaciones. */
  async findAllByUser(userId: string): Promise<PositionLotResponse[]> {
    const rows = await this.db
      .select()
      .from(positionLots)
      .where(eq(positionLots.userId, userId))
      .orderBy(asc(positionLots.tradedAt), asc(positionLots.createdAt), asc(positionLots.id));

    return rows.map((row) => toPositionLotResponse(row));
  }

  /** Añade un lote y reagrega en una transacción: una secuencia inválida (venta en negativo) lo revierte. */
  async create(userId: string, positionId: string, dto: CreatePositionLotDto): Promise<PositionLotResponse> {
    const created = await this.db.transaction(async (tx) => {
      await findOwnedPosition(tx, userId, positionId);

      const [row] = await tx
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
        .returning();

      await this.recompute(tx, positionId);
      return toPositionLotResponse(row);
    });
    this.emitLotChanged(userId, positionId);
    return created;
  }

  /** Edita un lote y reagrega (misma transacción). */
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
      // Mover un lote a una fecha posterior vacía el tramo [antigua, nueva) y su `updatedAt` solo
      // alcanza desde la nueva: se avisa también de la antigua.
      if (dto.tradedAt !== undefined && dto.tradedAt !== current.tradedAt) previousDate = current.tradedAt;

      // Sin cambio real no se escribe: tocar `updatedAt` invalidaría las capturas reales (ver
      // `staleSnapshotDates`) por una edición cosmética.
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

  /** Borra un lote y reagrega (misma transacción). */
  async remove(userId: string, positionId: string, lotId: string): Promise<void> {
    // Un lote borrado no deja marca de tiempo: se avisa de su fecha de operación.
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

  /** Añade un lote sin comprobar propiedad (el llamante ya lo hizo) y reagrega; lo usa `PositionsService` en alta y combinación. */
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
   * Añade lotes importados (el llamante ya comprobó propiedad) y reagrega una sola vez, no por
   * lote. Idempotente: `ON CONFLICT DO NOTHING` sobre `(user_id, external_id)` descarta los ya
   * importados, también ante una petición concurrente; devuelve cuántos entraron.
   *
   * Los lotes llegan ordenados por ejecución, pero el agregado desempata el mismo día por
   * `createdAt` y `defaultNow()` da el mismo valor a toda la transacción: se asigna uno
   * creciente (+1 ms) para respetar el orden del bróker en el coste medio móvil.
   * Una secuencia inválida (`NEGATIVE_QUANTITY`) hace lanzar a `recompute` y revierte el llamante.
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
   * Rehace los lotes para que reflejen una cantidad y un precio medio declarados a mano (UI o
   * MCP). Es una declaración del estado actual, no una operación de mercado (bajar el precio
   * medio no es compra ni venta):
   *   - 1 lote: se edita en sitio. 0 lotes: se crea el inicial.
   *   - más de 1: se colapsan en un lote sintético con la fecha del más antiguo. Es destructivo
   *     a propósito (lotes y posición descuadrados romperían el siguiente recálculo); para
   *     conservar el histórico están los endpoints de lotes.
   *   - con alguna venta se rechaza con 409 `HAS_SALES`: colapsar borraría ganancias realizadas
   *     (base del informe de plusvalías). Salvo que los importes sean los actuales: el formulario
   *     los envía siempre y cambiar solo nombre o bróker no debe fallar.
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
      const [only] = existing;
      // Declarar lo que ya hay no toca el lote (ver `staleSnapshotDates`).
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

  /** Reagrega los lotes y escribe el resultado en `positions`: único sitio que lo sincroniza; llamar dentro de la transacción de la mutación. */
  async recompute(tx: DatabaseOrTransaction, positionId: string): Promise<LotAggregate> {
    // Bloquea la fila de la posición antes de releer los lotes: sin esto, dos mutaciones
    // simultáneas (web + MCP, importación + edición) leen cada una los lotes sin el INSERT de la
    // otra y la última `UPDATE` gana (lost update). Con el bloqueo, la segunda espera y, en READ
    // COMMITTED, su `SELECT` siguiente ya ve lo que confirmó la primera. `NO KEY UPDATE` y no
    // `UPDATE`: el INSERT del lote ya tiene un `KEY SHARE` sobre la posición (por la FK), que
    // `FOR UPDATE` no admite (interbloqueo entre las dos); `NO KEY UPDATE` sí.
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

  /** Lotes de una posición en el orden canónico `(tradedAt, createdAt, id)`. */
  private selectLots(tx: DatabaseOrTransaction, positionId: string): Promise<PositionLot[]> {
    return tx
      .select()
      .from(positionLots)
      .where(eq(positionLots.positionId, positionId))
      .orderBy(asc(positionLots.tradedAt), asc(positionLots.createdAt), asc(positionLots.id));
  }

  /** Filtrar por `positionId` (ya validada como propia) hace que el id de un lote ajeno dé 404. */
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
   * Condición "el lote `lotId`, de la posición `positionId`, es de `userId`". Las escrituras la
   * usan además de `findOwnedPosition`/`findLot`: defensa en profundidad (ver `ownedPosition`).
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

/** ¿Mismo importe a la escala de la columna? Compara en coma fija; un valor ilegible (p. ej. exponencial) cuenta como distinto. */
export function sameAmount(a: string, b: string): boolean {
  try {
    return parseDecimal(a, AMOUNT_SCALE) === parseDecimal(b, AMOUNT_SCALE);
  } catch (error) {
    if (error instanceof LotAggregateError) return false;
    throw error;
  }
}
