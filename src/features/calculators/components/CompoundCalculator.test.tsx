import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { computeCompound } from "@sextante/core/calculators/interes-compuesto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getFormatters } from "@/shared/format/format";
import { renderWithIntl } from "@/test/render";

import es from "../../../../messages/es.json";

import CalculatorStateProvider from "./CalculatorState";
import CompoundCalculator from "./CompoundCalculator";

// The charts (recharts) need layout measurements jsdom does not provide, and the scenario
// panel talks to the API: only the fields and results matter here.
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

/** Value text of a `Stat`, looked up by its label. */
function statValue(label: string): string {
  return screen.getByText(label).parentElement?.textContent?.replace(label, "") ?? "";
}

const { formatEUR } = getFormatters("es");
const texts = es.calc["interes-compuesto"];

describe("CompoundCalculator (bound fields)", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/calculadoras/interes-compuesto");
  });

  it("derives label and help from the field key (calc.<slug>.<key> and help.<key>)", () => {
    renderCompound();

    expect(screen.getByRole("spinbutton", { name: texts.initial })).toHaveValue("5000");
    expect(screen.getByRole("spinbutton", { name: texts.years })).toHaveValue("25");
    // The help (`help.<key>`) is in the DOM even while the popover is closed (`HelpTooltip`).
    expect(screen.getByText(texts.help.initial)).toBeInTheDocument();
    expect(screen.getByText(texts.help.inflationRate)).toBeInTheDocument();
  });

  it("recomputes with typed input and writes it to the URL", async () => {
    const user = userEvent.setup();
    renderCompound();
    const years = screen.getByRole("spinbutton", { name: texts.years });

    await user.clear(years);
    await user.type(years, "10");

    const expected = computeCompound({ ...DEFAULTS, years: 10 }).finalValue;
    expect(statValue(texts.finalValue)).toBe(formatEUR(expected));
    await waitFor(() => expect(window.location.search).toBe("?years=10"));
  });

  it("applies a shared link to fields and results", async () => {
    window.history.replaceState(null, "", "/calculadoras/interes-compuesto?initial=20000&frequency=annual");

    renderCompound();

    await waitFor(() => expect(screen.getByRole("spinbutton", { name: texts.initial })).toHaveValue("20000"));
    expect(screen.getByRole("combobox", { name: es.frequency.label })).toHaveValue("annual");
    const expected = computeCompound({ ...DEFAULTS, initial: 20_000, frequency: "annual" }).finalValue;
    expect(statValue(texts.finalValue)).toBe(formatEUR(expected));
  });
});
