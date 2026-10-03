// Variables CSS de `globals.css` (`:root` y `.dark`): el mismo índice sirve en ambos temas.
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

/** Color estable por índice; cicla (con tantos grupos la leyenda es lo que identifica). */
export function paletteColor(index: number): string {
  // Con un índice negativo o no entero el módulo no da una posición: se usa el primer color.
  return CHART_PALETTE[index % CHART_PALETTE.length] ?? CHART_PALETTE[0];
}
