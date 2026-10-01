/** Fecha ISO `YYYY-MM-DD` (UTC) de un instante. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Hoy en UTC como `YYYY-MM-DD`: la clave de día de snapshots, lotes y alertas. */
export function todayUtc(): string {
  return isoDate(new Date());
}
