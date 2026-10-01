import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import type { PositionLotKind } from '../../db/schema.js';
import { NUMERIC_MAX } from './create-position.dto.js';

/** Tipos de operación admitidos en un lote. */
export const POSITION_LOT_KINDS = ['buy', 'sell'] as const satisfies readonly PositionLotKind[];

/** Fecha en formato `YYYY-MM-DD` (la columna `traded_at` es un `date`, sin hora). */
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

/**
 * Cuerpo de POST /api/positions/:positionId/lots — una compra o venta concreta.
 *
 * `positionId` y `userId` NO van aquí: el primero viene de la ruta y el segundo del JWT.
 *
 * La validación de fecha es doble a propósito: `@Matches` exige EXACTAMENTE `YYYY-MM-DD`
 * (`@IsDateString` por sí solo aceptaría un datetime completo) y `@IsDateString` con
 * `strict` comprueba que la fecha EXISTE (rechaza "2026-02-30", que el regex dejaría pasar).
 */
export class CreatePositionLotDto {
  @IsIn(POSITION_LOT_KINDS)
  kind!: PositionLotKind;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @IsPositive()
  @Max(NUMERIC_MAX)
  quantity!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(NUMERIC_MAX)
  price!: number;

  /** Comisiones de la operación. No entran en el precio medio; se guardan para fiscalidad. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(NUMERIC_MAX)
  fees?: number;

  @IsString()
  @Matches(ISO_DATE_PATTERN, { message: 'tradedAt debe tener el formato YYYY-MM-DD' })
  @IsDateString({ strict: true }, { message: 'tradedAt debe ser una fecha real' })
  tradedAt!: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(200)
  note?: string;
}
