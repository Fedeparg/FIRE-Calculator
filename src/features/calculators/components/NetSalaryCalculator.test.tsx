import { screen, within } from "@testing-library/react";
import { estimateNetSalary } from "@sextante/core/fiscal/irpf";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getFormatters } from "@/shared/format/format";
import { renderWithIntl } from "@/test/render";

import es from "../../../../messages/es.json";

import CalculatorStateProvider from "./CalculatorState";
import NetSalaryCalculator from "./NetSalaryCalculator";

vi.mock("./ScenarioPanel", () => ({ default: () => null }));

const texts = es.calc["salario-bruto-neto"];
const { formatEUR } = getFormatters("es");

function renderNetSalary() {
  return renderWithIntl(
    <CalculatorStateProvider slug="salario-bruto-neto">
      <NetSalaryCalculator />
    </CalculatorStateProvider>,
  );
}

describe("NetSalaryCalculator (CalculatorLayout agrupado)", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/calculadoras/salario-bruto-neto?grossAnnual=42000&children=2");
  });

  it("reparte los campos en sus dos grupos con título", () => {
    renderNetSalary();

    const basic = screen.getByRole("heading", { name: texts.groupBasic }).closest("section");
    const personal = screen.getByRole("heading", { name: texts.groupPersonal }).closest("section");
    if (!basic || !personal) throw new Error("Faltan las secciones de los grupos");
    expect(within(basic).getByRole("spinbutton", { name: texts.grossAnnual })).toHaveValue("42000");
    expect(within(personal).getByRole("spinbutton", { name: texts.children })).toHaveValue("2");
  });

  it("calcula con los valores del enlace", () => {
    renderNetSalary();

    const expected = estimateNetSalary({
      grossAnnual: 42_000,
      payments: 14,
      contractType: "indefinido",
      region: undefined,
      age: 30,
      children: 2,
      childrenUnder3: 0,
      ascendants: 0,
      disability: "none",
      jointReturn: false,
      pensionContribution: 0,
    });
    const stat = screen.getByText(texts.netAnnual).parentElement?.textContent ?? "";
    expect(stat.replace(texts.netAnnual, "")).toBe(formatEUR(expected.netAnnual));
  });
});
