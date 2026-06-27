import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';

import { DRIZZLE, type Database } from '../db/database.module';
import { positions, type Position } from '../db/schema';
import { CreatePositionDto } from './dto/create-position.dto';

/**
 * Posición tal y como la consume el frontend. Drizzle devuelve `numeric` como `string`
 * (para no perder precisión); aquí lo exponemos como `number` porque la vista es solo
 * de lectura/visualización. Las fechas viajan como ISO string.
 */
export type PositionResponse = {
  id: string;
  ticker: string;
  name: string | null;
  quantity: number;
  avgPrice: number;
  broker: string | null;
  currency: string;
  createdAt: string;
};

@Injectable()
export class PositionsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Crea una posición para el usuario autenticado. El `userId` viene del JWT. */
  async create(userId: string, dto: CreatePositionDto): Promise<PositionResponse> {
    const [row] = await this.db
      .insert(positions)
      .values({
        userId,
        ticker: dto.ticker,
        name: dto.name ?? null,
        // `numeric` se almacena como string para conservar la precisión exacta.
        quantity: dto.quantity.toString(),
        avgPrice: dto.avgPrice.toString(),
        broker: dto.broker ?? null,
        currency: dto.currency ?? 'EUR',
      })
      .returning();

    return this.toResponse(row);
  }

  /** Devuelve SOLO las posiciones del usuario autenticado, más recientes primero. */
  async findAllByUser(userId: string): Promise<PositionResponse[]> {
    const rows = await this.db
      .select()
      .from(positions)
      .where(eq(positions.userId, userId))
      .orderBy(desc(positions.createdAt));

    return rows.map((row) => this.toResponse(row));
  }

  /**
   * Borra una posición del usuario autenticado.
   *
   * Aislamiento entre usuarios (verificado): primero localizamos la posición por su id;
   * si no existe → 404; si existe pero pertenece a OTRO usuario → 403 (no la borramos ni
   * filtramos su contenido). Así un usuario A nunca puede borrar una posición del usuario B.
   */
  async remove(userId: string, id: string): Promise<void> {
    const [row] = await this.db.select().from(positions).where(eq(positions.id, id));

    if (!row) {
      throw new NotFoundException('Posición no encontrada');
    }
    if (row.userId !== userId) {
      throw new ForbiddenException('No puedes borrar una posición que no es tuya');
    }

    await this.db.delete(positions).where(eq(positions.id, id));
  }

  private toResponse(row: Position): PositionResponse {
    return {
      id: row.id,
      ticker: row.ticker,
      name: row.name,
      quantity: Number(row.quantity),
      avgPrice: Number(row.avgPrice),
      broker: row.broker,
      currency: row.currency,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
