import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import DecimalField from "./DecimalField";
import FormField from "./FormField";

function Amount({ label, error }: { label: string; error?: string }) {
  const [value, setValue] = useState("");
  return (
    <FormField label={label} hint="En euros" error={error}>
      {(control) => <DecimalField {...control} value={value} onChange={setValue} />}
    </FormField>
  );
}

describe("FormField + DecimalField", () => {
  it("enlaza etiqueta, ayuda y error con el control, con ids únicos por instancia", () => {
    render(
      <>
        <Amount label="Precio" />
        <Amount label="Comisiones" error="Demasiado alto" />
      </>,
    );

    const price = screen.getByLabelText("Precio");
    const fees = screen.getByLabelText("Comisiones");
    expect(price.id).not.toBe(fees.id);
    expect(price).toHaveAccessibleDescription("En euros");
    expect(price).not.toHaveAttribute("aria-invalid");
    expect(fees).toHaveAccessibleDescription("En euros Demasiado alto");
    expect(fees).toHaveAttribute("aria-invalid", "true");
  });

  it("sanea lo tecleado y abre el teclado decimal", async () => {
    render(<Amount label="Precio" />);
    const input = screen.getByLabelText("Precio");

    await userEvent.type(input, "1a2,5x");

    expect(input).toHaveValue("12,5");
    expect(input).toHaveAttribute("inputmode", "decimal");
  });
});
