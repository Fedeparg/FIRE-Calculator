import { Transform, Type } from 'class-transformer';
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '@sextante/core/contracts';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Tope de `quantity` y `avgPrice`: `numeric(18,6)` admite 12 dígitos enteros y `@Max` es
 * inclusivo, así que pasar del mayor entero de 12 dígitos da 400 en vez de un overflow (500).
 */
export const NUMERIC_MAX = 999_999_999_999;

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

/** Cuerpo de POST /api/positions (el `userId` sale del JWT). */
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

  // Opcional aquí: "obligatorio si el símbolo ya existe" depende de los datos y lo aplica el servicio.
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(100)
  broker?: string;

  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
  currency?: SupportedCurrency;
}
