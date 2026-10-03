// DOM matchers (`toHaveTextContent`, `toHaveValue`, `toBeInTheDocument`…) for `expect`.
import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Without `globals: true`, Testing Library does not register its automatic cleanup: whatever each
// test rendered is unmounted here so the DOM does not pile up across tests.
afterEach(() => {
  cleanup();
});

// jsdom does not implement `matchMedia`. By default no media query matches (narrow screen, no
// preferences); a test that needs something else overrides it with `vi.spyOn(window, "matchMedia")`.
if (typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}
