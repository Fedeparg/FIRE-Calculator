// Decimales de coma fija sobre `bigint`, para importar importes y cantidades sin pasar por `number`.

const PLAIN_DECIMAL = /^(-)?(\d+)(?:\.(\d+))?$/;

/**
 * Decimal plano → entero de coma fija con `scale` decimales (half-up sobre el valor absoluto).
 * Devuelve `null` si no es un decimal plano (nada de exponentes, miles ni espacios).
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

/** Inverso de `parseUnits`, sin ceros decimales sobrantes ("1.50" → "1.5", "2.000" → "2"). */
export function formatUnits(units: bigint, scale: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, "0");
  const intPart = digits.slice(0, digits.length - scale);
  const fracPart = digits.slice(digits.length - scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${intPart}${fracPart ? `.${fracPart}` : ""}`;
}

/** Valor absoluto de un entero de coma fija. */
export function absUnits(units: bigint): bigint {
  return units < 0n ? -units : units;
}
