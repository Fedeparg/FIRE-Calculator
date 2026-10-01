import { Transform, Type } from 'class-transformer';
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '@sextante/core/contracts';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Tope superior de `quantity` y `avgPrice`. `numeric(18,6)` admite 12 dígitos enteros;
 * lo acotamos por debajo de ese límite para que un valor absurdo dé 400 (validación)
 * en lugar de un error de base de datos.
 */
// `numeric(18,6)` admite 12 dígitos enteros → máximo 999_999_999_999,999999. `@Max` es
// inclusivo, así que el tope es el mayor entero de 12 dígitos: pasar de aquí da 400
// (validación) en lugar de un overflow en la BD (500).
export const NUMERIC_MAX = 999_999_999_999;

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

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

  // Opcional a nivel de DTO: la regla "obligatorio si el símbolo ya existe" no se puede
  // expresar aquí (depende de los datos del usuario), así que la aplica el servicio.
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(100)
  broker?: string;

  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
  currency?: SupportedCurrency;
}
