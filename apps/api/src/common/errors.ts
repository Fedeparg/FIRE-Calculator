/**
 * Mensaje legible de cualquier cosa lanzada, para los logs. `(error as Error).message` es un cast
 * incorrecto si se lanzó algo que no es un `Error` (un string, un objeto de una librería): daría
 * `undefined`. Esto cae a `String(error)` en ese caso.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
