import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, ne, sql } from 'drizzle-orm';

import { DRIZZLE, type Database } from '../db/database.module';
import { positions, type Position } from '../db/schema';
import { CombinePositionDto } from './dto/combine-position.dto';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';

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
  broker: string;
  currency: string;
  createdAt: string;
};

@Injectable()
export class PositionsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Crea una posición para el usuario autenticado. Si ya existe una con el mismo
   * `(ticker, broker)` (comparación case-insensitive), NO se crea: lanza 409 con la
   * posición existente, para que el frontend ofrezca combinar (media ponderada).
   */
  async create(userId: string, dto: CreatePositionDto): Promise<PositionResponse> {
    const ticker = this.normalizeTicker(dto.ticker);
    const broker = dto.broker.trim();

    const existing = await this.findCollision(userId, ticker, broker);
    if (existing) {
      throw new ConflictException({
        message: 'Ya tienes este símbolo en este bróker',
        existing: this.toResponse(existing),
      });
    }

    const [row] = await this.db
      .insert(positions)
      .values({
        userId,
        ticker,
        name: dto.name ?? null,
        // `numeric` se almacena como string para conservar la precisión exacta.
        quantity: dto.quantity.toString(),
        avgPrice: dto.avgPrice.toString(),
        broker,
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
   * Combina una nueva compra con una posición existente mediante MEDIA PONDERADA:
   *   cantidad' = q_old + q_new
   *   precio'   = (q_old·p_old + q_new·p_new) / (q_old + q_new)
   *
   * La divisa de la compra debe coincidir con la de la posición (no tiene sentido
   * promediar un precio en EUR con otro en USD) → 400 si difieren.
   */
  async combine(
    userId: string,
    id: string,
    dto: CombinePositionDto,
  ): Promise<PositionResponse> {
    const current = await this.findOwned(userId, id);

    if (dto.currency && dto.currency !== current.currency) {
      throw new BadRequestException(
        'No se pueden combinar posiciones en distinta divisa',
      );
    }

    const qOld = Number(current.quantity);
    const pOld = Number(current.avgPrice);
    const qNew = dto.quantity;
    const pNew = dto.avgPrice;

    const newQuantity = qOld + qNew;
    const newAvgPrice = newQuantity > 0 ? (qOld * pOld + qNew * pNew) / newQuantity : 0;

    const [row] = await this.db
      .update(positions)
      .set({
        quantity: newQuantity.toString(),
        avgPrice: newAvgPrice.toString(),
        updatedAt: new Date(),
      })
      .where(eq(positions.id, id))
      .returning();

    return this.toResponse(row);
  }

  /**
   * Actualiza una posición del usuario (edición manual). Si el cambio de `ticker`/`broker`
   * chocaría con OTRA posición del usuario (excluyendo la propia), lanza 409.
   */
  async update(
    userId: string,
    id: string,
    dto: UpdatePositionDto,
  ): Promise<PositionResponse> {
    const current = await this.findOwned(userId, id);

    const ticker = dto.ticker !== undefined ? this.normalizeTicker(dto.ticker) : current.ticker;
    const broker = dto.broker !== undefined ? dto.broker.trim() : current.broker;

    if (ticker !== current.ticker || broker.toLowerCase() !== current.broker.toLowerCase()) {
      const collision = await this.findCollision(userId, ticker, broker, id);
      if (collision) {
        throw new ConflictException({
          message: 'Ya tienes este símbolo en este bróker',
          existing: this.toResponse(collision),
        });
      }
    }

    const [row] = await this.db
      .update(positions)
      .set({
        ticker,
        broker,
        name: dto.name !== undefined ? dto.name || null : current.name,
        quantity: dto.quantity !== undefined ? dto.quantity.toString() : current.quantity,
        avgPrice: dto.avgPrice !== undefined ? dto.avgPrice.toString() : current.avgPrice,
        currency: dto.currency ?? current.currency,
        updatedAt: new Date(),
      })
      .where(eq(positions.id, id))
      .returning();

    return this.toResponse(row);
  }

  /**
   * Borra una posición del usuario autenticado.
   *
   * Aislamiento entre usuarios (verificado): si no existe → 404; si pertenece a OTRO
   * usuario → 403. Así un usuario A nunca puede borrar una posición del usuario B.
   */
  async remove(userId: string, id: string): Promise<void> {
    await this.findOwned(userId, id);
    await this.db.delete(positions).where(eq(positions.id, id));
  }

  /**
   * Localiza una posición por id verificando propiedad: 404 si no existe, 403 si es de
   * otro usuario. Centraliza el scoping por usuario para todos los endpoints por id.
   */
  private async findOwned(userId: string, id: string): Promise<Position> {
    const [row] = await this.db.select().from(positions).where(eq(positions.id, id));
    if (!row) {
      throw new NotFoundException('Posición no encontrada');
    }
    if (row.userId !== userId) {
      throw new ForbiddenException('No puedes acceder a una posición que no es tuya');
    }
    return row;
  }

  /**
   * Busca una posición del usuario con el mismo `(ticker, broker)` (case-insensitive en
   * el bróker; el ticker llega ya normalizado a mayúsculas). `excludeId` evita que una
   * edición choque consigo misma.
   */
  private async findCollision(
    userId: string,
    ticker: string,
    broker: string,
    excludeId?: string,
  ): Promise<Position | undefined> {
    const conditions = [
      eq(positions.userId, userId),
      eq(positions.ticker, ticker),
      sql`lower(${positions.broker}) = lower(${broker})`,
    ];
    if (excludeId) {
      conditions.push(ne(positions.id, excludeId));
    }
    const [row] = await this.db
      .select()
      .from(positions)
      .where(and(...conditions))
      .limit(1);
    return row;
  }

  /** Normaliza el símbolo: sin espacios y en mayúsculas ("iwda" y "IWDA" son el mismo). */
  private normalizeTicker(ticker: string): string {
    return ticker.trim().toUpperCase();
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
