import { firstItem } from "@sextante/core/arrays";
// Which tax years the tax report offers and which one it opens by default. Pure, testable in node.

/**
 * Tax years with sales or income, from most recent to oldest. With none, the current year, so the
 * first income entry can be recorded.
 */
export function taxYears(withData: Iterable<number>, currentYear: number): number[] {
  const all = new Set(withData);
  if (all.size === 0) all.add(currentYear);
  return [...all].sort((a, b) => b - a);
}

/**
 * Year the report opens on: the one being filed now (last year) if it has data, because the
 * current one has not ended yet; otherwise the most recent one. `years` is never empty (see `taxYears`).
 */
export function defaultTaxYear(years: readonly number[], currentYear: number): number {
  const lastClosed = currentYear - 1;
  return years.includes(lastClosed) ? lastClosed : firstItem(years);
}
