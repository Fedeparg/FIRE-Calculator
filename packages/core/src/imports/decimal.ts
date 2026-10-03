// Fixed-point decimals on `bigint`, to import amounts and quantities without going through `number`.

const PLAIN_DECIMAL = /^(-)?(\d+)(?:\.(\d+))?$/;

/**
 * Plain decimal → fixed-point integer with `scale` decimals (half-up on the absolute value).
 * Returns `null` if it is not a plain decimal (no exponents, thousands separators or spaces).
 */
export function parseUnits(raw: string, scale: number): bigint | null {
  const match = PLAIN_DECIMAL.exec(raw);
  if (!match) return null;
  const [, sign, intPart = "", fracPart = ""] = match;
  const padded = fracPart.padEnd(scale + 1, "0");
  let units = BigInt(intPart + padded.slice(0, scale));
  if (padded.charCodeAt(scale) - 48 >= 5) units += 1n;
  return sign ? -units : units;
}

/** Inverse of `parseUnits`, without trailing decimal zeros ("1.50" → "1.5", "2.000" → "2"). */
export function formatUnits(units: bigint, scale: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, "0");
  const intPart = digits.slice(0, digits.length - scale);
  const fracPart = digits.slice(digits.length - scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${intPart}${fracPart ? `.${fracPart}` : ""}`;
}

/** Absolute value of a fixed-point integer. */
export function absUnits(units: bigint): bigint {
  return units < 0n ? -units : units;
}
