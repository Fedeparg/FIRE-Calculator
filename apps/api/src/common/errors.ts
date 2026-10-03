/**
 * Readable message of anything thrown, for the logs. `(error as Error).message` is a wrong cast
 * if something other than an `Error` was thrown (a string, a library object): it would give
 * `undefined`. This falls back to `String(error)` in that case.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
