// Meaningful edge cases (zero rate, zero term, negative or extreme inputs) for the calculators
// that did not cover them. The generic table in `edge-inputs.test.ts` only guarantees that they do
// not throw and that the outputs are finite; here we also pin down WHICH result is correct.

import { describe, expect, it } from "vitest";
import { computeRetirement } from "./ahorro-jubilacion.js";
import { computeEarlyRepayment } from "./amortizacion-anticipada.js";
import { computeAffordability } from "./hipoteca-asequible.js";
import { computeWealthTax } from "./impuesto-patrimonio.js";
import { computePayrollWithholding } from "./irpf-nomina.js";
import { computeHolidayRental } from "./rentabilidad-alquiler-vacacional.js";
import { computeStaking } from "./staking.js";

describe("computeStaking: edge cases", () => {
  it("with zero APY there are no rewards and no withholding", () => {
    const r = computeStaking({ principal: 5000, apy: 0, years: 3 });
    expect(r.rewards).toBe(0);
    expect(r.withheld).toBe(0);
    expect(r.netFinalValue).toBe(5000);
  });

  it("with 0 years it returns the principal untouched", () => {
    const r = computeStaking({ principal: 5000, apy: 8, years: 0 });
    expect(r.rewards).toBe(0);
    expect(r.netFinalValue).toBe(5000);
    expect(r.series).toHaveLength(1);
  });

  it("with zero principal there is nothing to earn", () => {
    expect(computeStaking({ principal: 0, apy: 8, years: 3 }).netFinalValue).toBe(0);
  });

  it("a negative APY (loss) does not produce negative withholding", () => {
    const r = computeStaking({ principal: 5000, apy: -10, years: 2 });
    expect(r.rewards).toBeLessThan(0);
    expect(r.withheld).toBe(0);
    expect(r.netFinalValue).toBeCloseTo(5000 + r.rewards, 6);
  });

  it("clamps the withholding to 0-100%", () => {
    const all = computeStaking({ principal: 1000, apy: 10, years: 1, withholdingRate: 500 });
    expect(all.netRewards).toBeCloseTo(0, 9);
    const none = computeStaking({ principal: 1000, apy: 10, years: 1, withholdingRate: -5 });
    expect(none.withheld).toBe(0);
  });
});

describe("computeAffordability: edge cases", () => {
  const base = { netMonthlyIncome: 3000, monthlyDebts: 200, downPayment: 40000, termYears: 30 };

  it("with a zero rate the maximum loan is payment × months", () => {
    const r = computeAffordability({ ...base, annualRate: 0 });
    expect(r.maxMonthlyPayment).toBeCloseTo(3000 * 0.35 - 200, 9);
    expect(r.maxLoan).toBeLessThanOrEqual(r.maxMonthlyPayment * 360 + 1e-6);
    expect(Number.isFinite(r.estimatedMonthlyPayment)).toBe(true);
  });

  it("a zero term is treated as 1 year", () => {
    expect(computeAffordability({ ...base, annualRate: 3, termYears: 0 })).toEqual(
      computeAffordability({ ...base, annualRate: 3, termYears: 1 }),
    );
  });

  it("without income, or with debts that eat it up, there is no mortgage", () => {
    const noIncome = computeAffordability({ ...base, netMonthlyIncome: 0, annualRate: 3 });
    expect(noIncome.maxMonthlyPayment).toBe(0);
    expect(noIncome.maxLoan).toBe(0);
    const overIndebted = computeAffordability({ ...base, monthlyDebts: 5000, annualRate: 3 });
    expect(overIndebted.maxLoan).toBe(0);
  });

  it("without savings there is no down payment and the maximum price is 0", () => {
    const r = computeAffordability({ ...base, downPayment: 0, annualRate: 3 });
    expect(r.maxPrice).toBe(0);
    expect(r.binding).toBe("savings");
  });

  it("with zero LTV the bank finances nothing and savings are the binding constraint", () => {
    const r = computeAffordability({ ...base, annualRate: 3, maxLtv: 0 });
    expect(r.maxLoan).toBe(0);
    expect(Number.isFinite(r.maxPrice)).toBe(true);
  });
});

