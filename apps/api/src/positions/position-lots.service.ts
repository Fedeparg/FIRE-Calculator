import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, asc, eq } from 'drizzle-orm';

import { DRIZZLE, type Database } from '../db/database.module.js';
import { positionLots, positions, type PositionLot } from '../db/schema.js';
import { CreatePositionLotDto } from './dto/create-position-lot.dto.js';
import { UpdatePositionLotDto } from './dto/update-position-lot.dto.js';
import {
  aggregateLots,
  AMOUNT_SCALE,
  LotAggregateError,
  parseDecimal,
  type AggregatableLot,
  type LotAggregate,
} from './lot-aggregate.js';
import { findOwnedPosition, type DatabaseOrTransaction } from './position-access.js';
import { LOT_CHANGED_EVENT, type LotChangedEvent } from './position-events.js';

/**
 * Lote tal y como lo consume el frontend. Igual que `PositionResponse`, los `numeric` de
 * Drizzle (que llegan como `string`) se exponen como `number` porque la vista es de solo
 * lectura; los cálculos internos NUNCA pasan por aquí (ver `lot-aggregate.ts`).
 */
export type PositionLotResponse = {
  id: string;
  positionId: string;
  kind: 'buy' | 'sell';
  quantity: number;
  price: number;
  fees: number;
  tradedAt: string;
  note: string | null;
  createdAt: string;
};

/** Lote importado de un bróker tal y como lo recibe `appendImported` (importes en decimal `string`). */
export type ImportedLotInput = {
  externalId: string;
  kind: 'buy' | 'sell';
  quantity: string;
  price: string;
  fees: string;
  tradedAt: string;
};

/** Fecha de hoy en UTC (`YYYY-MM-DD`), la misma referencia que usan `instrument_prices`. */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * CRUD de lotes (compras y ventas) de una posición y —lo importante— el RECÁLCULO de
 * `positions.quantity` y `positions.avgPrice` a partir de ellos.
 *
 * COMPATIBILIDAD: `positions` sigue siendo la foto que leen la valoración, las tools MCP y la
 * UI; los lotes son la película. Cada mutación de lotes ocurre DENTRO de una transacción que
 * termina reescribiendo esos dos campos, así que ambos representan siempre lo mismo y nada
 * de lo que existe hoy se rompe aunque la interfaz de lotes esté incompleta.
 *
 * Dependencias: `DRIZZLE` y el emisor de eventos (para avisar de que un lote cambió). La comprobación de propiedad se hace con
 * `findOwnedPosition` (helper compartido) en vez de inyectar `PositionsService`, porque es
 * este servicio el que aquel inyecta (evita el ciclo y el `forwardRef`).
 */
