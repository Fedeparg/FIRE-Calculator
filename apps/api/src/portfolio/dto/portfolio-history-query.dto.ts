import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '@sextante/core/contracts';
import { HISTORY_MAX_DAYS } from '../portfolio-snapshots.service.js';

/**
 * Query de GET /api/portfolio/history. Clase (no `@Query` suelto) para que el `ValidationPipe`
 * global rechace con 400 un `days` no numérico o parámetros desconocidos; `@Type(() => Number)`
 * es necesario porque los query params llegan como texto.
 */
export class PortfolioHistoryQueryDto {
  /** Ventana en días hacia atrás; por defecto la del servicio. */
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