describe("computeEarlyRepayment: edge cases", () => {
  const base = { pendingPrincipal: 100000, remainingYears: 20, extraPayment: 20000 };

  it("with a zero rate shortening the term saves exact months and no interest", () => {
    const r = computeEarlyRepayment({ ...base, annualRate: 0 });
    expect(r.totalInterestBefore).toBeCloseTo(0, 6);
    expect(r.reduceTerm.newMonths).toBe(192); // 80,000 / (100,000 / 240)
    expect(r.reduceTerm.monthsSaved).toBe(48);
    expect(r.reduceTerm.interestSaved).toBeCloseTo(0, 6);
    expect(r.reducePayment.newMonthlyPayment).toBeCloseTo(80000 / 240, 9);
  });

  it("0 remaining years is treated as 1 year", () => {
    const r = computeEarlyRepayment({ ...base, annualRate: 3, remainingYears: 0 });
    expect(r).toEqual(computeEarlyRepayment({ ...base, annualRate: 3, remainingYears: 1 }));
    expect(r.reduceTerm.newMonths).toBeLessThanOrEqual(12);
  });

  it("repaying the whole principal leaves 0 months and a zero payment", () => {
    const r = computeEarlyRepayment({ ...base, annualRate: 3, extraPayment: 1e9 });
    expect(r.reduceTerm.newMonths).toBe(0);
    expect(r.reduceTerm.monthsSaved).toBe(240);
    expect(r.reducePayment.newMonthlyPayment).toBe(0);
    expect(r.reduceTerm.interestSaved).toBeCloseTo(r.totalInterestBefore, 6);
  });

  it("without an extra payment nothing is saved", () => {
    const r = computeEarlyRepayment({ ...base, annualRate: 3, extraPayment: 0 });
    expect(r.reducePayment.interestSaved).toBeCloseTo(0, 6);
    expect(r.reduceTerm.monthsSaved).toBe(0);
    expect(r.prepaymentFee).toBe(0);
  });

  it("without outstanding principal there is nothing to compute", () => {
    const r = computeEarlyRepayment({ ...base, pendingPrincipal: 0, annualRate: 3 });
    expect(r.monthlyPaymentBefore).toBe(0);
    expect(r.reduceTerm.newMonths).toBe(0);
  });
});

describe("computePayrollWithholding: edge cases", () => {
  it("with zero gross everything is 0 and there is no division by zero", () => {
    const r = computePayrollWithholding({ grossAnnual: 0 });
    expect(r.grossPerPayment).toBe(0);
    expect(r.withholdingPerPayment).toBe(0);
    expect(r.withholdingRate).toBe(0);
    expect(r.annualWithholding).toBe(0);
  });

  it("a negative gross is treated as 0", () => {
    expect(computePayrollWithholding({ grossAnnual: -1000 })).toEqual(computePayrollWithholding({ grossAnnual: 0 }));
  });

  it("a number of payments other than 12 is treated as 14", () => {
    const base = { grossAnnual: 30000 };
    expect(computePayrollWithholding({ ...base, payments: 0 }).grossPerPayment).toBeCloseTo(30000 / 14, 9);
    expect(computePayrollWithholding({ ...base, payments: 12 }).grossPerPayment).toBe(2500);
  });

  it("with a salary below the exempt minimum the withholding is 0", () => {
    expect(computePayrollWithholding({ grossAnnual: 8000 }).annualWithholding).toBe(0);
  });
});

