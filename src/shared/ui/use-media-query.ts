"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * `true` while the media query matches. On the server and during hydration it returns
 * `serverValue`, so the first render matches; afterwards it follows changes (rotating the phone,
 * resizing the window).
 *
 * `subscribe` is wrapped in `useCallback`: `useSyncExternalStore` unsubscribes and resubscribes
 * whenever it receives a different function, so a new function on every render would remove and
 * re-add the listener on every render.
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
