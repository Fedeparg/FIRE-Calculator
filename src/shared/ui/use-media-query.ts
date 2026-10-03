"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * `true` mientras la media query se cumple. En el servidor y en la hidratación devuelve
 * `serverValue`, para que el primer render coincida; después sigue los cambios (girar el móvil,
 * redimensionar la ventana).
 *
 * `subscribe` va en `useCallback`: `useSyncExternalStore` se desuscribe y vuelve a suscribirse
 * cada vez que recibe una función distinta, así que una función nueva en cada render quitaría y
 * pondría el listener en cada render.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}