@Injectable()
export class PositionLotsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly events: EventEmitter2,
  ) {}

  /** Avisa de que los lotes de una posición cambiaron (ver `LOT_CHANGED_EVENT`). */
  private emitLotChanged(userId: string, positionId: string, invalidateFrom?: string): void {
    this.events.emit(LOT_CHANGED_EVENT, {
      userId,
      positionId,
      invalidateFrom,
    } satisfies LotChangedEvent);
  }

  /** Lotes de una posición del usuario, en orden cronológico (el mismo de la agregación). */
  async listByPosition(userId: string, positionId: string): Promise<PositionLotResponse[]> {
    await findOwnedPosition(this.db, userId, positionId);
    const rows = await this.selectLots(this.db, positionId);
    return rows.map((row) => toResponse(row));
  }

  /**
   * TODOS los lotes del usuario, de cualquier posición, en orden cronológico. Se apoya en la
   * columna desnormalizada `userId` (sin join con `positions`). Lo consumen la exportación
   * RGPD y la tool MCP de histórico de operaciones.
   */
  async findAllByUser(userId: string): Promise<PositionLotResponse[]> {
    const rows = await this.db
      .select()
      .from(positionLots)
      .where(eq(positionLots.userId, userId))
      .orderBy(asc(positionLots.tradedAt), asc(positionLots.createdAt), asc(positionLots.id));

    return rows.map((row) => toResponse(row));
  }

  /**
   * Añade un lote a una posición del usuario y reagrega. Todo en una transacción: si la
   * secuencia resultante fuese inválida (una venta que deja la cantidad en negativo), se
   * revierte y NO queda el lote suelto descuadrando la posición.
   */
  async create(userId: string, positionId: string, dto: CreatePositionLotDto): Promise<PositionLotResponse> {
    const created = await this.db.transaction(async (tx) => {
      await findOwnedPosition(tx, userId, positionId);

      const [row] = await tx
        .insert(positionLots)
        .values({
          positionId,
          userId,
          kind: dto.kind,
          // `numeric` se guarda como string para conservar la precisión exacta.
          quantity: dto.quantity.toString(),
          price: dto.price.toString(),
          fees: (dto.fees ?? 0).toString(),
          tradedAt: dto.tradedAt,
          note: dto.note || null,
        })
        .returning();

      await this.recompute(tx, positionId);
      return toResponse(row);
    });
    this.emitLotChanged(userId, positionId);
    return created;
  }

  /** Edita un lote de una posición del usuario y reagrega (misma transacción). */
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
      // Mover un lote a una fecha posterior vacía el tramo [antigua, nueva): su `updatedAt` solo
      // alcanza a las capturas desde la fecha NUEVA, así que se avisa también de la antigua.
      if (dto.tradedAt !== undefined && dto.tradedAt !== current.tradedAt) previousDate = current.tradedAt;

      // Sin ningún cambio real no se escribe: tocar `updatedAt` en falso invalidaría las capturas
      // reales de la posición (ver `staleSnapshotDates`) por una edición cosmética.
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
        return toResponse(current);
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
        .where(eq(positionLots.id, lotId))
        .returning();

      await this.recompute(tx, positionId);
      return toResponse(row);
    });
    if (changed) this.emitLotChanged(userId, positionId, previousDate);
    return updated;
  }

  /** Borra un lote de una posición del usuario y reagrega (misma transacción). */
  async remove(userId: string, positionId: string, lotId: string): Promise<void> {
    // Un lote borrado no deja marca de tiempo: se avisa de su fecha de operación.
    const removedDate = await this.db.transaction(async (tx) => {
      await findOwnedPosition(tx, userId, positionId);
      const lot = await this.findLot(tx, positionId, lotId);
      await tx.delete(positionLots).where(eq(positionLots.id, lotId));
      await this.recompute(tx, positionId);
      return lot.tradedAt;
    });
    this.emitLotChanged(userId, positionId, removedDate);
  }

  /**
   * Añade un lote SIN comprobar propiedad (el llamante ya la comprobó) y reagrega. Es el
   * punto de entrada que usa `PositionsService` para que el alta de una posición y la
   * combinación de una compra dejen histórico, en lugar de escribir `quantity`/`avgPrice`
   * a mano (que es justo lo que perdía precisión).
   */
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
   * Añade lotes IMPORTADOS de un bróker a una posición (el llamante ya comprobó propiedad) y
   * reagrega UNA sola vez al final, en vez de una por lote: una importación son cientos.
   *
   * IDEMPOTENTE: `ON CONFLICT DO NOTHING` sobre el índice único parcial `(user_id, external_id)`
   * descarta los lotes ya importados, también si otra petición concurrente los acaba de
   * insertar. Devuelve cuántos se insertaron de verdad.
   *
   * ORDEN: los lotes llegan ya ordenados por instante de ejecución. El agregado desempata los
   * del mismo día por `createdAt`, y `defaultNow()` da el MISMO valor a toda una transacción,
   * así que se asigna uno creciente (+1 ms por lote) para que el orden de ejecución del bróker
   * (una compra y una venta del mismo día) se respete en el coste medio móvil.
   *
   * Si la secuencia resultante es inválida (`NEGATIVE_QUANTITY`), `recompute` lanza y la
   * transacción del llamante revierte los lotes insertados.
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
   * Rehace el histórico de una posición para que refleje EXACTAMENTE una cantidad y un
   * precio medio declarados a mano (edición manual desde la UI o desde MCP).
   *
   * Una edición manual de `quantity`/`avgPrice` es una DECLARACIÓN del estado actual, no una
   * operación de mercado, así que no se puede expresar como compra ni como venta (bajar el
   * precio medio no es ninguna de las dos). Criterio:
   *   - 1 lote (el caso de TODA posición recién migrada o recién creada) → se edita EN SITIO:
   *     no se pierde nada.
   *   - 0 lotes → se crea el lote inicial.
   *   - >1 lote → el histórico se colapsa en un único lote sintético, conservando la fecha
   *     del lote MÁS ANTIGUO (para no perder el inicio de la serie). Es destructivo a
   *     propósito: la alternativa —dejar lotes y posición descuadrados— rompería el siguiente
   *     recálculo. Para conservar el histórico hay que usar los endpoints de lotes.
   *   - Si hay alguna VENTA, colapsar borraría ganancias ya realizadas (el informe anual de
   *     plusvalías sale de ellas), así que se rechaza con 409 `HAS_SALES`. Salvo que los
   *     importes declarados sean los que ya tiene la posición: el formulario de edición los
   *     envía siempre, y cambiar solo el nombre o el bróker no debe fallar.
   */
  async declareState(
    tx: DatabaseOrTransaction,
    input: { positionId: string; userId: string; quantity: string; price: string },
  ): Promise<void> {
    const existing = await this.selectLots(tx, input.positionId);

    if (existing.some((lot) => lot.kind === 'sell')) {
      const current = this.aggregate(existing);
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
      // Declarar lo que ya hay no es un cambio: no se toca el lote (ver `staleSnapshotDates`).
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

  /**
   * Reagrega los lotes de una posición y escribe el resultado en `positions`. Es el ÚNICO
   * sitio que sincroniza foto y película; llamarlo siempre dentro de la transacción de la
   * mutación que lo motiva.
   */
  async recompute(tx: DatabaseOrTransaction, positionId: string): Promise<LotAggregate> {
    const lots = await this.selectLots(tx, positionId);
    const aggregate = this.aggregate(lots);

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

  /** Agrega traduciendo los errores de la lógica pura a 400 con mensaje para el usuario. */
  private aggregate(lots: readonly AggregatableLot[]): LotAggregate {
    try {
      return aggregateLots(lots);
    } catch (error) {
      if (error instanceof LotAggregateError) {
        throw new BadRequestException({ code: error.code, message: error.message });
      }
      throw error;
    }
  }

  /** Lotes de una posición en el orden canónico `(tradedAt, createdAt, id)`. */
  private selectLots(tx: DatabaseOrTransaction, positionId: string): Promise<PositionLot[]> {
    return tx
      .select()
      .from(positionLots)
      .where(eq(positionLots.positionId, positionId))
      .orderBy(asc(positionLots.tradedAt), asc(positionLots.createdAt), asc(positionLots.id));
  }

  /**
   * Localiza un lote DENTRO de la posición indicada. Filtrar por `positionId` (ya validada
   * como propia) impide que un id de lote de otro usuario se cuele por la ruta: sería 404.
   */
  private async findLot(tx: DatabaseOrTransaction, positionId: string, lotId: string): Promise<PositionLot> {
    const [row] = await tx
      .select()
      .from(positionLots)
      .where(and(eq(positionLots.id, lotId), eq(positionLots.positionId, positionId)));
    if (!row) {
      throw new NotFoundException('Lote no encontrado');
    }
    return row;
  }
}

/**
 * ¿Dos importes son el mismo a la escala de la columna? Se compara en coma fija, nunca con
 * `Number()`. Un valor que no se deja leer como decimal plano (p. ej. notación exponencial de
 * un número diminuto) cuenta como distinto: ante la duda, se trata como un cambio real.
 */
export function sameAmount(a: string, b: string): boolean {
  try {
    return parseDecimal(a, AMOUNT_SCALE) === parseDecimal(b, AMOUNT_SCALE);
  } catch (error) {
    if (error instanceof LotAggregateError) return false;
    throw error;
  }
}

function toResponse(row: PositionLot): PositionLotResponse {
  return {
    id: row.id,
    positionId: row.positionId,
    kind: row.kind,
    quantity: Number(row.quantity),
    price: Number(row.price),
    fees: Number(row.fees),
    tradedAt: row.tradedAt,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}
