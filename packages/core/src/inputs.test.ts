import { describe, expect, it } from "vitest";
import { computeMortgage } from "./calculators/hipoteca.js";
import { estimateNetSalary } from "./fiscal/irpf.js";
import { MAX_HORIZON_YEARS, clampYears } from "./inputs.js";
import { project } from "./projection.js";

describe("clampYears", () => {
  it("redondea y acota al rango [min, MAX_HORIZON_YEARS]", () => {
    expect(clampYears(10.4)).toBe(10);
    expect(clampYears(-3)).toBe(0);
    expect(clampYears(0, 1)).toBe(1);
    expect(clampYears(1e9)).toBe(MAX_HORIZON_YEARS);
  });

  it("NaN cuenta como 0 y ±Infinity se acota", () => {
    expect(clampYears(Number.NaN)).toBe(0);
    expect(clampYears(Number.NaN, 1)).toBe(1);
    expect(clampYears(Infinity)).toBe(MAX_HORIZON_YEARS);
    expect(clampYears(-Infinity, 1)).toBe(1);
  });
});

describe("plazos infinitos no cuelgan las calculadoras", () => {
  it("project devuelve una serie del tamaño del tope", () => {
    const { series } = project({ initial: 1000, contribution: 0, frequency: "annual", annualRate: 5, years: Infinity });
    expect(series).toHaveLength(MAX_HORIZON_YEARS + 1);
  });

  it("la hipoteca a plazo infinito se calcula al tope", () => {
    const r = computeMortgage({ principal: 100000, annualRate: 3, years: Infinity });
    expect(r.schedule).toHaveLength(MAX_HORIZON_YEARS);
    expect(Number.isFinite(r.monthlyPayment)).toBe(true);
  });
});

describe("personas a cargo infinitas no cuelgan el mínimo personal", () => {
  it("children = Infinity termina y da un neto finito", () => {
    const r = estimateNetSalary({
      grossAnnual: 40000,
      children: Infinity,
      childrenUnder3: Infinity,
      ascendants: Infinity,
    });
    expect(Number.isFinite(r.netPerPayment)).toBe(true);
  });
});
