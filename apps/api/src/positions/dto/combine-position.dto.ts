import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsPositive, Max, Min } from 'class-validator';

import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '@sextante/core/contracts';
import { NUMERIC_MAX } from './create-position.dto.js';

/** Cuerpo de POST /api/positions/:id/combine: la nueva compra a fusionar; la divisa debe coincidir con la de la posición (lo rechaza el servicio). */
export class CombinePositionDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @IsPositive()
  @Max(NUMERIC_MAX)
  quantity!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(NUMERIC_MAX)
  avgPrice!: number;

  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
  currency?: SupportedCurrency;
}
