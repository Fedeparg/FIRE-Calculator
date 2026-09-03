import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

import {
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from '../../positions/dto/create-position.dto.js';
import { HISTORY_MAX_DAYS } from '../portfolio-snapshots.service.js';

/**
 * Query de GET /api/portfolio/history. Es una CLASE, no `@Query('days')` suelto, para que el
 * `ValidationPipe` global (con `whitelist` + `forbidNonWhitelisted`) se aplique también aquí:
 * un `days` no numérico o un parámetro desconocido dan 400 en vez de colarse hasta el
 * servicio. `@Type(() => Number)` es obligatorio porque los query params llegan como texto.
 */
export class PortfolioHistoryQueryDto {
  /** Ventana en días hacia atrás. Por defecto la del servicio (1 año). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(HISTORY_MAX_DAYS)
  days?: number;

  /** Divisa en la que reexpresar la serie (los datos se guardan en EUR). */
  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
  display?: SupportedCurrency;
}
