/**
 * Item `index` of a list whose bounds the caller guarantees: a loop over its length, an index
 * clamped to `[0, length)`, a list already checked to be non-empty...
 *
 * With `noUncheckedIndexedAccess`, `items[i]` is typed `T | undefined`. This function makes that
 * invariant explicit instead of silencing it with `!`: if it ever breaks, it throws a `RangeError`
 * on the spot instead of propagating an `undefined` that would end up as `NaN` in the math.
 */
export function itemAt<T>(items: ArrayLike<T>, index: number): T {
  if (!Number.isInteger(index) || index < 0 || index >= items.length) {
    throw new RangeError(`Index ${index} out of range (length ${items.length})`);
  }
  // The bounds are already checked: the item exists (even though `T` may include `undefined`).
  return items[index] as T;
}

/** First item of a list the caller knows is non-empty (see `itemAt`). */
export function firstItem<T>(items: ArrayLike<T>): T {
  return itemAt(items, 0);
}

/** Last item of a list the caller knows is non-empty (see `itemAt`). */
export function lastItem<T>(items: ArrayLike<T>): T {
  return itemAt(items, items.length - 1);
}

/** Tuple of `N` items of type `T` (for `takeItems`). */
type Tuple<T, N extends number, R extends T[] = []> = R["length"] extends N ? R : Tuple<T, N, [...R, T]>;

/**
 * The first `count` items of a list the caller knows has them, as a tuple ready to destructure
 * (`const [a, b] = takeItems(list, 2)`). Throws `RangeError` if it has fewer.
 */
export function takeItems<T, N extends number>(items: readonly T[], count: N): Tuple<T, N> {
  if (items.length < count) {
    throw new RangeError(`Expected at least ${count} items but got ${items.length}`);
  }
  // The length is already checked: the slice has exactly `count` items.
  return items.slice(0, count) as Tuple<T, N>;
}
