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
  it("gross income = nights × nightly rate", () => {
    const r = computeHolidayRental(base);
    expect(r.grossIncome).toBe(20000);
  });

  it("deducts management, cleaning and fixed expenses from the net", () => {
    const r = computeHolidayRental(base);
    expect(r.managementCost).toBe(4000); // 20% × 20,000
    expect(r.stays).toBeCloseTo(50, 6); // 200 / 4
    expect(r.cleaningCost).toBeCloseTo(2500, 6); // 50 stays × €50
    expect(r.netIncome).toBeCloseTo(9500, 6); // 20,000 − 4,000 − 2,500 − 4,000
  });

  it("occupancy as a % of 365 nights", () => {
    const r = computeHolidayRental(base);
    expect(r.occupancyRate).toBeCloseTo((200 / 365) * 100, 6);
  });

  it("caps nights at 365", () => {
    const r = computeHolidayRental({ ...base, occupiedNights: 500 });
    expect(r.occupancyRate).toBe(100);
  });

  it("net yield on the total investment", () => {
    const r = computeHolidayRental(base);
    expect(r.netYield).toBeCloseTo((9500 / 220000) * 100, 6);
  });

  it("without a cleaning fee, the net only deducts management and fixed expenses", () => {
    const r = computeHolidayRental({ ...base, cleaningFee: 0 });
    expect(r.cleaningCost).toBe(0);
    expect(r.netIncome).toBeCloseTo(12000, 6); // 20,000 − 4,000 − 4,000
  });
});
