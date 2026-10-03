import { describe, expect, it } from "vitest";
import { computeCreditCard } from "./tarjeta-credito.js";
import { defined } from "../assert.js";

describe("computeCreditCard", () => {
  it("pays off an interest-free debt in the exact number of months", () => {
    const r = computeCreditCard({ balance: 1200, annualRate: 0, monthlyPayment: 100 });
    expect(r.monthsToPayoff).toBe(12);
    expect(r.totalInterest).toBeCloseTo(0, 6);
  });

  it("returns null if the payment does not even cover the interest (endless debt)", () => {
    // 1000 at 24% per year → €20/month of interest; paying €20 does not reduce the balance.
    const r = computeCreditCard({ balance: 1000, annualRate: 24, monthlyPayment: 20 });
    expect(r.monthsToPayoff).toBeNull();
  });

  it("with interest, the total paid exceeds the initial balance", () => {
    const r = computeCreditCard({ balance: 1000, annualRate: 24, monthlyPayment: 100 });
    expect(r.monthsToPayoff).not.toBeNull();
    expect(r.totalInterest).toBeGreaterThan(0);
    expect(r.totalPaid).toBeGreaterThan(1000);
  });

  it("a zero balance produces nothing", () => {
    const r = computeCreditCard({ balance: 0, annualRate: 24, monthlyPayment: 100 });
    expect(r.monthsToPayoff).toBe(0);
    expect(r.totalPaid).toBe(0);
  });

  it("golden: fixed payment (component defaults)", () => {
    const r = computeCreditCard({
      balance: 2000,
      annualRate: 22,
      paymentMode: "fixed",
      monthlyPayment: 100,
    });
    expect(r.monthsToPayoff).toBe(26);
    expect(r.totalInterest).toBeCloseTo(514.29, 2);
    expect(r.totalPaid).toBeCloseTo(2514.29, 2);
    // The series runs up to the payoff month and ends at a zero balance.
    expect(r.series.at(-1)?.month).toBe(26);
    expect(r.series.at(-1)?.balance).toBe(0);
  });

  it("golden: a revolving minimum payment (3% of the balance, €25 floor) stretches the debt", () => {
    const r = computeCreditCard({
      balance: 2000,
      annualRate: 22,
      paymentMode: "percent",
      monthlyPayment: 100,
      minPercent: 3,
      minFloor: 25,
    });
    expect(r.monthsToPayoff).toBe(127);
    expect(r.firstPayment).toBeCloseTo(60, 2);
    expect(r.totalInterest).toBeCloseTo(2299.67, 2);
    expect(r.totalPaid).toBeCloseTo(4299.67, 2);
    // The floor guarantees it ends: far more is paid in interest.
    expect(r.totalInterest).toBeGreaterThan(2000);
  });

  it("percent mode without a floor never pays off the debt (it would be asymptotic)", () => {
    const r = computeCreditCard({
      balance: 2000,
      annualRate: 22,
      paymentMode: "percent",
      monthlyPayment: 100,
      minPercent: 3,
      minFloor: 0,
    });
    expect(r.monthsToPayoff).toBeNull();
  });

  it("the fixed payment pays off sooner than a minimum payment with the same initial amount", () => {
    const fixed = computeCreditCard({
      balance: 2000,
      annualRate: 22,
      paymentMode: "fixed",
      monthlyPayment: 60,
    });
    const percent = computeCreditCard({
      balance: 2000,
      annualRate: 22,
      paymentMode: "percent",
      monthlyPayment: 0,
      minPercent: 3,
      minFloor: 25,
    });
    // Both start by paying €60, but the minimum drops with the balance → it takes longer.
    expect(percent.monthsToPayoff).toBeGreaterThan(defined(fixed.monthsToPayoff));
  });
});
