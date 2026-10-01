import { Transform } from 'class-transformer';
import { IsNotEmpty, IsObject, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Slug de calculadora: minúsculas, dígitos y guiones simples (el mismo formato que el
 * `registry.ts` del frontend). Acotarlo evita que este campo se use como cajón de sastre.
 */
export const CALCULATOR_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

/**
 * Cuerpo de POST /api/scenarios. El `userId` NO va aquí: se lee del JWT.
 *
 * `inputs` se valida como OBJETO, sin tipar sus claves: el esquema de entrada de cada
 * calculadora vive en el frontend y cambia con ella. Lo que sí se acota —en el servicio, que
 * es donde se puede medir— es su TAMAÑO y el número de escenarios por usuario: esto es una
 * conveniencia de la cuenta, no almacenamiento libre.
 */
export class CreateSavedScenarioDto {
  @IsString()
  @Transform(trim)
  @MaxLength(64)
  @Matches(CALCULATOR_SLUG_PATTERN, {
    message: 'slug debe ser un identificador en minúsculas separado por guiones',
  })
  slug!: string;

  @IsString()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsObject()
  inputs!: Record<string, unknown>;
}
