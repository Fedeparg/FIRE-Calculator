import { SCENARIO_NAME_MAX_LENGTH } from '@sextante/core/contracts';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

/**
 * Cuerpo de PATCH /api/scenarios/:id. Solo se puede renombrar y cambiar los `inputs`: el
 * `slug` no es editable a propósito, porque identifica qué calculadora es el escenario y
 * cambiarlo convertiría unos inputs en basura para la calculadora de destino. Para eso,
 * guardar uno nuevo.
 */
export class UpdateSavedScenarioDto {
  @IsOptional()
  @IsString()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(SCENARIO_NAME_MAX_LENGTH)
  name?: string;

  @IsOptional()
  @IsObject()
  inputs?: Record<string, unknown>;
}
