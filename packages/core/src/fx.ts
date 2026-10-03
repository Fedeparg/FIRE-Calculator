// Currency conversion. Pure core. Shared by the frontend and the API (daily valuation, MCP tool
// `get_portfolio_valuation`) so they produce the same number. Portfolio aggregation lives in
// `portfolio/aggregate.ts`.

/** Pivot currency of the rates: `rates[CCY]` is USD per unit of CCY. */
const FX_PIVOT = "USD";

/**
 * USD per unit of `currency`, or `null` if there is no usable rate (missing, non-finite or 0).
 * The pivot is always 1, whether or not it comes in `rates`.
 */
function usableRate(currency: string, rates: Readonly<Record<string, number | undefined>>): number | null {
  const rate = currency === FX_PIVOT ? 1 : rates[currency];
  return rate !== undefined && Number.isFinite(rate) && rate !== 0 ? rate : null;
}

/**
 * Can `from` be converted to `to` with these rates? Same as `convertCurrency(…) !== null`, without
 * having to convert a dummy amount.
 */
export function canConvert(from: string, to: string, rates: Readonly<Record<string, number>>): boolean {
  return from === to || (usableRate(from, rates) !== null && usableRate(to, rates) !== null);
}

/**
 * Converts `amount` from `from` to `to`. `rates[CCY]` = USD per unit (USD = 1, implicit). Returns
 * `null` if a rate is missing: leaving the position out of the total beats making up a number.
 */
export function convertCurrency(
  amount: number,
  from: string,
  to: string,
  rates: Readonly<Record<string, number>>,
): number | null {
  if (from === to) return amount;
  const fromRate = usableRate(from, rates);
  const toRate = usableRate(to, rates);
  if (fromRate === null || toRate === null) return null;
  return (amount * fromRate) / toRate;
}
