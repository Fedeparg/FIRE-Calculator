import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/render";

import PositionPanel from "./PositionPanel";

/** Página mínima: un botón que abre el panel y otro contenido fuera de él. */
function Page() {
  const [open, setOpen] = useState(false);
  return (
    <main>
      <button type="button" onClick={() => setOpen(true)}>
        abrir
      </button>
      <a href="#fuera">fuera</a>
      {open && (
        <PositionPanel id="panel" labelledBy="titulo" onClose={() => setOpen(false)}>
          <h2 id="titulo">Detalle</h2>
        </PositionPanel>
      )}
    </main>
  );
}

/** Simula una pantalla de escritorio (`lg`) o de móvil. */
function setDesktop(desktop: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: desktop && query.includes("min-width"),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
}

describe("PositionPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.style.overflow = "";
  });

  it("recibe el foco al abrirse y lo devuelve a quien lo abrió al cerrarse", async () => {
    setDesktop(true);
    const user = userEvent.setup();
    renderWithIntl(<Page />);
    const opener = screen.getByRole("button", { name: "abrir" });

    await user.click(opener);
    expect(screen.getByRole("dialog", { name: "Detalle" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("en móvil vuelve inerte el resto de la página y bloquea el scroll mientras está abierto", async () => {
    setDesktop(false);
    const user = userEvent.setup();
    renderWithIntl(<Page />);
    const outside = screen.getByRole("link", { name: "fuera" });

    await user.click(screen.getByRole("button", { name: "abrir" }));
    expect(outside).toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("hidden");

    await user.keyboard("{Escape}");
    expect(outside).not.toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("");
  });

  it("en escritorio no toca el resto de la página (la lista sigue usable al lado)", async () => {
    setDesktop(true);
    const user = userEvent.setup();
    renderWithIntl(<Page />);

    await user.click(screen.getByRole("button", { name: "abrir" }));
    expect(screen.getByRole("link", { name: "fuera" })).not.toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("");
  });
});
