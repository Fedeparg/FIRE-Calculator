"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";

import { ApiError, apiJson, isAbortError } from "./client";

export type ApiQueryState<T> =
  { status: "loading" } | { status: "ready"; data: T } | { status: "error"; error: ApiError };

export type ApiQueryOptions<T = unknown> = {
  /** `fetch` options (e.g. `cache: "no-store"`). Must be stable across renders (a module constant). */
  init?: Omit<RequestInit, "signal" | "body">;
  /**
   * While reloading (`refetch` or a `path` change), keep returning the last result instead of
   * `loading`: prevents the UI from flickering on background reloads.
   */
  keepPrevious?: boolean;
  /**
   * Called when a request finishes (with data or an error), not when it is cancelled. For
   * effects that depend on the response arriving (e.g. recording "when it was received"), which
   * cannot be computed during render. Always sees the latest version of the callback.
   */
  onSettled?: (state: Exclude<ApiQueryState<T>, { status: "loading" }>) => void;
};

/**
 * Runs a load and reports the result to `sink`, unless `signal` was aborted (the component
 * unmounted or the path changed). Replaces the `let cancelled = false` pattern. Kept apart from
 * the hook so it can be tested without a DOM.
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
 * GET with `loading | ready | error` states and `refetch`. With `path === null` it does not load
 * (stays `loading`, useful to wait for a parameter). Changing `path` aborts the previous request
 * and goes back to `loading`. No cache or dedupe by design: at this call volume a dependency
 * (SWR / TanStack Query) does not pay off.
 */
export function useApiQuery<T>(
  path: string | null,
  options?: ApiQueryOptions<T>,
): ApiQueryState<T> & { refetch: () => void } {
  const init = options?.init;
  const keepPrevious = options?.keepPrevious ?? false;
  // `state` is tied to the key of the request that produced it: on a `path` change or a
  // `refetch` the key changes and the derived state goes back to "loading" without setting
  // state synchronously inside the effect.
  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = `${path ?? ""}#${reloadKey}`;
  const [result, setResult] = useState<{ key: string; state: ApiQueryState<T> } | null>(null);

  // `useEffectEvent`: the callback is read fresh inside the effect without its identity
  // (usually an inline function) re-triggering the request.
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
