import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { renderWithIntl } from "@/test/render";

import NumberField from "./NumberField";

/** Campo controlado, como lo usan las calculadoras, con su valor numérico visible. */
function Controlled({ initial = 10 }: { initial?: number }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <NumberField label="Tipo" value={value} onChange={setValue} step={0.5} />
      <output aria-label="valor">{String(value)}</output>
    </>
  );
}

describe("NumberField", () => {
  it("acepta la coma decimal del castellano y emite el número", async () => {
    const user = userEvent.setup();
    renderWithIntl(<Controlled />);
    const field = screen.getByRole("spinbutton", { name: "Tipo" });

    await user.clear(field);
    await user.type(field, "3,25");

    expect(field).toHaveValue("3,25");
    expect(screen.getByLabelText("valor")).toHaveTextContent("3.25");
  });

  it("permite vaciar el campo mientras se edita y al salir lo deja en 0", async () => {
    const user = userEvent.setup();
    renderWithIntl(<Controlled />);
    const field = screen.getByRole("spinbutton", { name: "Tipo" });

    await user.clear(field);
    expect(field).toHaveValue("");
    await user.tab();

    expect(field).toHaveValue("0");
    expect(screen.getByLabelText("valor")).toHaveTextContent("0");
  });

  it("no deja escribir letras", async () => {
    const user = userEvent.setup();
    renderWithIntl(<Controlled />);
    const field = screen.getByRole("spinbutton", { name: "Tipo" });

    await user.clear(field);
    await user.type(field, "1a2");

    expect(field).toHaveValue("12");
  });

  it("resincroniza el texto cuando el valor cambia desde fuera, sin remontar", async () => {
    const user = userEvent.setup();
    function External() {
      const [value, setValue] = useState(10);
      return (
        <>
          <NumberField label="Tipo" value={value} onChange={setValue} />
          <button type="button" onClick={() => setValue(42.5)}>
            externo
          </button>
        </>
      );
    }
    renderWithIntl(<External />);
    const field = screen.getByRole("spinbutton", { name: "Tipo" });

    await user.click(screen.getByRole("button", { name: "externo" }));

    expect(field).toHaveValue("42,5");
    // Es el mismo nodo: no se ha remontado.
    expect(screen.getByRole("spinbutton", { name: "Tipo" })).toBe(field);
  });

  it("no pisa lo que se está tecleando cuando el valor es su propio eco", async () => {
    const user = userEvent.setup();
    renderWithIntl(<Controlled />);
    const field = screen.getByRole("spinbutton", { name: "Tipo" });

    await user.clear(field);
    await user.type(field, "3,");

    expect(field).toHaveValue("3,");
    expect(screen.getByLabelText("valor")).toHaveTextContent("3");
  });

  it("las flechas suben y bajan el paso, sin bajar del mínimo", async () => {
    const user = userEvent.setup();
    renderWithIntl(<Controlled initial={0.5} />);
    const field = screen.getByRole("spinbutton", { name: "Tipo" });

    await user.click(field);
    await user.keyboard("{ArrowUp}");
    expect(field).toHaveValue("1");
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(field).toHaveValue("0");
  });
});
