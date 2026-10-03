import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { renderWithIntl } from "@/test/render";

import NumberField from "./NumberField";

/** Controlled field, as the calculators use it, with its numeric value shown. */
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
  it("accepts the Spanish decimal comma and emits the number", async () => {
    const user = userEvent.setup();
    renderWithIntl(<Controlled />);
    const field = screen.getByRole("spinbutton", { name: "Tipo" });

    await user.clear(field);
    await user.type(field, "3,25");

    expect(field).toHaveValue("3,25");
    expect(screen.getByLabelText("valor")).toHaveTextContent("3.25");
  });

  it("allows clearing the field while editing and sets it to 0 on blur", async () => {
    const user = userEvent.setup();
    renderWithIntl(<Controlled />);
    const field = screen.getByRole("spinbutton", { name: "Tipo" });

    await user.clear(field);
    expect(field).toHaveValue("");
    await user.tab();

    expect(field).toHaveValue("0");
    expect(screen.getByLabelText("valor")).toHaveTextContent("0");
  });

  it("does not allow typing letters", async () => {
    const user = userEvent.setup();
    renderWithIntl(<Controlled />);
    const field = screen.getByRole("spinbutton", { name: "Tipo" });

    await user.clear(field);
    await user.type(field, "1a2");

    expect(field).toHaveValue("12");
  });

  it("resyncs the text when the value changes from outside, without remounting", async () => {
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
    // Same node: it has not remounted.
    expect(screen.getByRole("spinbutton", { name: "Tipo" })).toBe(field);
  });

  it("does not overwrite what is being typed when the value is its own echo", async () => {
    const user = userEvent.setup();
    renderWithIntl(<Controlled />);
    const field = screen.getByRole("spinbutton", { name: "Tipo" });

    await user.clear(field);
    await user.type(field, "3,");

    expect(field).toHaveValue("3,");
    expect(screen.getByLabelText("valor")).toHaveTextContent("3");
  });

  it("arrow keys step up and down, without going below the minimum", async () => {
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
