import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { InstrumentSearchResult } from "@sextante/core/portfolio/types";
import { renderWithIntl } from "@/test/render";

import InstrumentSearchField from "./InstrumentSearchField";
import PositionPanel from "./PositionPanel";

const APPLE: InstrumentSearchResult = { symbol: "AAPL", name: "Apple Inc.", exchange: "NMS", type: "equity" };

vi.mock("@/features/portfolio/api", () => ({
  searchInstruments: vi.fn(() => Promise.resolve([APPLE])),
}));

/** El campo de búsqueda dentro del panel, como en el formulario de alta. */
function SearchInPanel({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState("");
  return (
    <PositionPanel id="panel" labelledBy="title" onClose={onClose}>
      <h2 id="title">Alta</h2>
      <InstrumentSearchField
        id="ticker"
        value={value}
        onChange={setValue}
        onSelect={(result) => setValue(result.symbol)}
        placeholder="Símbolo"
        inputClass=""
      />
    </PositionPanel>
  );
}

describe("InstrumentSearchField dentro de PositionPanel", () => {
  it("Escape con el desplegable abierto solo lo cierra; el siguiente Escape cierra el panel", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithIntl(<SearchInPanel onClose={onClose} />);

    await user.type(screen.getByRole("combobox"), "apple");
    expect(await screen.findByRole("option", { name: /Apple Inc\./ })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox")).toHaveValue("apple");

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("elegir un resultado con el teclado rellena el símbolo exacto", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SearchInPanel onClose={vi.fn()} />);

    await user.type(screen.getByRole("combobox"), "apple");
    await screen.findByRole("option", { name: /Apple Inc\./ });
    await user.keyboard("{ArrowDown}{Enter}");

    expect(screen.getByRole("combobox")).toHaveValue("AAPL");
  });

  it("la opción es el propio elemento seleccionable: sin botones anidados, y se elige con el ratón", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SearchInPanel onClose={vi.fn()} />);

    await user.type(screen.getByRole("combobox"), "apple");
    const option = await screen.findByRole("option", { name: /Apple Inc\./ });
    expect(option.querySelector("button")).toBeNull();

    await user.click(option);
    expect(screen.getByRole("combobox")).toHaveValue("AAPL");
  });
});
