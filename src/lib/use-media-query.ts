"use client";

import { useSyncExternalStore } from "react";

/**
 * `true` mientras la media query se cumple. En el servidor y en la hidratación devuelve
 * `serverValue`, para que el primer render coincida; después sigue los cambios (girar el móvil,
 * redimensionar la ventana).
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}
