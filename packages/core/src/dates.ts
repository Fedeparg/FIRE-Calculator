/**
 * Calendar days as `YYYY-MM-DD` in UTC: the day key of lots, payouts, prices, snapshots and
 * exchange rates. Working in UTC keeps the browser's or server's time zone from shifting a date to
 * the previous or next day.
 */

/** Milliseconds in a day (UTC has no daylight saving changes). */
export const MS_PER_DAY = 86_400_000;

/** `YYYY-MM-DD` day (UTC) of an instant. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today in UTC as `YYYY-MM-DD`. */
export function todayUtc(): string {
  return isoDay(new Date());
}

/** Year of a `YYYY-MM-DD` day. */
export function yearOf(day: string): number {
  return Number(day.slice(0, 4));
}

/** Instant of UTC midnight of a `YYYY-MM-DD` day. */
function dayStart(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

/** Adds `days` days (negative to subtract) to a `YYYY-MM-DD` day. */
export function addDays(day: string, days: number): string {
  return isoDay(new Date(dayStart(day) + days * MS_PER_DAY));
}

/** Calendar days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((dayStart(to) - dayStart(from)) / MS_PER_DAY);
}

/** Days in month `month` (1-12) of `year`. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Adds `months` months to a `YYYY-MM-DD` day "from date to date" ("de fecha a fecha", art. 5.1
 * Código Civil): 16/07 plus two months is 16/09, and minus two months, 16/05. If the target month
 * has no such day (31/12 + 2 months), its last day is used (28/02 or 29/02).
 */
export function addMonths(day: string, months: number): string {
  // A malformed day leaves gaps: `NaN` propagates them as before (the result is "NaN-…").
  const [year = NaN, month = NaN, dayOfMonth = NaN] = day.split("-").map(Number);
  const index = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;
  const targetDay = Math.min(dayOfMonth, daysInMonth(targetYear, targetMonth));
  return `${String(targetYear).padStart(4, "0")}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}
