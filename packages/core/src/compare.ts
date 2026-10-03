/**
 * Comparador de cadenas por unidades de código (el orden de `<`), para `sort`. Es el que conviene
 * con fechas ISO, ids y tickers: determinista y sin depender del idioma, a diferencia de
 * `localeCompare` (que se reserva para textos que lee una persona).
 */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
