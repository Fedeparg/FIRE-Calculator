/**
 * Paleta categórica para las gráficas con un número de series variable (la composición de la
 * cartera puede tener dos grupos o veinte).
 *
 * Son variables CSS definidas en `globals.css` para `:root` y `.dark`, no colores literales:
 * así el mismo índice da un tono legible en tema claro y en oscuro sin que el componente
 * tenga que saber en cuál está.
 */
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

/**
 * Color estable para el elemento `index` de una lista. Cicla si hay más elementos que colores:
 * con tantos grupos el color deja de ser identificativo de todas formas, y la leyenda —que es
 * lo que de verdad lee un usuario— sigue siendo unívoca.
 */
export function paletteColor(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length];
}
