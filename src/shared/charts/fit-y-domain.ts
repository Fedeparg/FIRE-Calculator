/** Padding of the "fit" domain, as a fraction of the chart's highest/lowest value. */
const FIT_DOMAIN_PADDING_RATIO = 0.01;

const toNumber = (value: unknown): number => (value === undefined ? 0 : Number(value));

/**
 * Value-axis domain fitted to the actual data range, with a 1% margin above and below. It
 * counts the STACKED total of each row (`stackKeys`) and every overlaid series (`overlayKeys`:
 * lines and band edges). When all values are equal it opens a margin around them (±1 if they are
 * 0); with no finite data it returns `undefined` and the axis keeps its default domain.
 *
 * Computed by hand because Recharts forces the minimum of a stacked `Area` to 0 (its baseline)
 * before a `domain` function can touch it.
 */
export function fitYDomain<T extends object>(
  data: readonly T[],
  stackKeys: readonly (keyof T & string)[],
  overlayKeys: readonly (keyof T & string)[],
): [number, number] | undefined {
  let min = Infinity;
  let max = -Infinity;
  for (const row of data) {
    const stackTotal = stackKeys.reduce((sum, key) => sum + toNumber(row[key]), 0);
    min = Math.min(min, stackTotal);
    max = Math.max(max, stackTotal);
    for (const key of overlayKeys) {
      const value = toNumber(row[key]);
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return undefined;
  if (min === max) {
    const pad = Math.abs(max) * FIT_DOMAIN_PADDING_RATIO || 1;
    return [min - pad, max + pad];
  }
  return [min - Math.abs(min) * FIT_DOMAIN_PADDING_RATIO, max + Math.abs(max) * FIT_DOMAIN_PADDING_RATIO];
}
