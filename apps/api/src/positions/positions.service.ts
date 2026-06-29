import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { and, desc, eq, ne, sql } from 'drizzle-orm';

import { DRIZZLE, type Database } from '../db/database.module';
import { positions, type Position } from '../db/schema';
import { PricesService } from '../prices/prices.service';
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
  broker: string | null;
  currency: string;
  createdAt: string;
};

@Injectable()
export class PositionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly prices: PricesService,
  ) {}

  /**
   * Crea una posición para el usuario autenticado. Aplica la regla de duplicados antes de
   * insertar (ver `assertCanUseTickerBroker`): el bróker solo es obligatorio si ya existe
   * otra entrada del mismo símbolo; un `(ticker, broker)` exacto ya existente lanza 409 con
   * la posición existente para ofrecer combinar.
   */
  async create(userId: string, dto: CreatePositionDto): Promise<PositionResponse> {
    const ticker = this.normalizeTicker(dto.ticker);
    const broker = dto.broker?.trim() ?? '';

    await this.assertCanUseTickerBroker(userId, ticker, broker);

    try {
      const [row] = await this.db
        .insert(positions)
        .values({
          userId,
          ticker,
          name: dto.name ?? null,
          // `numeric` se almacena como string para conservar la precisión exacta.
          quantity: dto.quantity.toString(),
          avgPrice: dto.avgPrice.toString(),
          // El bróker vacío se guarda como NULL (sin especificar).
          broker: broker || null,
          currency: dto.currency ?? 'EUR',
        })
        .returning();

      // Refresca el precio en caliente para que la valoración aparezca al instante (sin
      // esperar al cron diario). Es tolerante a fallos: nunca rompe el alta.
      await this.prices.primeSymbol(row.ticker, row.currency);
      return this.toResponse(row);
    } catch (error) {
      // La única FK de `positions` es `userId → users.id`. Una violación aquí solo puede
      // significar que el JWT es válido (firma correcta) pero el usuario ya no existe
      // (p. ej. cuenta borrada, o BD reiniciada en dev): sesión muerta → 401, no 500.
      if (isForeignKeyViolation(error)) {
        throw new UnauthorizedException('La sesión ya no es válida; vuelve a iniciar sesión');
      }
      throw error;
    }
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
    const broker =
      dto.broker !== undefined ? (dto.broker.trim() || '') : (current.broker ?? '');

    const tickerChanged = ticker !== current.ticker;
    const brokerChanged = broker.toLowerCase() !== (current.broker ?? '').toLowerCase();
    if (tickerChanged || brokerChanged) {
      // Excluye la propia fila para que editar no choque consigo misma.
      await this.assertCanUseTickerBroker(userId, ticker, broker, id);
    }

    const [row] = await this.db
      .update(positions)
      .set({
        ticker,
        broker: broker || null,
        name: dto.name !== undefined ? dto.name || null : current.name,
        quantity: dto.quantity !== undefined ? dto.quantity.toString() : current.quantity,
        avgPrice: dto.avgPrice !== undefined ? dto.avgPrice.toString() : current.avgPrice,
        currency: dto.currency ?? current.currency,
        updatedAt: new Date(),
      })
      .where(eq(positions.id, id))
      .returning();

    // Si cambió el símbolo, su precio puede no estar cacheado: refréscalo en caliente.
    if (row.ticker !== current.ticker) {
      await this.prices.primeSymbol(row.ticker, row.currency);
    }
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
   * Aplica la regla de duplicados para un `(ticker, broker)` (con `broker` ya recortado;
   * cadena vacía = sin bróker). Lanza:
   *   - 409 `BROKER_REQUIRED` si el bróker está vacío PERO ya existe otra entrada del
   *     mismo símbolo (hay que especificar bróker para distinguirla).
   *   - 409 `DUPLICATE` (con la posición existente) si el `(ticker, broker)` exacto ya
   *     existe (case-insensitive en el bróker), para ofrecer combinar.
   * `excludeId` excluye la propia fila (ediciones).
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

    const conditions = [
      eq(positions.userId, userId),
      eq(positions.ticker, ticker),
      sql`lower(${positions.broker}) = lower(${broker})`,
    ];
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
        existing: this.toResponse(existing),
      });
    }
  }

  /** ¿El usuario ya tiene alguna posición de este símbolo (cualquier bróker)? */
  private async symbolExists(
    userId: string,
    ticker: string,
    excludeId?: string,
  ): Promise<boolean> {
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

/** Código SQLSTATE de PostgreSQL para violación de clave foránea. */
const PG_FOREIGN_KEY_VIOLATION = '23503';

/**
 * Detecta una violación de FK de Postgres. Drizzle envuelve el error del driver en un
 * `DrizzleQueryError` y deja el `PostgresError` real (con el `code` SQLSTATE) en `cause`,
 * así que recorremos la cadena de `cause` hasta encontrarlo.
 */
function isForeignKeyViolation(error: unknown): boolean {
  let current: unknown = error;
  while (typeof current === 'object' && current !== null) {
    if ((current as { code?: unknown }).code === PG_FOREIGN_KEY_VIOLATION) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
