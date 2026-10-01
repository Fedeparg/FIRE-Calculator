import { SCENARIO_NAME_MAX_LENGTH } from '@sextante/core/contracts';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsObject, IsString, Matches, MaxLength } from 'class-validator';

/** Slug de calculadora, mismo formato que el `registry.ts` del frontend; acotarlo evita usarlo como cajón de sastre. */
export const CALCULATOR_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

/**
 * Cuerpo de POST /api/scenarios (el `userId` sale del JWT). `inputs` se valida solo como objeto:
 * su esquema vive en el frontend; tamaño y número por usuario se acotan en el servicio.
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
  @MaxLength(SCENARIO_NAME_MAX_LENGTH)
  name!: string;

  @IsObject()
  inputs!: Record<string, unknown>;
}
