/** `numeric` nullable de Drizzle (string) como `number`, conservando el `null`. Solo para respuestas de lectura. */
export function numberOrNull(value: string | null): number | null {
  return value === null ? null : Number(value);
}
