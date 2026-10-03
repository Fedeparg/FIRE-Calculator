// Numeric input policy of the calculators. Pure core.
//
//   1. A calculator NEVER throws or hangs, whatever the numeric input (NaN, ±Infinity, negatives,
//      zeros). Inputs come from forms, shared URLs and MCP; a failure here would break the whole
//      page.
//   2. With finite inputs (zeros and negatives included) every output figure is finite. What has no
//      answer is expressed as `null` (e.g. `yearsToFire`) or as the calculator's documented result
//      (credit card debt that is never paid off returns `Infinity` interest).
//   3. With non-finite inputs the output may be non-finite: the web renders it as "—"
//      (`shared/format/format.ts`). MCP already rejects them before they get here (zod `z.number()`
//      with bounds), and the forms bound every field.
//   4. Term fields are clamped to `MAX_HORIZON_YEARS`: without a cap, `years = Infinity` (or 1e9)
//      would loop forever building a series of that size.
//
// Tests: `edge-inputs.test.ts` checks 1 and 2 across all calculators.

/** Cap for term fields, in years; the same one MCP applies by default. */
export const MAX_HORIZON_YEARS = 100;

/**
 * Term in years as an integer from `min` to `MAX_HORIZON_YEARS`. NaN counts as 0 (like the rest of
 * the inputs: `x || 0`); ±Infinity is clamped to the matching bound.
 */
export function clampYears(years: number | undefined, min = 0): number {
  return Math.min(MAX_HORIZON_YEARS, Math.max(min, Math.round(years || 0)));
}

/**
 * Quantity (units/shares) tolerance: they are stored with 6 decimals, so a smaller remainder is
 * binary floating-point noise and counts as zero.
 */
export const QUANTITY_EPSILON = 1e-9;

/** `value` if finite; otherwise (NaN, ±Infinity), `fallback`. */
export function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** `value` if finite and positive; anything else (negatives, zero, NaN, ±Infinity) gives 0. */
export function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
