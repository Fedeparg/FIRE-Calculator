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
import { ISO_DATE_PATTERN, POSITION_LOT_KINDS } from './create-position-lot.dto.js';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Cuerpo de PATCH /api/positions/:positionId/lots/:lotId. Todos los campos son opcionales
 * (se actualiza solo lo enviado) y se validan igual que en el alta. Tras aplicarlo, el
 * servicio REAGREGA los lotes: si el cambio dejase la posición en negativo, se rechaza y no
 * se guarda nada.
 */
export class UpdatePositionLotDto {
  @IsOptional()
  @IsIn(POSITION_LOT_KINDS)
  kind?: PositionLotKind;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @IsPositive()
  @Max(NUMERIC_MAX)
  quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(NUMERIC_MAX)
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(NUMERIC_MAX)
  fees?: number;

  @IsOptional()
  @IsString()
  @Matches(ISO_DATE_PATTERN, { message: 'tradedAt debe tener el formato YYYY-MM-DD' })
  @IsDateString({ strict: true }, { message: 'tradedAt debe ser una fecha real' })
  tradedAt?: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(200)
  note?: string;
}
