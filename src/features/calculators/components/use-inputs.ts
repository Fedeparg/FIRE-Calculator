"use client";

import { useState } from "react";

/** Lo único que `useInputs` lee de un campo enlazado (`FieldBinding`). */
type ValueSource = { readonly value: unknown };

type InputValues<T extends Record<string, ValueSource>> = { [K in keyof T]: T[K]["value"] };

function sameValues(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.is(a[key], b[key]));
}

/**
 * Objeto de entradas de un cálculo a partir de sus campos enlazados, con identidad ESTABLE
 * mientras ningún valor cambie: `useMemo(() => compute(inputs), [inputs])` sustituye a la lista
 * de dependencias escrita a mano, que había que mantener en paralelo a los campos.
 *
 * Por qué así y no con `useMemo`: sus dependencias serían `Object.values(fields)`, una lista que
 * el linter de hooks no puede comprobar. Se guarda el último objeto en estado y se compara
 * durante el render (el patrón de React para derivar estado de props): si algún valor cambió, se
 * actualiza y se devuelve ya el nuevo, sin un render con el objeto viejo.
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
