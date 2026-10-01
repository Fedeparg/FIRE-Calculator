"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError, apiJson, isAbortError } from "./client";

export type ApiQueryState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; error: ApiError };

export type ApiQueryOptions = {
  /** Opciones de `fetch` (p. ej. `cache: "no-store"`). Deben ser estables entre renders (constante de módulo). */
  init?: Omit<RequestInit, "signal" | "body">;
};

/**
 * Ejecuta una carga y vuelca el resultado en `sink`, salvo si `signal` se canceló (el
 * componente se desmontó o cambió la ruta). Sustituye al patrón `let cancelled = false`.
 * Separada del hook para poder probarla sin DOM.
 */
export async function runApiQuery<T>(
  path: string,
  init: ApiQueryOptions["init"],
  signal: AbortSignal,
  sink: (state: ApiQueryState<T>) => void,
): Promise<void> {
  try {
    const data = await apiJson<T>(path, { ...init, signal });
    if (!signal.aborted) sink({ status: "ready", data });
  } catch (error) {
    if (signal.aborted || isAbortError(error)) return;
    sink({ status: "error", error: error instanceof ApiError ? error : new ApiError(0, undefined, { cause: error }) });
  }
}

/**
 * GET con estados `loading | ready | error` y `refetch`. Con `path === null` no carga
 * (queda en `loading`, útil para esperar a un parámetro). Cambiar `path` cancela la petición
 * anterior y vuelve a `loading`. Por diseño no hay caché ni dedupe: para este volumen de
 * llamadas no compensa una dependencia (SWR / TanStack Query).
 */
export function useApiQuery<T>(path: string | null, options?: ApiQueryOptions): ApiQueryState<T> & { refetch: () => void } {
  const init = options?.init;
  // `state` se asocia a la clave de la petición que lo produjo: al cambiar `path` o hacer
  // `refetch` la clave cambia y el estado derivado vuelve a "loading" sin fijar estado de
  // forma síncrona dentro del effect.
  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = `${path ?? ""}#${reloadKey}`;
  const [result, setResult] = useState<{ key: string; state: ApiQueryState<T> } | null>(null);

  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    void runApiQuery<T>(path, init, controller.signal, (state) => setResult({ key: requestKey, state }));
    return () => controller.abort();
  }, [path, init, requestKey]);

  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);
  const state: ApiQueryState<T> = result?.key === requestKey ? result.state : { status: "loading" };
  return { ...state, refetch };
}
