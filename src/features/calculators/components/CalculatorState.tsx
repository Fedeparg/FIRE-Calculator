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
 * Estado compartido de una calculadora: qué campos tiene y cuánto vale cada uno.
 *
 * Existe para que dos funciones transversales —compartir el cálculo por URL y guardarlo
 * como escenario en la cuenta— se implementen UNA vez y no calculadora a calculadora. Cada
 * campo se declara con `useNumberField`/`useOptionField` en lugar de `useState`, y a cambio
 * de esa única línea queda en la query string, se puede copiar en un enlace y se puede
 * guardar y recargar desde la cuenta.
 */
type CalculatorStateContextValue = {
  /** Slug de la calculadora (`src/features/calculators/registry.ts`): identifica sus escenarios guardados. */
  slug: string;
  /** Valores actuales. Solo contiene los campos que difieren de su valor por defecto. */
  values: FieldValues;
  /** Si la calculadora ha declarado algún campo (las que no, no comparten ni guardan nada). */
  hasFields: boolean;
  registerField: (key: string, spec: FieldSpec) => void;
  setValue: (key: string, value: FieldValue) => void;
  /** Aplica unos `inputs` sin validar (URL o escenario guardado). Ver `applyValues`. */
  applyInputs: (inputs: unknown) => void;
  /** Estado completo (con los valores por defecto) para guardarlo como escenario. */
  getInputs: () => FieldValues;
  /**
   * Escribe la URL YA, sin esperar al retardo, y devuelve el enlace completo. Lo usa el
   * botón de copiar: si esperase al retardo se podría copiar una URL sin la última tecla.
   */
  flushUrl: () => string;
};

const CalculatorStateContext = createContext<CalculatorStateContextValue | null>(null);

/**
 * Cuánto se espera, tras la última pulsación, para reescribir la URL. `replaceState` no
 * navega, pero los navegadores limitan cuántas veces por segundo se puede llamar; con esto
 * escribir en un campo genera una sola entrada al terminar de teclear.
 */
const URL_SYNC_DELAY_MS = 250;

type Props = {
  slug: string;
  children: React.ReactNode;
};

/**
 * Proveedor del estado de la calculadora. Lo monta `CalculatorShell`, que es el único sitio
 * por el que pasan TODAS las páginas de calculadora y el que conoce el slug.
 *
 * Sincronización con la URL:
 *
 * - **Se lee** de `window.location.search` en un efecto de montaje, no con `useSearchParams`.
 *   La página es estática (ISR con `revalidate`), así que el primer render —servidor y
 *   cliente— usa siempre los valores por defecto: si el estado inicial dependiese de la URL,
 *   el HTML prerenderizado no coincidiría con la hidratación. Leerlo después del montaje
 *   mantiene el prerenderizado intacto y evita que la ruta se vuelva dinámica.
 * - **Se escribe** con `history.replaceState`, no con el router: cambiar la query string con
 *   `router.replace` es una navegación de App Router (vuelve a pedir el payload RSC de la
 *   ruta) y aquí solo queremos reflejar el estado en la barra de direcciones. `replaceState`
 *   no navega, no recarga, no mueve el scroll y no apila una entrada por pulsación. Para
 *   navegar de verdad se sigue usando el `Link` de `@/i18n/navigation`.
 */
export default function CalculatorStateProvider({ slug, children }: Props) {
  // Los campos que ha declarado la calculadora. Es un ref porque se rellena DURANTE el
  // render de los hijos (cada hook se registra al renderizarse), y actualizar estado en ese
  // momento provocaría un bucle de renders.
  const specsRef = useRef<Record<string, FieldSpec>>({});
  const [values, setValues] = useState<FieldValues>({});
  const [hasFields, setHasFields] = useState(false);
  // Ya se ha leído la URL: hasta entonces no se puede escribir en ella (la borraríamos).
  const [hydrated, setHydrated] = useState(false);
  /**
   * Cambia cada vez que los valores se aplican de golpe (URL o escenario) y sirve de `key`
   * del subárbol, forzando su remontaje. Hace falta porque `NumberField` mantiene el texto
   * que se está tecleando en un estado propio que solo se inicializa al montar: sin
   * remontar, el campo seguiría enseñando el valor anterior aunque el estado ya fuese otro.
   */
  const [version, setVersion] = useState(0);

  const registerField = useCallback((key: string, spec: FieldSpec) => {
    specsRef.current[key] = spec;
  }, []);

  const setValue = useCallback((key: string, value: FieldValue) => {
    setValues((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);

  /**
   * Camino ÚNICO por el que entran unos valores de fuera: la URL al abrir la página y los
   * `inputs` de un escenario guardado. Reemplaza el estado entero en vez de mezclarlo, para
   * que lo que no venga vuelva a su valor por defecto y el cálculo se reproduzca tal cual.
   */
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

  // Lectura inicial de la URL, una sola vez tras el montaje (ver el comentario del componente).
  useEffect(() => {
    const specs = specsRef.current;
    setHasFields(Object.keys(specs).length > 0);
    const fromUrl = decodeCalculatorState(window.location.search, specs);
    if (Object.keys(fromUrl).length > 0) applyValues(fromUrl);
    setHydrated(true);
  }, [applyValues]);

  // Escritura de la URL, con retardo para no llamar a `replaceState` en cada pulsación.
  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      const search = encodeCalculatorState(window.location.search, values, specsRef.current);
      if (search === window.location.search) return;
      // Se reescribe solo la query: la ruta y el ancla (los enlaces del bloque de la wiki)
      // se conservan tal cual.
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
      {/* La `key` remonta el subárbol al cargar un escenario; el proveedor no se remonta. */}
      <Fragment key={version}>{children}</Fragment>
      {/* Fuera de la `key` a propósito: la barra conserva su estado al cargar un escenario. */}
      <CalculatorActions />
    </CalculatorStateContext.Provider>
  );
}

/**
 * Estado de la calculadora para la barra de acciones (copiar enlace, escenarios). Devuelve
 * `null` fuera de un proveedor, que es lo que ocurre en las páginas que no son calculadoras.
 */
export function useCalculatorState(): CalculatorStateContextValue | null {
  return useContext(CalculatorStateContext);
}

/** Igual, pero para los hooks de campo, que solo tienen sentido dentro de una calculadora. */
function useRequiredCalculatorState(): CalculatorStateContextValue {
  const context = useContext(CalculatorStateContext);
  if (!context) {
    throw new Error("Los campos de una calculadora requieren <CalculatorStateProvider>");
  }
  return context;
}

/**
 * Campo numérico de una calculadora. Sustituto directo de `useState(defaultValue)`: misma
 * tupla `[valor, setter]`, pero el valor viaja en la URL y en los escenarios guardados.
 *
 * `key` es el nombre del parámetro en la query string: en inglés, estable y descriptivo,
 * porque forma parte de los enlaces que la gente comparte. Cambiarlo invalida los enlaces
 * ya compartidos y los escenarios guardados de esa calculadora.
 */
export function useNumberField(key: string, defaultValue: number): [number, (value: number) => void] {
  const { values, registerField, setValue } = useRequiredCalculatorState();
  registerField(key, { kind: "number", defaultValue });

  const raw = values[key];
  const value = typeof raw === "number" ? raw : defaultValue;
  const set = useCallback((next: number) => setValue(key, next), [setValue, key]);

  return [value, set];
}

/**
 * Campo de opciones de una calculadora (frecuencia, comunidad autónoma…). Como
 * `useNumberField`, pero el valor se valida contra la lista cerrada `allowed`, así que un
 * valor desconocido en la URL cae al valor por defecto.
 */
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
