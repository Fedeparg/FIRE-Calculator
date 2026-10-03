import { describe, expect, it } from "vitest";
import { computeBuyVsRent } from "./hipoteca-vs-alquiler.js";

const base = {
  purchasePrice: 250000,
  purchaseCosts: 25000,
  downPayment: 50000,
  mortgageRate: 3,
  mortgageTerm: 30,
  annualCostRate: 1,
  appreciationRate: 2,
  monthlyRent: 1000,
  rentGrowthRate: 2,
  investmentReturn: 5,
  horizonYears: 10,
};

describe("computeBuyVsRent", () => {
  it("accumulates rent with its annual increase", () => {
    const r = computeBuyVsRent(base);
    // Σ 12,000 × 1.02^y for y=0..9 > 120,000 (no increase)
    expect(r.totalRentPaid).toBeGreaterThan(120000);
  });

  it("home equity grows with appreciation", () => {
    const r = computeBuyVsRent(base);
    expect(r.buyEquityEnd).toBeGreaterThan(0);
  });

  it("high appreciation tips the balance towards buying", () => {
    const buy = computeBuyVsRent({ ...base, appreciationRate: 6 });
    expect(buy.buyNetCost).toBeLessThan(buy.rentNetCost);
    expect(buy.cheaper).toBe("buy");
  });

  it("a high investment return favors renting", () => {
    const rent = computeBuyVsRent({ ...base, appreciationRate: 0, investmentReturn: 9 });
    expect(rent.cheaper === "rent" || rent.difference < 0).toBe(true);
  });

  it("the difference is consistent with the net costs", () => {
    const r = computeBuyVsRent(base);
    expect(r.difference).toBeCloseTo(r.rentNetCost - r.buyNetCost, 4);
  });

  it("selling costs reduce net equity and make buying more expensive", () => {
    const withoutSellingCosts = computeBuyVsRent(base);
    const withSellingCosts = computeBuyVsRent({ ...base, sellingCostsRate: 5 });
    expect(withSellingCosts.buyEquityEnd).toBeLessThan(withoutSellingCosts.buyEquityEnd);
    expect(withSellingCosts.buyNetCost).toBeGreaterThan(withoutSellingCosts.buyNetCost);
  });
});
