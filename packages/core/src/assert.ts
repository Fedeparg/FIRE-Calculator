/**
 * Returns `value` if it is neither `null` nor `undefined`; otherwise throws an `Error` naming
 * `what`. Replaces TypeScript's `!` (banned by lint), which silences the compiler without checking
 * anything: here the assumption is written down and, if it breaks, fails on the spot.
 */
export function defined<T>(value: T | null | undefined, what = "value"): T {
  if (value === null || value === undefined) throw new Error(`Expected ${what} but got none`);
  return value;
}
