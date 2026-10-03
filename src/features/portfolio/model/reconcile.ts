/**
 * Conservar la identidad de los datos que no han cambiado al re-sincronizar con la API.
 *
 * React decide si re-renderizar (y si recalcular un `useMemo`) comparando referencias, no
 * contenidos. Cada respuesta de la API trae objetos nuevos aunque digan lo mismo, así que sin
 * esto cada auto-refresco (cada minuto, o al volver a la pestaña) invalidaría todos los cálculos
 * que dependen de las posiciones o de los precios. Solo sirve para objetos planos (campos
 * primitivos), que es lo que son `Position` y `PriceInfo`.
 */

/** Igualdad superficial de dos objetos planos: mismas claves y mismos valores (`Object.is`). */
function shallowEqual(a: object, b: object): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every(
    (key) =>
      Object.hasOwn(b, key) && Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

/**
 * `next` con los elementos de `prev` que no han cambiado (mismo `id` y mismo contenido), o el
 * propio `prev` si nada ha cambiado ni de contenido ni de orden.
 */
export function reconcileList<T extends { id: string }>(prev: readonly T[], next: readonly T[]): T[] {
  const previous = new Map(prev.map((item) => [item.id, item]));
  let changed = prev.length !== next.length;
  const merged = next.map((item, index) => {
    const old = previous.get(item.id);
    const kept = old && shallowEqual(old, item) ? old : item;
    if (kept !== prev[index]) changed = true;
    return kept;
  });
  return changed ? merged : (prev as T[]);
}

/** Igual que `reconcileList` para un diccionario: el propio `prev` si ninguna entrada ha cambiado. */
export function reconcileRecord<T extends object>(
  prev: Readonly<Record<string, T>>,
  next: Readonly<Record<string, T>>,
): Record<string, T> {
  let changed = Object.keys(prev).length !== Object.keys(next).length;
  const merged: Record<string, T> = {};
  for (const [key, value] of Object.entries(next)) {
    const old = Object.hasOwn(prev, key) ? prev[key] : undefined;
    const kept = old && shallowEqual(old, value) ? old : value;
    if (kept !== old) changed = true;
    merged[key] = kept;
  }
  return changed ? merged : (prev as Record<string, T>);
}
