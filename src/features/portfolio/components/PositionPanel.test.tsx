import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/render";

import PositionPanel from "./PositionPanel";

/** Minimal page: a button that opens the panel and other content outside it. */
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

/** Simulates a desktop (`lg`) or mobile screen. */
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

  it("receives focus on open and returns it to the opener on close", async () => {
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

  it("on mobile makes the rest of the page inert and locks scrolling while open", async () => {
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

  it("on mobile returns focus to the opener once it is no longer inert", async () => {
    setDesktop(false);
    const user = userEvent.setup();
    renderWithIntl(<Page />);
    const opener = screen.getByRole("button", { name: "abrir" });
    await user.click(opener);

    // jsdom does not prevent focusing an inert element, but the browser does: we check that, at the
    // moment focus is returned, the button is no longer inside an `inert` subtree.
    const focusedWhileInert: boolean[] = [];
    const focus = HTMLElement.prototype.focus;
    vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (this: HTMLElement, options) {
      if (this === opener) focusedWhileInert.push(this.closest("[inert]") !== null);
      focus.call(this, options);
    });

    await user.keyboard("{Escape}");
    await vi.waitFor(() => expect(opener).toHaveFocus());
    expect(focusedWhileInert).toEqual([false]);
  });

  it("on desktop leaves the rest of the page alone (the list stays usable alongside)", async () => {
    setDesktop(true);
    const user = userEvent.setup();
    renderWithIntl(<Page />);

    await user.click(screen.getByRole("button", { name: "abrir" }));
    expect(screen.getByRole("link", { name: "fuera" })).not.toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("");
  });
});
