// Numeric fields are `type="text"` + `inputMode="decimal"`: `<input type="number">` drops the
// comma of the Spanish mobile keyboard. Both comma and point are accepted; the typed separator
// stays on screen and is only normalized when parsing.

const NOT_ALLOWED = /[^\d.,-]/g;
const SEPARATORS = /[.,]/g;
const HAS_DIGIT = /\d/;

/**
 * Keeps digits, a single separator and a leading sign; tolerates intermediate states ("3,", "-").
 * With several separators the last one wins (earlier ones are thousands): both "1.234,56" and
 * "1,234.56" work.
 */
export function sanitizeDecimalInput(raw: string): string {
  const cleaned = raw.replace(NOT_ALLOWED, "");
  const negative = cleaned.startsWith("-");
  const unsigned = cleaned.replace(/-/g, "");

  const decimalAt = Math.max(unsigned.lastIndexOf(","), unsigned.lastIndexOf("."));
  const body =
    decimalAt === -1 ? unsigned : unsigned.slice(0, decimalAt).replace(SEPARATORS, "") + unsigned.slice(decimalAt);

  return negative ? `-${body}` : body;
}

/** `null` if it is not a number yet ("", "-", ","); a trailing separator ("3,") reads as 3. */
export function parseDecimalInput(raw: string): number | null {
  const normalized = sanitizeDecimalInput(raw).replace(",", ".");
  if (!HAS_DIGIT.test(normalized)) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

// `String(n)` uses scientific notation outside [1e-6, 1e21) and `sanitizeDecimalInput` would
// corrupt it ("1e-7" -> "17"); `Intl` always writes positional notation.
const PLAIN = new Intl.NumberFormat("en-US", { useGrouping: false, maximumFractionDigits: 20 });

/** Inverse of `parseDecimalInput`: the locale's decimal separator and no thousands separator. */
export function formatDecimalInput(value: number, decimalSeparator: string): string {
  if (!Number.isFinite(value)) return "";
  if (value === 0) return "0"; // also catches -0, which `Intl` would write as "-0".
  return PLAIN.format(value).replace(".", decimalSeparator);
}

export function stripLeadingZeros(raw: string): string {
  return raw.replace(/^(-?)0+(?=\d)/, "$1");
}

export function clampNumber(value: number, min?: number, max?: number): number {
  if (min !== undefined && value < min) return min;
  if (max !== undefined && value > max) return max;
  return value;
}

function decimalsOf(value: number): number {
  const fraction = String(value).split(".")[1];
  return fraction ? fraction.length : 0;
}

/** Rounds to the operands' decimal places: avoids 0.1 + 0.2 = 0.30000000000000004. */
export function addStep(value: number, delta: number): number {
  const decimals = Math.max(decimalsOf(value), decimalsOf(delta));
  return Number((value + delta).toFixed(decimals));
}
