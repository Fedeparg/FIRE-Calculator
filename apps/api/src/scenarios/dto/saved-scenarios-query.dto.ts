import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { CALCULATOR_SLUG_PATTERN } from './create-saved-scenario.dto.js';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Query de GET /api/scenarios. Es una CLASE para que el `ValidationPipe` global
 * (`whitelist` + `forbidNonWhitelisted`) también se aplique a los query params: un filtro
 * desconocido da 400 en vez de ignorarse en silencio.
 */
export class SavedScenariosQueryDto {
  /** Filtra por calculadora (p. ej. `?slug=fire-basico`). */
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(64)
  @Matches(CALCULATOR_SLUG_PATTERN, {
    message: 'slug debe ser un identificador en minúsculas separado por guiones',
  })
  slug?: string;
}
