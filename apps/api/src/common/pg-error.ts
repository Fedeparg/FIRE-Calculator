import {
  BadRequestException,
  ConflictException,
  type HttpException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

/** Postgres SQLSTATEs that have their own HTTP translation. */
export const PG_FOREIGN_KEY_VIOLATION = '23503';
export const PG_UNIQUE_VIOLATION = '23505';
const PG_NUMERIC_VALUE_OUT_OF_RANGE = '22003';
const PG_SERIALIZATION_FAILURE = '40001';
const PG_DEADLOCK_DETECTED = '40P01';

/** What matters from a Postgres error (postgres-js): the SQLSTATE and the violated constraint. */
export type PgErrorInfo = { code: string; constraint: string | null };

/**
 * Looks for the Postgres error along the `cause` chain: Drizzle wraps the driver error
 * (`DrizzleQueryError`), so the SQLSTATE `code` is not on the top-level error.
 */
export function findPgError(error: unknown): PgErrorInfo | null {
  let current: unknown = error;
  // Bounded: a circular `cause` chain must not hang the process.
  for (let depth = 0; depth < 10 && typeof current === 'object' && current !== null; depth++) {
    const { code, constraint_name: constraint } = current as { code?: unknown; constraint_name?: unknown };
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) {
      return { code, constraint: typeof constraint === 'string' ? constraint : null };
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/** Is it a violation of this SQLSTATE (at any level of the `cause` chain)? */
export function isPgError(error: unknown, code: string): boolean {
  return findPgError(error)?.code === code;
}

/**
 * HTTP translation of the Postgres errors that are not server failures but caused by the
 * request or by concurrency. `null` = no translation (it stays a 500).
 *
 * - 23503 (FK): if the FK is the user one (`*_user_id_users_id_fk`), the JWT is valid but the
 *   user no longer exists (deleted account): dead session → 401. Any other FK (e.g. a lot's
 *   position deleted at the same time) is a conflict with the current state → 409.
 * - 23505 (unique): the resource already exists (two concurrent creations) → 409.
 * - 22003 (numeric value out of range): an amount that does not fit in the column → 400.
 * - 40001/40P01 (serialisation failure, deadlock): transient, can be retried → 503.
 *
 * The messages do not include the Postgres detail (it carries row values).
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
