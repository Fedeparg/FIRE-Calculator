"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  completeValues,
  decodeCalculatorInputs,
  decodeCalculatorState,
  encodeCalculatorState,
  type FieldSpec,
  type FieldValue,
  type FieldValues,
} from "@/shared/url-state/url-state";
import CalculatorActions from "./CalculatorActions";

/**
 * Shared state (fields and values) so URL sharing and saved scenarios are implemented once:
 * each field is declared with `useNumberField`/`useOptionField`.
 */
type CalculatorStateContextValue = {
  /** Identifies its saved scenarios. */
  slug: string;
  /** Only the fields that differ from their default value. */
  values: FieldValues;
  hasFields: boolean;
  registerField: (key: string, spec: FieldSpec) => void;
  setValue: (key: string, value: FieldValue) => void;
  applyInputs: (inputs: unknown) => void;
  getInputs: () => FieldValues;
  /** Writes the URL without waiting for the delay (copying must not lose the last keystroke) and returns the link. */
  flushUrl: () => string;
};

const CalculatorStateContext = createContext<CalculatorStateContextValue | null>(null);

// Browsers rate-limit calls to `replaceState`.
const URL_SYNC_DELAY_MS = 250;

type Props = {
  slug: string;
  children: React.ReactNode;
};

/**
 * Provider mounted by `CalculatorShell`. URL synchronisation:
 *
 * - It reads `window.location.search` after mounting, not `useSearchParams`: the page is static
 *   (ISR), so the first render uses the defaults to match hydration and the route does not turn
 *   dynamic. The read happens in a `useLayoutEffect` (it runs after mounting and BEFORE the
 *   browser paints, and after the children's effects, which have already registered their
 *   fields): the link's values show up on the client's first paint, with no intermediate frame
 *   showing the defaults.
 * - It writes with `history.replaceState`, not `router.replace`, which would be an App Router
 *   navigation (refetching the RSC payload); `replaceState` neither reloads nor pushes entries.
 *
 * External values (URL or scenario) are applied by changing state, without remounting the
 * fields: each `NumberField` resyncs its text when its `value` changes from outside.
 */
