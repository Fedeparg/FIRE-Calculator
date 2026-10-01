import { describe, expect, it } from "vitest";
import { computeHolidayRental } from "./rentabilidad-alquiler-vacacional.js";

const base = {
  purchasePrice: 200000,
  purchaseCosts: 20000,
  nightlyRate: 100,
  occupiedNights: 200,
  managementRate: 20,
  cleaningFee: 50,
  avgStayNights: 4,
  annualExpenses: 4000,
};

describe("computeHolidayRental", () => {
  it("ingresos brutos = noches × precio por noche", () => {
    const r = computeHolidayRental(base);
    expect(r.grossIncome).toBe(20000);
  });

  it("descuenta gestión, limpieza y gastos fijos del neto", () => {
    const r = computeHolidayRental(base);
    expect(r.managementCost).toBe(4000); // 20% × 20.000
    expect(r.stays).toBeCloseTo(50, 6); // 200 / 4
    expect(r.cleaningCost).toBeCloseTo(2500, 6); // 50 estancias × 50 €
    expect(r.netIncome).toBeCloseTo(9500, 6); // 20.000 − 4.000 − 2.500 − 4.000
  });

  it("ocupación como % sobre 365 noches", () => {
    const r = computeHolidayRental(base);
    expect(r.occupancyRate).toBeCloseTo((200 / 365) * 100, 6);
  });

  it("limita las noches a 365", () => {
    const r = computeHolidayRental({ ...base, occupiedNights: 500 });
    expect(r.occupancyRate).toBe(100);
  });

  it("rentabilidad neta sobre la inversión total", () => {
    const r = computeHolidayRental(base);
    expect(r.netYield).toBeCloseTo((9500 / 220000) * 100, 6);
  });

  it("sin coste de limpieza, el neto solo descuenta gestión y gastos fijos", () => {
    const r = computeHolidayRental({ ...base, cleaningFee: 0 });
    expect(r.cleaningCost).toBe(0);
    expect(r.netIncome).toBeCloseTo(12000, 6); // 20.000 − 4.000 − 4.000
  });
});
