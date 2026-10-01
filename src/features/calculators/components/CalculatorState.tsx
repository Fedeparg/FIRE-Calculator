"use client";

import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import {
  completeValues,
  decodeCalculatorInputs,
  decodeCalculatorState,
  encodeCalculatorState,
  type FieldSpec,
  type FieldValue,
  type FieldValues,
} from "@/features/calculators/url-state";
import CalculatorActions from "./CalculatorActions";

/**
 * Estado compartido (campos y valores) para implementar una sola vez compartir por URL y
 * guardar escenarios: cada campo se declara con `useNumberField`/`useOptionField`.
 */
type CalculatorStateContextValue = {
  /** Identifica sus escenarios guardados. */
  slug: string;
  /** Solo los campos que difieren de su valor por defecto. */
  values: FieldValues;
  hasFields: boolean;
  registerField: (key: string, spec: FieldSpec) => void;
  setValue: (key: string, value: FieldValue) => void;
  applyInputs: (inputs: unknown) => void;
  getInputs: () => FieldValues;
  /** Escribe la URL sin esperar al retardo (copiar no debe perder la última tecla) y devuelve el enlace. */
  flushUrl: () => string;
};

const CalculatorStateContext = createContext<CalculatorStateContextValue | null>(null);

// Los navegadores limitan las llamadas por segundo a `replaceState`.
const URL_SYNC_DELAY_MS = 250;

type Props = {
  slug: string;
  children: React.ReactNode;
};

/**
 * Proveedor montado por `CalculatorShell`. Sincronización con la URL:
 *
 * - Se lee de `window.location.search` tras el montaje, no con `useSearchParams`: la página
 *   es estática (ISR), así que el primer render usa los valores por defecto para casar con
 *   la hidratación y la ruta no se vuelve dinámica.
 * - Se escribe con `history.replaceState`, no con `router.replace`, que sería una navegación
 *   de App Router (pide de nuevo el payload RSC); `replaceState` no recarga ni apila entradas.
 */
export default function CalculatorStateProvider({ slug, children }: Props) {
  // Ref porque se rellena durante el render de los hijos (cada hook se registra al
  // renderizarse); actualizar estado ahí provocaría un bucle de renders.
  const specsRef = useRef<Record<string, FieldSpec>>({});
  const [values, setValues] = useState<FieldValues>({});
  const [hasFields, setHasFields] = useState(false);
  // Hasta leer la URL no se puede escribir en ella (se borraría).
  const [hydrated, setHydrated] = useState(false);
  // `key` del subárbol: `NumberField` guarda el texto tecleado en un estado que solo se
  // inicializa al montar, así que sin remontar seguiría mostrando el valor anterior.
  const [version, setVersion] = useState(0);

  const registerField = useCallback((key: string, spec: FieldSpec) => {
    specsRef.current[key] = spec;
  }, []);

  const setValue = useCallback((key: string, value: FieldValue) => {
    setValues((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);

  // Único camino de entrada de valores externos (URL o escenario). Reemplaza el estado en
  // vez de mezclarlo: lo que no venga vuelve a su valor por defecto.
  const applyValues = useCallback((next: FieldValues) => {
    setValues(next);
    setVersion((current) => current + 1);
  }, []);

  const applyInputs = useCallback(
    (inputs: unknown) => {
      applyValues(decodeCalculatorInputs(inputs, specsRef.current));
    },
    [applyValues],
  );

  const getInputs = useCallback(() => completeValues(values, specsRef.current), [values]);

  const flushUrl = useCallback(() => {
    const search = encodeCalculatorState(window.location.search, values, specsRef.current);
    const { origin, pathname, hash } = window.location;
    if (search !== window.location.search) {
      window.history.replaceState(null, "", `${pathname}${search}${hash}`);
    }
    return `${origin}${pathname}${search}${hash}`;
  }, [values]);

  useEffect(() => {
    const specs = specsRef.current;
    setHasFields(Object.keys(specs).length > 0);
    const fromUrl = decodeCalculatorState(window.location.search, specs);
    if (Object.keys(fromUrl).length > 0) applyValues(fromUrl);
    setHydrated(true);
  }, [applyValues]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      const search = encodeCalculatorState(window.location.search, values, specsRef.current);
      if (search === window.location.search) return;
      const { pathname, hash } = window.location;
      window.history.replaceState(null, "", `${pathname}${search}${hash}`);
    }, URL_SYNC_DELAY_MS);
    return () => clearTimeout(timer);
  }, [values, hydrated]);

  const context = useMemo<CalculatorStateContextValue>(
    () => ({ slug, values, hasFields, registerField, setValue, applyInputs, getInputs, flushUrl }),
    [slug, values, hasFields, registerField, setValue, applyInputs, getInputs, flushUrl],
  );

  return (
    <CalculatorStateContext.Provider value={context}>
      {/* La `key` remonta el subárbol al cargar un escenario. */}
      <Fragment key={version}>{children}</Fragment>
      {/* Fuera de la `key` a propósito: la barra conserva su estado al cargar un escenario. */}
      <CalculatorActions />
    </CalculatorStateContext.Provider>
  );
}

/** `null` fuera de un proveedor (páginas que no son calculadoras). */
export function useCalculatorState(): CalculatorStateContextValue | null {
  return useContext(CalculatorStateContext);
}

function useRequiredCalculatorState(): CalculatorStateContextValue {
  const context = useContext(CalculatorStateContext);
  if (!context) {
    throw new Error("Los campos de una calculadora requieren <CalculatorStateProvider>");
  }
  return context;
}

/**
 * Sustituto de `useState(defaultValue)` cuyo valor viaja en la URL y en los escenarios.
 * `key` es el parámetro de la query string: cambiarlo invalida enlaces y escenarios ya guardados.
 */
export function useNumberField(key: string, defaultValue: number): [number, (value: number) => void] {
  const { values, registerField, setValue } = useRequiredCalculatorState();
  registerField(key, { kind: "number", defaultValue });

  const raw = values[key];
  const value = typeof raw === "number" ? raw : defaultValue;
  const set = useCallback((next: number) => setValue(key, next), [setValue, key]);

  return [value, set];
}

/** Como `useNumberField`, validado contra `allowed`: un valor desconocido cae al de por defecto. */
export function useOptionField<T extends string>(
  key: string,
  defaultValue: T,
  allowed: readonly T[],
): [T, (value: T) => void] {
  const { values, registerField, setValue } = useRequiredCalculatorState();
  registerField(key, { kind: "option", defaultValue, allowed });

  const raw = values[key];
  const value = typeof raw === "string" && (allowed as readonly string[]).includes(raw) ? (raw as T) : defaultValue;
  const set = useCallback((next: T) => setValue(key, next), [setValue, key]);

  return [value, set];
}
