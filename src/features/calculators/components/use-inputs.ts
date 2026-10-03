"use client";

import { useState } from "react";

/** The only thing `useInputs` reads from a bound field (`FieldBinding`). */
type ValueSource = { readonly value: unknown };

type InputValues<T extends Record<string, ValueSource>> = { [K in keyof T]: T[K]["value"] };

function sameValues(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.is(a[key], b[key]));
}

/**
 * A computation's inputs object built from its bound fields, with a STABLE identity as long as
 * no value changes: `useMemo(() => compute(inputs), [inputs])` replaces the hand-written
 * dependency list that had to be kept in sync with the fields.
 *
 * Why this and not `useMemo`: its dependencies would be `Object.values(fields)`, a list the hooks
 * linter cannot check. The last object is kept in state and compared during render (React's
 * pattern for deriving state from props): if any value changed, it is updated and the new one is
 * returned straight away, with no render using the stale object.
 */
export function useInputs<T extends Record<string, ValueSource>>(fields: T): InputValues<T> {
  const current = Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, field.value]));
  const [stable, setStable] = useState(current);
  if (!sameValues(stable, current)) {
    setStable(current);
    return current as InputValues<T>;
  }
  return stable as InputValues<T>;
}
