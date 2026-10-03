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
 *   la hidratación y la ruta no se vuelve dinámica. La lectura va en un `useLayoutEffect`
 *   (corre tras montar y ANTES de que el navegador pinte, y después de los de los hijos, que
 *   ya han registrado sus campos): los valores del enlace se ven en el primer pintado del
 *   cliente, sin un fotograma intermedio con los de por defecto.
 * - Se escribe con `history.replaceState`, no con `router.replace`, que sería una navegación
 *   de App Router (pide de nuevo el payload RSC); `replaceState` no recarga ni apila entradas.
 *
 * Los valores externos (URL o escenario) se aplican cambiando el estado, sin remontar los
 * campos: cada `NumberField` resincroniza su texto cuando su `value` cambia desde fuera.
 */
export default function CalculatorStateProvider({ slug, children }: Props) {
  // Ref y no estado: las specs son configuración (no se pintan) y se registran desde los
  // efectos de cada campo; guardarlas en estado provocaría renders inútiles.
  const specsRef = useRef<Record<string, FieldSpec>>({});
  const [values, setValues] = useState<FieldValues>({});
  const [hasFields, setHasFields] = useState(false);
  // Hasta leer la URL no se puede escribir en ella (se borraría).
  const [hydrated, setHydrated] = useState(false);

  const registerField = useCallback((key: string, spec: FieldSpec) => {
    specsRef.current[key] = spec;
  }, []);

  const setValue = useCallback((key: string, value: FieldValue) => {
    setValues((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);

  // Entrada de valores externos de un escenario. Reemplaza el estado en vez de mezclarlo: lo
  // que no venga vuelve a su valor por defecto.
  const applyInputs = useCallback((inputs: unknown) => {
    setValues(decodeCalculatorInputs(inputs, specsRef.current));
  }, []);

  const getInputs = useCallback(() => completeValues(values, specsRef.current), [values]);

  // Única vía de escritura a la URL: la comparten el efecto con retardo y `flushUrl`.
  // Solo llama a `replaceState` si algo cambió, y devuelve el enlace completo.
  const writeUrl = useCallback(() => {
    const search = encodeCalculatorState(window.location.search, values, specsRef.current);
    const { origin, pathname, hash } = window.location;
    if (search !== window.location.search) {
      window.history.replaceState(null, "", `${pathname}${search}${hash}`);
    }
    return `${origin}${pathname}${search}${hash}`;
  }, [values]);

  // Un `setState` dentro de `useLayoutEffect` se aplica de forma síncrona antes de pintar.
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
  // En un efecto y no durante el render: el render debe ser puro (React puede repetirlo o
  // descartarlo en modo estricto o concurrente). `useLayoutEffect` de un hijo corre antes que el
  // del proveedor, así que la spec ya está registrada cuando este lee la URL.
  useLayoutEffect(() => {
    registerField(key, { kind: "number", defaultValue });
  }, [registerField, key, defaultValue]);

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
  // Ver `useNumberField`.
  useLayoutEffect(() => {
    registerField(key, { kind: "option", defaultValue, allowed });
  }, [registerField, key, defaultValue, allowed]);

  const raw = values[key];
  const value = typeof raw === "string" && (allowed as readonly string[]).includes(raw) ? (raw as T) : defaultValue;
  const set = useCallback((next: T) => setValue(key, next), [setValue, key]);

  return [value, set];
}
