// CSS variables from `globals.css` (`:root` and `.dark`): the same index works in both themes.
export const CHART_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
] as const;

/** Stable color per index; it cycles (with that many groups, the legend is what identifies them). */
export function paletteColor(index: number): string {
  // A negative or non-integer index yields no position from the modulo: use the first color.
  return CHART_PALETTE[index % CHART_PALETTE.length] ?? CHART_PALETTE[0];
}
