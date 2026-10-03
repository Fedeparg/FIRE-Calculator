import { describe, expect, it } from "vitest";
import { computeEarlyRepayment } from "./amortizacion-anticipada.js";
import { computeMortgage } from "./hipoteca.js";

const base = {
  pendingPrincipal: 150000,
  annualRate: 3,
  remainingYears: 25,
};

describe("computeEarlyRepayment", () => {
  it("without an extra payment neither option saves anything", () => {
    const r = computeEarlyRepayment({ ...base, extraPayment: 0 });
    expect(r.reducePayment.interestSaved).toBeCloseTo(0, 2);
    expect(r.reduceTerm.interestSaved).toBeCloseTo(0, 2);
  });

  it("the base payment matches the mortgage calculator", () => {
    const r = computeEarlyRepayment({ ...base, extraPayment: 0 });
    const mortgage = computeMortgage({
      principal: base.pendingPrincipal,
      annualRate: base.annualRate,
      years: base.remainingYears,
    });
    expect(r.monthlyPaymentBefore).toBeCloseTo(mortgage.monthlyPayment, 6);
  });

  it("an extra payment saves interest in both options", () => {
    const r = computeEarlyRepayment({ ...base, extraPayment: 20000 });
    expect(r.reducePayment.interestSaved).toBeGreaterThan(0);
    expect(r.reduceTerm.interestSaved).toBeGreaterThan(0);
  });

  it("shortening the term saves more interest than lowering the payment", () => {
    const r = computeEarlyRepayment({ ...base, extraPayment: 20000 });
    expect(r.reduceTerm.interestSaved).toBeGreaterThan(r.reducePayment.interestSaved);
    expect(r.reduceTerm.monthsSaved).toBeGreaterThan(0);
  });

  it("lowering the payment reduces the monthly installment", () => {
    const r = computeEarlyRepayment({ ...base, extraPayment: 20000 });
    expect(r.reducePayment.newMonthlyPayment).toBeLessThan(r.monthlyPaymentBefore);
  });

  it("without a fee, the net saving equals the interest saved", () => {
    const r = computeEarlyRepayment({ ...base, extraPayment: 20000 });
    expect(r.prepaymentFee).toBe(0);
    expect(r.reduceTerm.netSaved).toBeCloseTo(r.reduceTerm.interestSaved, 6);
    expect(r.reducePayment.netSaved).toBeCloseTo(r.reducePayment.interestSaved, 6);
  });

  it("the prepayment fee is paid separately and reduces the net saving", () => {
    const r = computeEarlyRepayment({ ...base, extraPayment: 20000, compensationRate: 2 });
    expect(r.prepaymentFee).toBeCloseTo(400, 6); // 2% of 20,000
    expect(r.reduceTerm.netSaved).toBeCloseTo(r.reduceTerm.interestSaved - 400, 6);
    expect(r.reducePayment.netSaved).toBeCloseTo(r.reducePayment.interestSaved - 400, 6);
  });
});
