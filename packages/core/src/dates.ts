/**
 * Días de calendario como `YYYY-MM-DD` en UTC: la clave de día de lotes, cobros, precios,
 * snapshots y tipos de cambio. Trabajar en UTC evita que el huso del navegador o del servidor
 * mueva una fecha al día anterior o siguiente.
 */

/** Milisegundos de un día (en UTC no hay cambios de hora). */
export const MS_PER_DAY = 86_400_000;

/** Día `YYYY-MM-DD` (UTC) de un instante. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Hoy en UTC como `YYYY-MM-DD`. */
export function todayUtc(): string {
  return isoDay(new Date());
}

/** Año de un día `YYYY-MM-DD`. */
export function yearOf(day: string): number {
  return Number(day.slice(0, 4));
}

/** Instante de la medianoche UTC de un día `YYYY-MM-DD`. */
function dayStart(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

/** Suma `days` días (negativo para restar) a un día `YYYY-MM-DD`. */
export function addDays(day: string, days: number): string {
  return isoDay(new Date(dayStart(day) + days * MS_PER_DAY));
}

/** Días de calendario de `from` a `to` (negativo si `to` es anterior). */
export function daysBetween(from: string, to: string): number {
  return Math.round((dayStart(to) - dayStart(from)) / MS_PER_DAY);
}

/** Días del mes `month` (1-12) de `year`. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Suma `months` meses a un día `YYYY-MM-DD` «de fecha a fecha» (art. 5.1 Código Civil): el
 * 16/07 más dos meses es el 16/09 y menos dos meses, el 16/05. Si el mes de destino no tiene ese
 * día (31/12 + 2 meses), se toma su último día (28/02 o 29/02).
 */
export function addMonths(day: string, months: number): string {
  // Un día mal formado deja huecos: `NaN` los propaga igual que antes (el resultado es "NaN-…").
  const [year = NaN, month = NaN, dayOfMonth = NaN] = day.split("-").map(Number);
  const index = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;
  const targetDay = Math.min(dayOfMonth, daysInMonth(targetYear, targetMonth));
  return `${String(targetYear).padStart(4, "0")}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}
