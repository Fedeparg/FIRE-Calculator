import {
  BadRequestException,
  ConflictException,
  type HttpException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

/** SQLSTATE de Postgres que tienen traducción HTTP propia. */
export const PG_FOREIGN_KEY_VIOLATION = '23503';
export const PG_UNIQUE_VIOLATION = '23505';
const PG_NUMERIC_VALUE_OUT_OF_RANGE = '22003';
const PG_SERIALIZATION_FAILURE = '40001';
const PG_DEADLOCK_DETECTED = '40P01';

/** Lo que interesa de un error de Postgres (postgres-js): el SQLSTATE y la restricción violada. */
export type PgErrorInfo = { code: string; constraint: string | null };

/**
 * Busca el error de Postgres en la cadena de `cause`: Drizzle envuelve el error del driver
 * (`DrizzleQueryError`), así que el `code` SQLSTATE no está en el error de primer nivel.
 */
export function findPgError(error: unknown): PgErrorInfo | null {
  let current: unknown = error;
  // Acotado: una cadena de `cause` circular no debe colgar el proceso.
  for (let depth = 0; depth < 10 && typeof current === 'object' && current !== null; depth++) {
    const { code, constraint_name: constraint } = current as { code?: unknown; constraint_name?: unknown };
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) {
      return { code, constraint: typeof constraint === 'string' ? constraint : null };
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/** ¿Es una violación de este SQLSTATE (en cualquier nivel de la cadena de `cause`)? */
export function isPgError(error: unknown, code: string): boolean {
  return findPgError(error)?.code === code;
}

/**
 * Traducción a HTTP de los errores de Postgres que no son fallos del servidor sino de la
 * petición o de la concurrencia. `null` = no tiene traducción (sigue siendo un 500).
 *
 * - 23503 (FK): si la FK es la del usuario (`*_user_id_users_id_fk`), el JWT es válido pero el
 *   usuario ya no existe (cuenta borrada): sesión muerta → 401. Otra FK (p. ej. la posición de un
 *   lote borrada a la vez) es un conflicto con el estado actual → 409.
 * - 23505 (único): el recurso ya existe (dos altas simultáneas) → 409.
 * - 22003 (numérico fuera de rango): un importe que no cabe en la columna → 400.
 * - 40001/40P01 (serialización, interbloqueo): transitorio, se puede reintentar → 503.
 *
 * Los mensajes no incluyen el detalle de Postgres (lleva valores de la fila).
 */
export function pgErrorToHttp(error: unknown): HttpException | null {
  const pg = findPgError(error);
  if (!pg) return null;
  switch (pg.code) {
    case PG_FOREIGN_KEY_VIOLATION:
      return pg.constraint?.endsWith('_user_id_users_id_fk')
        ? new UnauthorizedException('La sesión ya no es válida; vuelve a iniciar sesión')
        : new ConflictException({ code: 'CONFLICT', message: 'El recurso relacionado ya no existe' });
    case PG_UNIQUE_VIOLATION:
      return new ConflictException({ code: 'CONFLICT', message: 'El recurso ya existe' });
    case PG_NUMERIC_VALUE_OUT_OF_RANGE:
      return new BadRequestException({ code: 'OUT_OF_RANGE', message: 'Un importe no cabe en el rango admitido' });
    case PG_SERIALIZATION_FAILURE:
    case PG_DEADLOCK_DETECTED:
      return new ServiceUnavailableException('Operación concurrente; vuelve a intentarlo');
    default:
      return null;
  }
}
