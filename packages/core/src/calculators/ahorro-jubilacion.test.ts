import { describe, expect, it } from "vitest";
import { computeRetirement } from "./ahorro-jubilacion.js";

const base = {
  currentAge: 30,
  retirementAge: 65,
  currentSavings: 10000,
  monthlySavings: 300,
  annualReturn: 5,
};

describe("computeRetirement", () => {
  it("calcula los años hasta la jubilación", () => {
    expect(computeRetirement(base).yearsToRetirement).toBe(35);
  });

  it("genera patrimonio por encima de lo aportado con rentabilidad positiva", () => {
    const r = computeRetirement(base);
    expect(r.finalValue).toBeGreaterThan(r.totalContributed);
  });

  it("sin inflación, la renta mensual (real) sale del valor nominal con la regla del 4 %", () => {
    const r = computeRetirement(base);
    expect(r.finalRealValue).toBeCloseTo(r.finalValue, 6);
    expect(r.monthlyIncome).toBeCloseTo((r.finalRealValue * 0.04) / 12, 6);
  });

  it("la inflación reduce el valor real y separa la renta real de la nominal", () => {
    const r = computeRetirement({ ...base, inflationRate: 2.5 });
    expect(r.finalRealValue).toBeLessThan(r.finalValue);
    expect(r.monthlyIncome).toBeLessThan(r.monthlyIncomeNominal);
    expect(r.monthlyIncome).toBeCloseTo((r.finalRealValue * 0.04) / 12, 6);
    expect(r.monthlyIncomeNominal).toBeCloseTo((r.finalValue * 0.04) / 12, 6);
  });

  it("las comisiones (TER) reducen el patrimonio final", () => {
    const withFee = computeRetirement({ ...base, annualFee: 1 });
    expect(withFee.finalValue).toBeLessThan(computeRetirement(base).finalValue);
  });

  it("el crecimiento del ahorro aumenta lo aportado", () => {
    const grown = computeRetirement({ ...base, contributionGrowth: 3 });
    expect(grown.totalContributed).toBeGreaterThan(computeRetirement(base).totalContributed);
  });

  it("golden: valores por defecto del componente (6% anual efectivo, 2,5% inflación, 0,3% TER)", () => {
    const r = computeRetirement({
      currentAge: 30,
      retirementAge: 67,
      currentSavings: 15000,
      monthlySavings: 300,
      annualReturn: 6,
      inflationRate: 2.5,
      annualFee: 0.3,
      contributionGrowth: 0,
    });
    expect(r.yearsToRetirement).toBe(37);
    expect(r.totalContributed).toBe(148200);
    expect(Math.round(r.finalValue)).toBe(555693);
    expect(Math.round(r.finalRealValue)).toBe(222870);
    expect(r.monthlyIncome).toBeCloseTo(742.9, 2);
  });

  it("si ya estás en edad de jubilación, no proyecta (años 0)", () => {
    const r = computeRetirement({ ...base, currentAge: 67, retirementAge: 65 });
    expect(r.yearsToRetirement).toBe(0);
    expect(r.finalValue).toBe(base.currentSavings);
  });
});
