import { firstItem } from "@sextante/core/arrays";
// Qué ejercicios ofrece el informe fiscal y cuál abre por defecto. Puro, testeable en node.

/**
 * Ejercicios con ventas o con cobros, del más reciente al más antiguo. Sin ninguno, el año en
 * curso, para poder anotar el primer cobro.
 */
export function taxYears(withData: Iterable<number>, currentYear: number): number[] {
  const all = new Set(withData);
  if (all.size === 0) all.add(currentYear);
  return [...all].sort((a, b) => b - a);
}

/**
 * Ejercicio que abre el informe: el que se declara ahora (el año pasado) si tiene datos, porque
 * el actual aún no ha terminado; si no, el más reciente. `years` nunca está vacía (ver `taxYears`).
 */
export function defaultTaxYear(years: readonly number[], currentYear: number): number {
  const lastClosed = currentYear - 1;
  return years.includes(lastClosed) ? lastClosed : firstItem(years);
}
