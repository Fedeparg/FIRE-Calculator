/**
 * Elemento `index` de una lista cuyo rango garantiza quien llama: un bucle sobre su longitud, un
 * índice acotado a `[0, length)`, una lista que ya se ha comprobado que no está vacía…
 *
 * Con `noUncheckedIndexedAccess`, `items[i]` se tipa `T | undefined`. Esta función hace explícita
 * esa invariante en vez de silenciarla con `!`: si alguna vez se rompe, lanza un `RangeError` en el
 * sitio en lugar de propagar un `undefined` que acabaría como `NaN` en las cuentas.
 */
export function itemAt<T>(items: ArrayLike<T>, index: number): T {
  if (!Number.isInteger(index) || index < 0 || index >= items.length) {
    throw new RangeError(`Índice ${index} fuera de rango (longitud ${items.length})`);
  }
  // El rango ya está comprobado: el elemento existe (aunque `T` pueda incluir `undefined`).
  return items[index] as T;
}

/** Primer elemento de una lista que quien llama sabe no vacía (ver `itemAt`). */
export function firstItem<T>(items: ArrayLike<T>): T {
  return itemAt(items, 0);
}

/** Último elemento de una lista que quien llama sabe no vacía (ver `itemAt`). */
export function lastItem<T>(items: ArrayLike<T>): T {
  return itemAt(items, items.length - 1);
}

/** Tupla de `N` elementos de tipo `T` (para `takeItems`). */
type Tuple<T, N extends number, R extends T[] = []> = R["length"] extends N ? R : Tuple<T, N, [...R, T]>;

/**
 * Los `count` primeros elementos de una lista que quien llama sabe que los tiene, como tupla para
 * desestructurarla (`const [a, b] = takeItems(lista, 2)`). Lanza `RangeError` si tiene menos.
 */
export function takeItems<T, N extends number>(items: readonly T[], count: N): Tuple<T, N> {
  if (items.length < count) {
    throw new RangeError(`Se esperaban al menos ${count} elementos y hay ${items.length}`);
  }
  // La longitud ya está comprobada: el corte tiene exactamente `count` elementos.
  return items.slice(0, count) as Tuple<T, N>;
}
