import { describe, expect, it } from "vitest";
import { computeSelfEmployedTax } from "./irpf-autonomos.js";

describe("computeSelfEmployedTax", () => {
  it("net income = revenue − expenses − self-employed social security fee", () => {
    const r = computeSelfEmployedTax({ income: 40000, expenses: 8000, socialSecurity: 4000 });
    expect(r.netIncome).toBe(28000);
  });

  it("component defaults (golden, simplified direct assessment)", () => {
    const r = computeSelfEmployedTax({
      income: 40000,
      expenses: 8000,
      socialSecurity: 4000,
      age: 30,
      simplifiedRegime: true,
    });
    expect(r.grossNetIncome).toBe(28000);
    expect(r.difficultExpenses).toBe(1400); // 5% of 28,000
    expect(r.netIncome).toBe(26600);
    expect(r.personalMinimum).toBe(5550);
    expect(r.taxableBase).toBe(26600);
    expect(r.incomeTax).toBe(5091);
    expect(r.netAfterTax).toBe(21509);
    expect(r.effectiveRate).toBeCloseTo(19.139097744, 6);
    expect(r.marginalRate).toBe(30);
  });

  it("family circumstances raise the minimum and lower the IRPF", () => {
    const solo = computeSelfEmployedTax({ income: 40000, expenses: 8000, socialSecurity: 4000 });
    const familia = computeSelfEmployedTax({
      income: 40000,
      expenses: 8000,
      socialSecurity: 4000,
      children: 2,
      childrenUnder3: 1,
    });
    expect(familia.personalMinimum).toBe(13450); // 5550 + 2400 + 2700 + 2800
    expect(familia.incomeTax).toBe(3960);
    expect(familia.incomeTax).toBeLessThan(solo.incomeTax);
  });

  it("joint filing reduces the base by €3,400", () => {
    const ind = computeSelfEmployedTax({ income: 40000, expenses: 8000, socialSecurity: 4000 });
    const conj = computeSelfEmployedTax({ income: 40000, expenses: 8000, socialSecurity: 4000, jointReturn: true });
    expect(conj.taxableBase).toBe(ind.taxableBase - 3400);
    expect(conj.incomeTax).toBeLessThan(ind.incomeTax);
  });

  it("does not allow a negative net income", () => {
    const r = computeSelfEmployedTax({ income: 5000, expenses: 8000, socialSecurity: 4000 });
    expect(r.netIncome).toBe(0);
    expect(r.incomeTax).toBe(0);
  });

  it("contributing to a pension plan reduces the IRPF", () => {
    const sin = computeSelfEmployedTax({ income: 40000, expenses: 5000, socialSecurity: 4000 });
    const con = computeSelfEmployedTax({
      income: 40000,
      expenses: 5000,
      socialSecurity: 4000,
      pensionContribution: 1500,
    });
    expect(con.incomeTax).toBeLessThan(sin.incomeTax);
  });

  it("exposes consistent effective and marginal rates", () => {
    const r = computeSelfEmployedTax({ income: 50000, expenses: 10000, socialSecurity: 4000 });
    expect(r.effectiveRate).toBeGreaterThan(0);
    expect(r.marginalRate).toBeGreaterThanOrEqual(r.effectiveRate);
  });

  it("without simplified direct assessment it does not apply hard-to-justify expenses", () => {
    const r = computeSelfEmployedTax({ income: 40000, expenses: 8000, socialSecurity: 4000 });
    expect(r.grossNetIncome).toBe(28000);
    expect(r.difficultExpenses).toBe(0);
    expect(r.netIncome).toBe(28000);
  });

  it("simplified direct assessment: 5% of the prior net income", () => {
    const r = computeSelfEmployedTax({ income: 40000, expenses: 8000, socialSecurity: 4000, simplifiedRegime: true });
    expect(r.grossNetIncome).toBe(28000);
    expect(r.difficultExpenses).toBe(1400); // 5% of 28,000
    expect(r.netIncome).toBe(26600);
  });

  it("simplified direct assessment: €2,000 cap on hard-to-justify expenses", () => {
    const r = computeSelfEmployedTax({ income: 80000, expenses: 8000, socialSecurity: 4000, simplifiedRegime: true });
    expect(r.grossNetIncome).toBe(68000);
    expect(r.difficultExpenses).toBe(2000); // 5% would be 3,400 → capped at 2,000
    expect(r.netIncome).toBe(66000);
  });

  it("hard-to-justify expenses reduce the IRPF", () => {
    const normal = computeSelfEmployedTax({ income: 40000, expenses: 8000, socialSecurity: 4000 });
    const simplificada = computeSelfEmployedTax({
      income: 40000,
      expenses: 8000,
      socialSecurity: 4000,
      simplifiedRegime: true,
    });
    expect(simplificada.incomeTax).toBeLessThan(normal.incomeTax);
  });
});