export default function CalculatorStateProvider({ slug, children }: Props) {
  // A ref rather than state: specs are configuration (never rendered) and are registered from
  // each field's effects; keeping them in state would cause pointless renders.
  const specsRef = useRef<Record<string, FieldSpec>>({});
  const [values, setValues] = useState<FieldValues>({});
  const [hasFields, setHasFields] = useState(false);
  // The URL cannot be written until it has been read (it would be wiped).
  const [hydrated, setHydrated] = useState(false);

  const registerField = useCallback((key: string, spec: FieldSpec) => {
    specsRef.current[key] = spec;
  }, []);

  const setValue = useCallback((key: string, value: FieldValue) => {
    setValues((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);

  // Entry point for a scenario's external values. It replaces the state instead of merging it:
  // anything missing goes back to its default value.
  const applyInputs = useCallback((inputs: unknown) => {
    setValues(decodeCalculatorInputs(inputs, specsRef.current));
  }, []);

  const getInputs = useCallback(() => completeValues(values, specsRef.current), [values]);

  // The only path that writes the URL: shared by the delayed effect and `flushUrl`.
  // It only calls `replaceState` if something changed, and returns the full link.
  const writeUrl = useCallback(() => {
    const search = encodeCalculatorState(window.location.search, values, specsRef.current);
    const { origin, pathname, hash } = window.location;
    if (search !== window.location.search) {
      window.history.replaceState(null, "", `${pathname}${search}${hash}`);
    }
    return `${origin}${pathname}${search}${hash}`;
  }, [values]);

  // A `setState` inside `useLayoutEffect` is applied synchronously before painting.
  useLayoutEffect(() => {
    const specs = specsRef.current;
    setHasFields(Object.keys(specs).length > 0);
    const fromUrl = decodeCalculatorState(window.location.search, specs);
    if (Object.keys(fromUrl).length > 0) setValues(fromUrl);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(writeUrl, URL_SYNC_DELAY_MS);
    return () => clearTimeout(timer);
  }, [writeUrl, hydrated]);

  const context = useMemo<CalculatorStateContextValue>(
    () => ({ slug, values, hasFields, registerField, setValue, applyInputs, getInputs, flushUrl: writeUrl }),
    [slug, values, hasFields, registerField, setValue, applyInputs, getInputs, writeUrl],
  );

  return (
    <CalculatorStateContext.Provider value={context}>
      {children}
      <CalculatorActions />
    </CalculatorStateContext.Provider>
  );
}

/** `null` outside a provider (pages that are not calculators). */
export function useCalculatorState(): CalculatorStateContextValue | null {
  return useContext(CalculatorStateContext);
}

/** Slug of the current calculator (its message namespace is `calc.<slug>`). */
export function useCalculatorSlug(): string {
  return useRequiredCalculatorState().slug;
}

function useRequiredCalculatorState(): CalculatorStateContextValue {
  const context = useContext(CalculatorStateContext);
  if (!context) {
    throw new Error("Calculator fields require <CalculatorStateProvider>");
  }
  return context;
}

/**
 * Drop-in for `useState(defaultValue)` whose value travels in the URL and in scenarios.
 * `key` is the query-string parameter: changing it invalidates existing links and saved scenarios.
 */
export function useNumberField(key: string, defaultValue: number): [number, (value: number) => void] {
  const { values, registerField, setValue } = useRequiredCalculatorState();
  // In an effect, not during render: render must be pure (React may repeat or discard it in
  // strict or concurrent mode). A child's `useLayoutEffect` runs before the provider's, so the
  // spec is already registered when the provider reads the URL.
  useLayoutEffect(() => {
    registerField(key, { kind: "number", defaultValue });
  }, [registerField, key, defaultValue]);

  const raw = values[key];
  const value = typeof raw === "number" ? raw : defaultValue;
  const set = useCallback((next: number) => setValue(key, next), [setValue, key]);

  return [value, set];
}

/** Like `useNumberField`, validated against `allowed`: an unknown value falls back to the default. */
export function useOptionField<T extends string>(
  key: string,
  defaultValue: T,
  allowed: readonly T[],
): [T, (value: T) => void] {
  const { values, registerField, setValue } = useRequiredCalculatorState();
  // See `useNumberField`.
  useLayoutEffect(() => {
    registerField(key, { kind: "option", defaultValue, allowed });
  }, [registerField, key, defaultValue, allowed]);

  const raw = values[key];
  const value = typeof raw === "string" && (allowed as readonly string[]).includes(raw) ? (raw as T) : defaultValue;
  const set = useCallback((next: T) => setValue(key, next), [setValue, key]);

  return [value, set];
}

/**
 * Several option fields sharing the same allowed values (e.g. a quiz's questions), when their
 * count comes from data and `useOptionField` cannot be called once per field (hooks cannot go
 * in a loop). `keys` and `allowed` must be module constants: their identity drives registration.
 */
export function useOptionFields<T extends string>(
  keys: readonly string[],
  defaultValue: T,
  allowed: readonly T[],
): [T[], (index: number, value: T) => void] {
  const { values, registerField, setValue } = useRequiredCalculatorState();
  // See `useNumberField`.
  useLayoutEffect(() => {
    for (const key of keys) registerField(key, { kind: "option", defaultValue, allowed });
  }, [registerField, keys, defaultValue, allowed]);

  const current = useMemo(
    () =>
      keys.map((key) => {
        const raw = values[key];
        return typeof raw === "string" && (allowed as readonly string[]).includes(raw) ? (raw as T) : defaultValue;
      }),
    [values, keys, defaultValue, allowed],
  );
  const set = useCallback(
    (index: number, next: T) => {
      const key = keys[index];
      if (key !== undefined) setValue(key, next);
    },
    [setValue, keys],
  );

  return [current, set];
}

/**
 * Bound field: its URL key (which by convention is also its label key), its value and its setter
 * in a single object. Consumed by `<NumField>` (label and help derived from the key) and
 * `useInputs` (the computation's inputs), so each field is not repeated in three places.
 */
export type FieldBinding<T> = {
  key: string;
  value: T;
  set: (value: T) => void;
};

/**
 * `useNumberField` returning the bound field instead of the tuple. The object is memoised: its
 * identity only changes when its value does, so it can go in `useMemo` dependencies.
 */
export function useBoundNumberField(key: string, defaultValue: number): FieldBinding<number> {
  const [value, set] = useNumberField(key, defaultValue);
  return useMemo(() => ({ key, value, set }), [key, value, set]);
}

/** `useOptionField` returning the bound field (see `useBoundNumberField`). */
export function useBoundOptionField<T extends string>(
  key: string,
  defaultValue: T,
  allowed: readonly T[],
): FieldBinding<T> {
  const [value, set] = useOptionField(key, defaultValue, allowed);
  return useMemo(() => ({ key, value, set }), [key, value, set]);
}
