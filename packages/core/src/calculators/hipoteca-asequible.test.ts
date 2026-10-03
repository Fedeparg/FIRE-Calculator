import { describe, expect, it } from "vitest";
import { computeAffordability } from "./hipoteca-asequible.js";

const base = {
  netMonthlyIncome: 2000,
  monthlyDebts: 0,
  downPayment: 40000,
  annualRate: 3,
  termYears: 30,
};

describe("computeAffordability", () => {
  it("applies the debt-to-income rule (35% by default)", () => {
    const r = computeAffordability(base);
    expect(r.maxMonthlyPayment).toBeCloseTo(700, 6); // 2000 * 0.35
  });

  it("debts reduce the available payment", () => {
    const r = computeAffordability({ ...base, monthlyDebts: 200 });
    expect(r.maxMonthlyPayment).toBeCloseTo(500, 6);
  });

  it("with the defaults savings are the binding constraint (80% LTV + 12% costs)", () => {
    const r = computeAffordability(base);
    // 40,000 / (1 + 0.12 − 0.80) = €125,000; loan = 80% = €100,000
    expect(r.maxPrice).toBeCloseTo(125000, 4);
    expect(r.maxLoan).toBeCloseTo(100000, 4);
    expect(r.binding).toBe("savings");
  });

  it("savings cover exactly the down payment plus purchase costs", () => {
    const r = computeAffordability(base);
    expect(r.downPaymentNeeded + r.purchaseCostsAmount).toBeCloseTo(base.downPayment, 4);
  });

  it("more savings allow a higher price while savings are binding", () => {
    const r = computeAffordability({ ...base, downPayment: 60000 });
    expect(r.maxPrice).toBeCloseTo(187500, 4); // 60,000 / 0.32
    expect(r.binding).toBe("savings");
  });

  it("if debts exceed the limit, there is no loan and only a cash purchase is possible", () => {
    const r = computeAffordability({ ...base, monthlyDebts: 1000 });
    expect(r.maxMonthlyPayment).toBe(0);
    expect(r.maxLoan).toBe(0);
    expect(r.maxPrice).toBeCloseTo(40000 / 1.12, 4); // savings − purchase costs
    expect(r.binding).toBe("income");
  });

  it("with large savings the ability to pay becomes the binding constraint", () => {
    const r = computeAffordability({ ...base, downPayment: 200000 });
    expect(r.binding).toBe("income");
    // the loan is capped by the payment (below 80% of the price).
    expect(r.maxLoan).toBeLessThan(0.8 * r.maxPrice);
    expect(r.estimatedMonthlyPayment).toBeCloseTo(r.maxMonthlyPayment, 0);
  });
});
