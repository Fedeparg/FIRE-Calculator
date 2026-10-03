// Matchers del DOM (`toHaveTextContent`, `toHaveValue`, `toBeInTheDocument`…) para `expect`.
import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Sin `globals: true`, Testing Library no registra su limpieza automática: se desmonta aquí lo
// renderizado en cada test para que el DOM no se acumule entre tests.
afterEach(() => {
  cleanup();
});
