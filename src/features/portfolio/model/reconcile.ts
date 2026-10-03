/**
 * Preserve the identity of unchanged data when re-syncing with the API.
 *
 * React decides whether to re-render (and whether to recompute a `useMemo`) by comparing
 * references, not contents. Every API response brings new objects even when they say the same
 * thing, so without this every auto-refresh (every minute, or when returning to the tab) would
 * invalidate every computation that depends on positions or prices. It only works for plain
 * objects (primitive fields), which is what `Position` and `PriceInfo` are.
 */

/** Shallow equality of two plain objects: same keys and same values (`Object.is`). */
function shallowEqual(a: object, b: object): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every(
    (key) =>
      Object.hasOwn(b, key) && Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

/**
 * `next` with the items from `prev` that have not changed (same `id` and same content), or
 * `prev` itself if nothing changed in either content or order.
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

/** Same as `reconcileList` for a dictionary: `prev` itself if no entry changed. */
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
