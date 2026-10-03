"use client";

import { useCallback, useState } from "react";

import { apiErrorKey, type ApiErrorKey } from "./client";

export type ApiMutationState =
  { status: "idle" } | { status: "pending" } | { status: "success" } | { status: "error"; error: unknown };

export type ApiMutationResult<T> = { ok: true; data: T } | { ok: false; error: unknown };

/**
 * Runs a mutation and reports `pending` → `success | error` to `sink`. It never throws: the
 * caller decides what to do with the result. Kept apart from the hook so it can be tested
 * without a DOM (like `runApiQuery`).
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
 * State of a user-triggered mutation (POST/PATCH/DELETE): replaces the `saving` / `error` /
 * `try-catch` trio every component used to repeat.
 *
 * `run(() => apiFetch(...))` returns `{ ok, data | error }`, so success effects (navigating,
 * updating the list) are written right after it, without nesting them in a `try`.
 * `status` stays `success` until the next `run` or `reset`: needed when success navigates away
 * and the button must remain disabled until the page changes.
 * `errorKey` is the common i18n key; components with their own `code`s use `error`.
 */
export function useApiMutation() {
  const [state, setState] = useState<ApiMutationState>({ status: "idle" });
  const run = useCallback(<T>(action: () => Promise<T>) => runApiMutation(action, setState), []);
  const reset = useCallback(() => setState({ status: "idle" }), []);
  const error = state.status === "error" ? state.error : null;
  const errorKey: ApiErrorKey | null = state.status === "error" ? apiErrorKey(state.error) : null;
  return { status: state.status, error, errorKey, run, reset };
}
