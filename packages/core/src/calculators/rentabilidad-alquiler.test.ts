import { describe, expect, it } from "vitest";
import { computeRentalYield } from "./rentabilidad-alquiler.js";

const base = {
  purchasePrice: 200000,
  purchaseCosts: 20000,
  monthlyRent: 1000,
  vacancyRate: 5,
  ibiAnnual: 400,
  communityMonthly: 50,
  insuranceAnnual: 200,
  maintenanceAnnual: 500,
};

describe("computeRentalYield", () => {
  it("calcula ingresos, gastos, neto y rentabilidades", () => {
    const r = computeRentalYield(base);
    expect(r.annualRentIncome).toBe(12000); // 1000 * 12
    expect(r.effectiveRentIncome).toBeCloseTo(11400, 6); // -5% vacancy
    expect(r.totalAnnualExpenses).toBeCloseTo(1700, 6); // 400 + 600 + 200 + 500
    expect(r.netIncome).toBeCloseTo(9700, 6); // 11400 - 1700
    expect(r.grossYield).toBeCloseTo(6, 6); // 12000 / 200000
    expect(r.netYield).toBeCloseTo((9700 / 220000) * 100, 6);
  });

  it("la vacancy reduce los ingresos efectivos", () => {
    const sinVacancy = computeRentalYield({ ...base, vacancyRate: 0 });
    expect(sinVacancy.effectiveRentIncome).toBe(12000);
    expect(sinVacancy.netIncome).toBeCloseTo(10300, 6);
  });

  it("el flujo de caja mensual es el neto anual entre doce", () => {
    const r = computeRentalYield(base);
    expect(r.monthlyNetCashflow).toBeCloseTo(9700 / 12, 6);
  });

  it("sin precio de compra, rentabilidad 0 (sin dividir por cero)", () => {
    const r = computeRentalYield({ ...base, purchasePrice: 0, purchaseCosts: 0 });
    expect(r.grossYield).toBe(0);
    expect(r.netYield).toBe(0);
  });
});
