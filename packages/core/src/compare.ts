/**
 * String comparator by code units (the order of `<`), for `sort`. It is the right one for ISO
 * dates, ids and tickers: deterministic and locale-independent, unlike `localeCompare` (which is
 * reserved for text a person reads).
 */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
