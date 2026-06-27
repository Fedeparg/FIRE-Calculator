import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Divisas admitidas para una posición (alineadas con el selector del frontend). */
export const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/**
 * Tope superior de `quantity` y `avgPrice`. `numeric(18,6)` admite 12 dígitos enteros;
 * lo acotamos por debajo de ese límite para que un valor absurdo dé 400 (validación)
 * en lugar de un error de base de datos.
 */
// `numeric(18,6)` admite 12 dígitos enteros → máximo 999_999_999_999,999999. `@Max` es
// inclusivo, así que el tope es el mayor entero de 12 dígitos: pasar de aquí da 400
// (validación) en lugar de un overflow en la BD (500).
const NUMERIC_MAX = 999_999_999_999;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Cuerpo de POST /api/positions. El `userId` NO va aquí: se lee del JWT. */
export class CreatePositionDto {
  @IsString()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(20)
  ticker!: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(100)
  name?: string;

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
  @IsString()
  @Transform(trim)
  @MaxLength(100)
  broker?: string;

  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
  currency?: SupportedCurrency;
}
