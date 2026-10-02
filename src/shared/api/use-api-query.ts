"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";

import { ApiError, apiJson, isAbortError } from "./client";

export type ApiQueryState<T> =
  { status: "loading" } | { status: "ready"; data: T } | { status: "error"; error: ApiError };

export type ApiQueryOptions<T = unknown> = {
  /** Opciones de `fetch` (p. ej. `cache: "no-store"`). Deben ser estables entre renders (constante de módulo). */
  init?: Omit<RequestInit, "signal" | "body">;
  /**
   * Mientras se recarga (`refetch` o cambio de `path`), seguir devolviendo el último resultado
   * en vez de `loading`: evita que la interfaz parpadee en recargas de fondo.
   */
  keepPrevious?: boolean;
  /**
   * Se llama cuando una petición termina (con datos o con error), no cuando se cancela. Para
   * efectos que dependen de la llegada de la respuesta (p. ej. fijar "cuándo se recibió"),
   * que no pueden calcularse durante el render. Siempre ve la versión más reciente del callback.
   */
  onSettled?: (state: Exclude<ApiQueryState<T>, { status: "loading" }>) => void;
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
export function useApiQuery<T>(
  path: string | null,
  options?: ApiQueryOptions<T>,
): ApiQueryState<T> & { refetch: () => void } {
  const init = options?.init;
  const keepPrevious = options?.keepPrevious ?? false;
  // `state` se asocia a la clave de la petición que lo produjo: al cambiar `path` o hacer
  // `refetch` la clave cambia y el estado derivado vuelve a "loading" sin fijar estado de
  // forma síncrona dentro del effect.
  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = `${path ?? ""}#${reloadKey}`;
  const [result, setResult] = useState<{ key: string; state: ApiQueryState<T> } | null>(null);

  // `useEffectEvent`: el callback se lee fresco dentro del effect sin que su identidad
  // (normalmente una función inline) relance la petición.
  const notifySettled = useEffectEvent((state: Exclude<ApiQueryState<T>, { status: "loading" }>) =>
    options?.onSettled?.(state),
  );

  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    void runApiQuery<T>(path, init, controller.signal, (state) => {
      setResult({ key: requestKey, state });
      if (state.status !== "loading") notifySettled(state);
    });
    return () => controller.abort();
  }, [path, init, requestKey]);

  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);
  const state: ApiQueryState<T> =
    result && (result.key === requestKey || keepPrevious) ? result.state : { status: "loading" };
  return { ...state, refetch };
}
