import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import NumberField from "@/shared/ui/NumberField";
import { renderWithIntl } from "@/test/render";

import CalculatorStateProvider, { useCalculatorState, useNumberField, useOptionField } from "./CalculatorState";

// El panel de escenarios habla con la API; aquí lo sustituye un botón que carga un escenario por
// el mismo camino que el real (`applyInputs`).
vi.mock("./ScenarioPanel", () => ({
  default: function FakeScenarioPanel() {
    const state = useCalculatorState();
    return (
      <button type="button" onClick={() => state?.applyInputs({ principal: 250_000, mode: "b" })}>
        cargar escenario
      </button>
    );
  },
}));

/** Calculadora mínima: un campo numérico y uno de opción, y su resultado. */
function FakeCalculator() {
  const [principal, setPrincipal] = useNumberField("principal", 100_000);
  const [mode] = useOptionField("mode", "a", ["a", "b"] as const);
  return (
    <>
      <NumberField label="Capital" value={principal} onChange={setPrincipal} />
      <output aria-label="resultado">{`${principal}-${mode}`}</output>
    </>
  );
}

function renderCalculator() {
  return renderWithIntl(
    <CalculatorStateProvider slug="prueba">
      <FakeCalculator />
    </CalculatorStateProvider>,
  );
}

describe("CalculatorStateProvider", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/calculadoras/prueba");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("aplica los valores de un enlace compartido al campo y al resultado", async () => {
    window.history.replaceState(null, "", "/calculadoras/prueba?principal=180000&mode=b");

    renderCalculator();

    await waitFor(() => expect(screen.getByLabelText("resultado")).toHaveTextContent("180000-b"));
    expect(screen.getByRole("spinbutton", { name: "Capital" })).toHaveValue("180000");
  });

  it("sin query usa los valores por defecto", () => {
    renderCalculator();

    expect(screen.getByLabelText("resultado")).toHaveTextContent("100000-a");
    expect(screen.getByRole("spinbutton", { name: "Capital" })).toHaveValue("100000");
  });

  it("lo tecleado llega al resultado y a la URL (solo lo que difiere del defecto)", async () => {
    const user = userEvent.setup();
    renderCalculator();
    const field = screen.getByRole("spinbutton", { name: "Capital" });

    await user.clear(field);
    await user.type(field, "120000");

    expect(screen.getByLabelText("resultado")).toHaveTextContent("120000-a");
    await waitFor(() => expect(window.location.search).toBe("?principal=120000"));
  });

  it("cargar un escenario reemplaza los valores y resincroniza el texto del campo", async () => {
    const user = userEvent.setup();
    renderCalculator();
    const field = screen.getByRole("spinbutton", { name: "Capital" });
    await user.clear(field);
    await user.type(field, "5");

    await act(async () => {
      await user.click(screen.getByRole("button", { name: "cargar escenario" }));
    });

    expect(screen.getByLabelText("resultado")).toHaveTextContent("250000-b");
    expect(screen.getByRole("spinbutton", { name: "Capital" })).toHaveValue("250000");
  });
});
