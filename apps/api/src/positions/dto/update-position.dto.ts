import { Transform, Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Max, MaxLength, Min } from 'class-validator';

import { NUMERIC_MAX, SUPPORTED_CURRENCIES, type SupportedCurrency } from './create-position.dto.js';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

/**
 * Cuerpo de PATCH /api/positions/:id. Todos los campos son opcionales (se actualiza solo
 * lo enviado), pero si un campo viene, se valida igual que en el alta: `ticker` y `broker`
 * no pueden quedar vacíos. El `userId` NO va aquí: se lee del JWT.
 */
export class UpdatePositionDto {
  @IsOptional()
  @IsString()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(20)
  ticker?: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(100)
  name?: string;

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
  avgPrice?: number;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(100)
  broker?: string;

  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
  currency?: SupportedCurrency;
}
