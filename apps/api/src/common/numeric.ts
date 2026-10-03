/** Nullable Drizzle `numeric` (string) as a `number`, keeping `null`. Only for read responses. */
export function numberOrNull(value: string | null): number | null {
  return value === null ? null : Number(value);
}
