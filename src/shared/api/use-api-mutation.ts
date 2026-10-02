"use client";

import { useCallback, useState } from "react";

import { apiErrorKey, type ApiErrorKey } from "./client";

export type ApiMutationState =
  { status: "idle" } | { status: "pending" } | { status: "success" } | { status: "error"; error: unknown };

export type ApiMutationResult<T> = { ok: true; data: T } | { ok: false; error: unknown };

/**
 * Ejecuta una mutación y vuelca `pending` → `success | error` en `sink`. Nunca lanza: el
 * llamador decide qué hacer con el resultado. Separada del hook para poder probarla sin DOM
 * (como `runApiQuery`).
 */
export async function runApiMutation<T>(
  action: () => Promise<T>,
  sink: (state: ApiMutationState) => void,
): Promise<ApiMutationResult<T>> {
  sink({ status: "pending" });
  try {
    const data = await action();
    sink({ status: "success" });
    return { ok: true, data };
  } catch (error) {
    sink({ status: "error", error });
    return { ok: false, error };
  }
}

/**
 * Estado de una mutación (POST/PATCH/DELETE) disparada por el usuario: sustituye al trío
 * `saving` / `error` / `try-catch` que cada componente repetía.
 *
 * `run(() => apiFetch(...))` devuelve `{ ok, data | error }`, así que los efectos de éxito
 * (navegar, actualizar la lista) se escriben justo después, sin anidarlos en un `try`.
 * `status` se queda en `success` hasta el siguiente `run` o `reset`: hace falta cuando el
 * éxito navega fuera y el botón debe seguir deshabilitado hasta que la página cambie.
 * `errorKey` es la clave i18n común; los componentes con `code` propios usan `error`.
 */
export function useApiMutation() {
  const [state, setState] = useState<ApiMutationState>({ status: "idle" });
  const run = useCallback(<T>(action: () => Promise<T>) => runApiMutation(action, setState), []);
  const reset = useCallback(() => setState({ status: "idle" }), []);
  const error = state.status === "error" ? state.error : null;
  const errorKey: ApiErrorKey | null = state.status === "error" ? apiErrorKey(state.error) : null;
  return { status: state.status, error, errorKey, run, reset };
}