describe("computeWealthTax: edge cases", () => {
  it("with zero wealth or below the exempt minimum there is no tax", () => {
    expect(computeWealthTax({ totalWealth: 0, primaryResidenceValue: 0 }).tax).toBe(0);
    const below = computeWealthTax({ totalWealth: 600000, primaryResidenceValue: 0, exemptMinimum: 700000 });
    expect(below.taxableBase).toBe(0);
    expect(below.tax).toBe(0);
  });

  it("the primary residence is only exempt up to €300,000", () => {
    const r = computeWealthTax({ totalWealth: 2000000, primaryResidenceValue: 1000000, exemptMinimum: 0 });
    expect(r.residenceExemption).toBe(300000);
    expect(r.taxableBase).toBe(1700000);
  });

  it("a 100% rebate cancels the tax and out-of-range values are clamped", () => {
    const full = computeWealthTax({ totalWealth: 3000000, primaryResidenceValue: 0, regionalRebate: 100 });
    expect(full.grossTax).toBeGreaterThan(0);
    expect(full.tax).toBe(0);
    expect(computeWealthTax({ totalWealth: 3000000, primaryResidenceValue: 0, regionalRebate: 250 }).tax).toBe(0);
    expect(computeWealthTax({ totalWealth: 3000000, primaryResidenceValue: 0, regionalRebate: -50 }).tax).toBe(
      full.grossTax,
    );
  });

  it("negative values are treated as 0", () => {
    expect(computeWealthTax({ totalWealth: -5, primaryResidenceValue: -5 }).effectiveRate).toBe(0);
  });
});

describe("computeHolidayRental: edge cases", () => {
  const base = {
    purchasePrice: 200000,
    purchaseCosts: 20000,
    nightlyRate: 100,
    occupiedNights: 180,
    managementRate: 20,
    annualExpenses: 3000,
  };

  it("with zero price and costs the yields are 0, not infinite", () => {
    const r = computeHolidayRental({ ...base, purchasePrice: 0, purchaseCosts: 0 });
    expect(r.grossYield).toBe(0);
    expect(r.netYield).toBe(0);
    expect(r.grossIncome).toBe(18000);
  });

  it("clamps occupied nights to 365", () => {
    const r = computeHolidayRental({ ...base, occupiedNights: 1000 });
    expect(r.occupancyRate).toBe(100);
    expect(r.grossIncome).toBe(36500);
  });

  it("an average stay of 0 nights is treated as 1 (no division by zero)", () => {
    const r = computeHolidayRental({ ...base, avgStayNights: 0, cleaningFee: 30 });
    expect(r.stays).toBe(180);
    expect(r.cleaningCost).toBe(5400);
  });

  it("without occupancy the net is the annual expense as a negative", () => {
    const r = computeHolidayRental({ ...base, occupiedNights: 0 });
    expect(r.netIncome).toBe(-3000);
    expect(r.stays).toBe(0);
  });

  it("a management fee above 100% is clamped", () => {
    const r = computeHolidayRental({ ...base, managementRate: 400 });
    expect(r.managementCost).toBe(r.grossIncome);
  });
});

describe("computeRetirement: edge cases", () => {
  const base = { currentSavings: 10000, monthlySavings: 500, annualReturn: 6 };

  it("at retirement age there are no projection years and the income comes from current savings", () => {
    const r = computeRetirement({ ...base, currentAge: 65, retirementAge: 65 });
    expect(r.yearsToRetirement).toBe(0);
    expect(r.finalValue).toBe(10000);
    expect(r.monthlyIncome).toBeCloseTo((10000 * 0.04) / 12, 9);
  });

  it("a retirement age below the current age is treated as 0 years", () => {
    const r = computeRetirement({ ...base, currentAge: 70, retirementAge: 65 });
    expect(r.yearsToRetirement).toBe(0);
    expect(r.finalValue).toBe(10000);
  });

  it("with a zero return the wealth is what was contributed", () => {
    const r = computeRetirement({ ...base, annualReturn: 0, currentAge: 30, retirementAge: 40 });
    expect(r.finalValue).toBeCloseTo(10000 + 500 * 12 * 10, 6);
    expect(r.totalInterest).toBeCloseTo(0, 6);
  });

  it("without savings or contributions the income is 0", () => {
    const r = computeRetirement({
      currentSavings: 0,
      monthlySavings: 0,
      annualReturn: 6,
      currentAge: 30,
      retirementAge: 65,
    });
    expect(r.monthlyIncome).toBe(0);
    expect(r.monthlyIncomeNominal).toBe(0);
  });

  it("with inflation the real income stays below the nominal income", () => {
    const r = computeRetirement({ ...base, currentAge: 30, retirementAge: 65, inflationRate: 2 });
    expect(r.monthlyIncome).toBeLessThan(r.monthlyIncomeNominal);
  });
});
