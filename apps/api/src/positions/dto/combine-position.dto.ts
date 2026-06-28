import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsPositive, Max, Min } from 'class-validator';

import { NUMERIC_MAX, SUPPORTED_CURRENCIES, type SupportedCurrency } from './create-position.dto';

/**
 * Cuerpo de POST /api/positions/:id/combine. La cantidad y el precio de la NUEVA compra
 * que se fusiona (media ponderada) con la posición existente. La divisa debe coincidir
 * con la de la posición existente; si no, el servicio lo rechaza (no se puede promediar
 * un precio en EUR con otro en USD).
 */
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
