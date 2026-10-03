/**
 * Amounts in euros (or in any currency with cents): rounding to cents and the format in which
 * Renta WEB expects the tax boxes (casillas).
 */

/**
 * Rounds to cents with `Math.round(x * 100) / 100`: strips the binary floating-point noise
 * ("1999.9999999999998") from computed amounts. Note: it inherits the binary bias of `x * 100`
 * (`1.005` gives `1`, not `1.01`); changing the method would change cents in the tax report and
 * belongs in a separate change, with its tax-box tests.
 */
export function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Amount as typed into a Renta WEB tax box: two decimals, decimal comma and no thousands separator. */
export function formatTaxBox(value: number): string {
  return value.toFixed(2).replace(".", ",");
}
