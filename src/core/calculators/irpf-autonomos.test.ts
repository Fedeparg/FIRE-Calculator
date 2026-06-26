import { describe, expect, it } from "vitest";
import { computeSelfEmployedTax } from "./irpf-autonomos";

describe("computeSelfEmployedTax", () => {
  it("rendimiento neto = ingresos − gastos − cuota autónomos", () => {
    const r = computeSelfEmployedTax({ income: 40000, expenses: 8000, socialSecurity: 4000 });
    expect(r.netIncome).toBe(28000);
  });

  it("valores por defecto del componente (golden)", () => {
    const r = computeSelfEmployedTax({ income: 40000, expenses: 8000, socialSecurity: 4000, age: 30 });
    expect(r.netIncome).toBe(28000);
    expect(r.personalMinimum).toBe(5550);
    expect(r.taxableBase).toBe(28000);
    expect(r.incomeTax).toBe(5511);
    expect(r.netAfterTax).toBe(22489);
    expect(r.effectiveRate).toBeCloseTo(19.682142857, 6);
    expect(r.marginalRate).toBe(30);
  });

  it("las circunstancias familiares aumentan el mínimo y bajan el IRPF", () => {
    const solo = computeSelfEmployedTax({ income: 40000, expenses: 8000, socialSecurity: 4000 });
    const familia = computeSelfEmployedTax({ income: 40000, expenses: 8000, socialSecurity: 4000, children: 2, childrenUnder3: 1 });
    expect(familia.personalMinimum).toBe(13450); // 5550 + 2400 + 2700 + 2800
    expect(familia.incomeTax).toBe(3960);
    expect(familia.incomeTax).toBeLessThan(solo.incomeTax);
  });

  it("la tributación conjunta reduce la base 3.400 €", () => {
    const ind = computeSelfEmployedTax({ income: 40000, expenses: 8000, socialSecurity: 4000 });
    const conj = computeSelfEmployedTax({ income: 40000, expenses: 8000, socialSecurity: 4000, jointReturn: true });
    expect(conj.taxableBase).toBe(ind.taxableBase - 3400);
    expect(conj.incomeTax).toBeLessThan(ind.incomeTax);
  });

  it("no permite rendimiento neto negativo", () => {
    const r = computeSelfEmployedTax({ income: 5000, expenses: 8000, socialSecurity: 4000 });
    expect(r.netIncome).toBe(0);
    expect(r.incomeTax).toBe(0);
  });

  it("aportar a un plan de pensiones reduce el IRPF", () => {
    const sin = computeSelfEmployedTax({ income: 40000, expenses: 5000, socialSecurity: 4000 });
    const con = computeSelfEmployedTax({ income: 40000, expenses: 5000, socialSecurity: 4000, pensionContribution: 1500 });
    expect(con.incomeTax).toBeLessThan(sin.incomeTax);
  });

  it("expone tipo efectivo y marginal coherentes", () => {
    const r = computeSelfEmployedTax({ income: 50000, expenses: 10000, socialSecurity: 4000 });
    expect(r.effectiveRate).toBeGreaterThan(0);
    expect(r.marginalRate).toBeGreaterThanOrEqual(r.effectiveRate);
  });
});
