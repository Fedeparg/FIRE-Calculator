// Matchers del DOM (`toHaveTextContent`, `toHaveValue`, `toBeInTheDocument`…) para `expect`.
import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Sin `globals: true`, Testing Library no registra su limpieza automática: se desmonta aquí lo
// renderizado en cada test para que el DOM no se acumule entre tests.
afterEach(() => {
  cleanup();
});

// jsdom no implementa `matchMedia`. Por defecto ninguna media query se cumple (pantalla estrecha,
// sin preferencias); un test que necesite otra cosa la sustituye con `vi.spyOn(window, "matchMedia")`.
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
