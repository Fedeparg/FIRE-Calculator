"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Suscriptores de este módulo: `storage` solo avisa a OTRAS pestañas, no a la que escribe. */
const listeners = new Set<() => void>();

/** Respaldo en memoria para cuando `localStorage` no está disponible (modo privado, bloqueado). */
const memory = new Map<string, boolean>();

function read(key: string): boolean {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored !== null) return stored === "1";
  } catch {
    // localStorage inaccesible: se usa el respaldo en memoria.
  }
  return memory.get(key) ?? false;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * Preferencia booleana por visor, guardada en `localStorage` (nunca viaja al servidor).
 *
 * Se lee con `useSyncExternalStore` en vez de un `useEffect` + `useState`: el servidor y la
 * hidratación ven siempre `false` (sin desajuste) y el valor guardado aparece justo después,
 * sin un render intermedio con estado incoherente. Si el almacenamiento falla, la preferencia
 * sigue funcionando durante la sesión gracias al respaldo en memoria.
 */
export function useStoredBoolean(key: string): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => false,
  );
  const set = useCallback(
    (next: boolean) => {
      memory.set(key, next);
      try {
        window.localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // Sin persistencia: el respaldo en memoria basta para esta sesión.
      }
      listeners.forEach((listener) => listener());
    },
    [key],
  );
  return [value, set];
}
