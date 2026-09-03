import { Transform } from 'class-transformer';
import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Cuerpo de PATCH /api/scenarios/:id. Solo se puede renombrar y cambiar los `inputs`: el
 * `slug` NO es editable a propósito, porque identifica QUÉ calculadora es el escenario y
 * cambiarlo convertiría unos inputs en basura para la calculadora de destino. Para eso,
 * guardar uno nuevo.
 */
export class UpdateSavedScenarioDto {
  @IsOptional()
  @IsString()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsObject()
  inputs?: Record<string, unknown>;
}
