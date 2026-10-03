import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { computeCompound } from "@sextante/core/calculators/interes-compuesto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getFormatters } from "@/shared/format/format";
import { renderWithIntl } from "@/test/render";

import es from "../../../../messages/es.json";

import CalculatorStateProvider from "./CalculatorState";
import CompoundCalculator from "./CompoundCalculator";

// Las gráficas (recharts) necesitan medidas de layout que jsdom no tiene, y el panel de
// escenarios habla con la API: aquí solo interesan los campos y los resultados.
vi.mock("@/shared/charts/TimeSeriesChart", () => ({ default: () => null }));
vi.mock("@/shared/charts/BreakdownDonut", () => ({ default: () => null }));
vi.mock("./ScenarioPanel", () => ({ default: () => null }));

const DEFAULTS = {
  initial: 5000,
  contribution: 300,
  frequency: "monthly",
  compounding: "annual",
  annualRate: 7,
  years: 25,
  annualFee: 0,
  contributionGrowth: 0,
  inflationRate: 0,
} as const;

function renderCompound() {
  return renderWithIntl(
    <CalculatorStateProvider slug="interes-compuesto">
      <CompoundCalculator />
    </CalculatorStateProvider>,
  );
}

/** Texto del valor de un `Stat` a partir de su etiqueta. */
function statValue(label: string): string {
  return screen.getByText(label).parentElement?.textContent?.replace(label, "") ?? "";
}

const { formatEUR } = getFormatters("es");
const texts = es.calc["interes-compuesto"];

describe("CompoundCalculator (campos enlazados)", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/calculadoras/interes-compuesto");
  });

  it("deriva etiqueta y ayuda de la clave del campo (calc.<slug>.<clave> y help.<clave>)", () => {
    renderCompound();

    expect(screen.getByRole("spinbutton", { name: texts.initial })).toHaveValue("5000");
    expect(screen.getByRole("spinbutton", { name: texts.years })).toHaveValue("25");
    // La ayuda (`help.<clave>`) está en el DOM aunque el popover esté cerrado (`HelpTooltip`).
    expect(screen.getByText(texts.help.initial)).toBeInTheDocument();
    expect(screen.getByText(texts.help.inflationRate)).toBeInTheDocument();
  });

  it("recalcula con lo tecleado y lo escribe en la URL", async () => {
    const user = userEvent.setup();
    renderCompound();
    const years = screen.getByRole("spinbutton", { name: texts.years });

    await user.clear(years);
    await user.type(years, "10");

    const expected = computeCompound({ ...DEFAULTS, years: 10 }).finalValue;
    expect(statValue(texts.finalValue)).toBe(formatEUR(expected));
    await waitFor(() => expect(window.location.search).toBe("?years=10"));
  });

  it("aplica un enlace compartido a campos y resultados", async () => {
    window.history.replaceState(null, "", "/calculadoras/interes-compuesto?initial=20000&frequency=annual");

    renderCompound();

    await waitFor(() => expect(screen.getByRole("spinbutton", { name: texts.initial })).toHaveValue("20000"));
    expect(screen.getByRole("combobox", { name: es.frequency.label })).toHaveValue("annual");
    const expected = computeCompound({ ...DEFAULTS, initial: 20_000, frequency: "annual" }).finalValue;
    expect(statValue(texts.finalValue)).toBe(formatEUR(expected));
  });
});
