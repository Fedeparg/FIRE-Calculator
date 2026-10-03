/**
 * Importes en euros (o en cualquier divisa con céntimos): redondeo a céntimos y el formato con el
 * que Renta WEB pide las casillas.
 */

/**
 * Redondea a céntimos con `Math.round(x * 100) / 100`: quita el ruido binario de la coma flotante
 * ("1999,9999999999998") de los importes calculados. Ojo: hereda el sesgo binario de `x * 100`
 * (`1.005` da `1`, no `1.01`); cambiar el método cambiaría céntimos del informe fiscal y va
 * aparte, con sus tests de casillas.
 */
export function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Importe tal como se teclea en una casilla de Renta WEB: dos decimales, coma decimal y sin miles. */
export function formatTaxBox(value: number): string {
  return value.toFixed(2).replace(".", ",");
}
