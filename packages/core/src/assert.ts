/**
 * Devuelve `value` si no es `null` ni `undefined`, y si lo es lanza un `Error` con `what` en el
 * mensaje. Sustituye al `!` de TypeScript (prohibido por lint), que silencia al compilador sin
 * comprobar nada: aquí la suposición queda escrita y, si se rompe, falla en el sitio.
 */
export function defined<T>(value: T | null | undefined, what = "valor"): T {
  if (value === null || value === undefined) throw new Error(`Se esperaba ${what} y no hay`);
  return value;
}
