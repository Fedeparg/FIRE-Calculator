// Reference cases for the loan math shared by the mortgage, early repayment, affordable mortgage
// and credit card calculators: standard, zero rate, zero term, zero amount, huge and negative
// rates, and payments that do not cover the interest. Replaces the SHA-256 fingerprint that served
// as a safety net for the `amortization.ts` refactor (G6): this one says WHICH case changed.
//
// The values come from the code as it was when the test was written, rounded to 10 significant
// digits: `Math.pow` may differ in the last bit across platforms (macOS ARM versus CI's Linux
// x64), and that is not a change in the calculation. Series are reduced to their length (their
// values are tested in each calculator's own test).

import { describe, expect, it } from "vitest";
import { computeEarlyRepayment } from "./amortizacion-anticipada.js";
import { computeAffordability } from "./hipoteca-asequible.js";
import { computeMortgage } from "./hipoteca.js";
import { computeCreditCard } from "./tarjeta-credito.js";

type Summary = { [key: string]: number | string | boolean | null | Summary };

/** Result with numbers at 10 digits, non-finite values as text and series as their length. */
function summarize(result: object): Summary {
  const out: Summary = {};
  for (const [key, value] of Object.entries(result) as [string, unknown][]) {
    if (Array.isArray(value)) out[`${key}Length`] = value.length;
    else if (typeof value === "number")
      out[key] = Number.isFinite(value) ? Number(value.toPrecision(10)) : String(value);
    else if (typeof value === "object" && value !== null) out[key] = summarize(value);
    else if (typeof value === "string" || typeof value === "boolean") out[key] = value;
    else out[key] = null;
  }
  return out;
}

describe("loan math: reference cases", () => {
  it.each<[Parameters<typeof computeMortgage>[0], Summary]>([
    [
      { principal: 180000, annualRate: 3, years: 30, openingFeeRate: 1, annualInsurance: 300 },
      {
        monthlyPayment: 758.8872607,
        totalPaid: 273199.4139,
        totalInterest: 93199.41386,
        openingCost: 1800,
        insuranceCost: 9000,
        totalCostWithFees: 283999.4139,
        apr: 3.386578911,
        scheduleLength: 30,
      },
    ],
    [
      { principal: 180000, annualRate: 0, years: 30, openingFeeRate: 1, annualInsurance: 300 },
      {
        monthlyPayment: 500,
        totalPaid: 180000,
        totalInterest: 0,
        openingCost: 1800,
        insuranceCost: 9000,
        totalCostWithFees: 190800,
        apr: 0.395855622,
        scheduleLength: 30,
      },
    ],
    [
      { principal: 1000, annualRate: 7.25, years: 1, openingFeeRate: 1, annualInsurance: 300 },
      {
        monthlyPayment: 86.6420388,
        totalPaid: 1039.704466,
        totalInterest: 39.7044656,
        openingCost: 10,
        insuranceCost: 300,
        totalCostWithFees: 1349.704466,
        apr: 79.40612193,
        scheduleLength: 1,
      },
    ],
    [
      { principal: 180000, annualRate: 3, years: 0, openingFeeRate: 1, annualInsurance: 300 },
      {
        monthlyPayment: 15244.86578,
        totalPaid: 182938.3893,
        totalInterest: 2938.389318,
        openingCost: 1800,
        insuranceCost: 300,
        totalCostWithFees: 185038.3893,
        apr: 5.303605041,
        scheduleLength: 1,
      },
    ],
    [
      { principal: 0, annualRate: 3, years: 30, openingFeeRate: 1, annualInsurance: 300 },
      {
        monthlyPayment: 0,
        totalPaid: 0,
        totalInterest: 0,
        openingCost: 0,
        insuranceCost: 9000,
        totalCostWithFees: 9000,
        apr: 0,
        scheduleLength: 30,
      },
    ],
    [
      { principal: 50000000, annualRate: 500, years: 40, openingFeeRate: 1, annualInsurance: 300 },
      {
        monthlyPayment: 20833333.33,
        totalPaid: 10000000000,
        totalInterest: 9950000000,
        openingCost: 500000,
        insuranceCost: 12000,
        totalCostWithFees: 10000512000,
        apr: 6671.328325,
        scheduleLength: 40,
      },
    ],
    [
      { principal: 180000, annualRate: -2, years: 10, openingFeeRate: 1, annualInsurance: 300 },
      {
        monthlyPayment: 1353.750485,
        totalPaid: 162450.0582,
        totalInterest: -17549.94176,
        openingCost: 1800,
        insuranceCost: 3000,
        totalCostWithFees: 167250.0582,
        apr: 0,
        scheduleLength: 10,
      },
    ],
  ])("computeMortgage(%o)", (input, expected) => {
    expect(summarize(computeMortgage(input))).toEqual(expected);
  });

  it.each<[Parameters<typeof computeEarlyRepayment>[0], Summary]>([
    [
      { pendingPrincipal: 180000, annualRate: 3, remainingYears: 30, extraPayment: 20000, compensationRate: 2 },
      {
        monthlyPaymentBefore: 758.8872607,
        totalInterestBefore: 93199.41386,
        prepaymentFee: 400,
        reducePayment: { newMonthlyPayment: 674.566454, interestSaved: 10355.49043, netSaved: 9955.490429 },
        reduceTerm: { newMonths: 300, monthsSaved: 60, interestSaved: 25599.76152, netSaved: 25199.76152 },
      },
    ],
    [
      { pendingPrincipal: 180000, annualRate: 0, remainingYears: 30, extraPayment: 20000, compensationRate: 2 },
      {
        monthlyPaymentBefore: 500,
        totalInterestBefore: 0,
        prepaymentFee: 400,
        reducePayment: { newMonthlyPayment: 444.4444444, interestSaved: 0, netSaved: -400 },
        reduceTerm: { newMonths: 320, monthsSaved: 40, interestSaved: 0, netSaved: -400 },
      },
    ],
    [
      { pendingPrincipal: 180000, annualRate: 3, remainingYears: 30, extraPayment: 0, compensationRate: 2 },
      {
        monthlyPaymentBefore: 758.8872607,
        totalInterestBefore: 93199.41386,
        prepaymentFee: 0,
        reducePayment: { newMonthlyPayment: 758.8872607, interestSaved: 0, netSaved: 0 },
        reduceTerm: { newMonths: 360, monthsSaved: 0, interestSaved: 5.820766091e-9, netSaved: 5.820766091e-9 },
      },
    ],
    [
      { pendingPrincipal: 1000, annualRate: 3, remainingYears: 10, extraPayment: 1000000000, compensationRate: 2 },
      {
        monthlyPaymentBefore: 9.65607447,
        totalInterestBefore: 158.7289364,
        prepaymentFee: 20,
        reducePayment: { newMonthlyPayment: 0, interestSaved: 158.7289364, netSaved: 138.7289364 },
        reduceTerm: { newMonths: 0, monthsSaved: 120, interestSaved: 158.7289364, netSaved: 138.7289364 },
      },
    ],
    [
      { pendingPrincipal: 180000, annualRate: 3, remainingYears: 0.4, extraPayment: 500, compensationRate: 2 },
      {
        monthlyPaymentBefore: 15244.86578,
        totalInterestBefore: 2938.389318,
        prepaymentFee: 10,
        reducePayment: { newMonthlyPayment: 15202.51893, interestSaved: 8.162192551, netSaved: -1.837807449 },
        reduceTerm: { newMonths: 12, monthsSaved: 0, interestSaved: 15.20797846, netSaved: 5.20797846 },
      },
    ],
    [
      { pendingPrincipal: 180000, annualRate: 25, remainingYears: 10, extraPayment: 20000, compensationRate: 2 },
      {
        monthlyPaymentBefore: 4094.873107,
        totalInterestBefore: 311384.7729,
        prepaymentFee: 400,
        reducePayment: { newMonthlyPayment: 3639.887206, interestSaved: 34598.3081, netSaved: 34198.3081 },
        reduceTerm: { newMonths: 82, monthsSaved: 38, interestSaved: 137309.3624, netSaved: 136909.3624 },
      },
    ],
  ])("computeEarlyRepayment(%o)", (input, expected) => {
    expect(summarize(computeEarlyRepayment(input))).toEqual(expected);
  });

  it.each<[Parameters<typeof computeAffordability>[0], Summary]>([
    [
      { netMonthlyIncome: 1800, monthlyDebts: 200, downPayment: 20000, annualRate: 3, termYears: 30 },
      {
        maxMonthlyPayment: 430,
        maxLoan: 50000,
        maxPrice: 62500,
        estimatedMonthlyPayment: 210.8020169,
        downPaymentNeeded: 12500,
        purchaseCostsAmount: 7500,
        binding: "savings",
      },
    ],
    [
      { netMonthlyIncome: 6000, monthlyDebts: 200, downPayment: 400000, annualRate: 3, termYears: 30 },
      {
        maxMonthlyPayment: 1900,
        maxLoan: 450659.8249,
        maxPrice: 759517.7008,
        estimatedMonthlyPayment: 1900,
        downPaymentNeeded: 308857.8759,
        purchaseCostsAmount: 91142.12409,
        binding: "income",
      },
    ],
    [
      { netMonthlyIncome: 1800, monthlyDebts: 200, downPayment: 20000, annualRate: 0, termYears: 30 },
      {
        maxMonthlyPayment: 430,
        maxLoan: 50000,
        maxPrice: 62500,
        estimatedMonthlyPayment: 138.8888889,
        downPaymentNeeded: 12500,
        purchaseCostsAmount: 7500,
        binding: "savings",
      },
    ],
    [
      { netMonthlyIncome: 0, monthlyDebts: 200, downPayment: 0, annualRate: 3, termYears: 30 },
      {
        maxMonthlyPayment: 0,
        maxLoan: 0,
        maxPrice: 0,
        estimatedMonthlyPayment: 0,
        downPaymentNeeded: 0,
        purchaseCostsAmount: 0,
        binding: "savings",
      },
    ],
    [
      { netMonthlyIncome: 1800, monthlyDebts: 200, downPayment: 20000, annualRate: 3, termYears: 0 },
      {
        maxMonthlyPayment: 430,
        maxLoan: 5077.119152,
        maxPrice: 22390.28496,
        estimatedMonthlyPayment: 430,
        downPaymentNeeded: 17313.16581,
        purchaseCostsAmount: 2686.834195,
        binding: "income",
      },
    ],
    [
      { netMonthlyIncome: 6000, monthlyDebts: 200, downPayment: 20000, annualRate: 1000000, termYears: 40 },
      {
        maxMonthlyPayment: 1900,
        maxLoan: 2.28,
        maxPrice: 17859.17857,
        estimatedMonthlyPayment: 1900,
        downPaymentNeeded: 17856.89857,
        purchaseCostsAmount: 2143.101429,
        binding: "income",
      },
    ],
  ])("computeAffordability(%o)", (input, expected) => {
    expect(summarize(computeAffordability(input))).toEqual(expected);
  });

  it.each<[Parameters<typeof computeCreditCard>[0], Summary]>([
    [
      { balance: 3000, annualRate: 25, monthlyPayment: 200 },
      { monthsToPayoff: 19, totalInterest: 634.6919919, totalPaid: 3634.691992, firstPayment: 200, seriesLength: 20 },
    ],
    [
      { balance: 3000, annualRate: 25, monthlyPayment: 50 },
      { monthsToPayoff: null, totalInterest: "Infinity", totalPaid: "Infinity", firstPayment: 0, seriesLength: 0 },
    ],
    [
      { balance: 3000, annualRate: 0, monthlyPayment: 200 },
      { monthsToPayoff: 15, totalInterest: 0, totalPaid: 3000, firstPayment: 200, seriesLength: 16 },
    ],
    [
      { balance: 0, annualRate: 25, monthlyPayment: 200 },
      { monthsToPayoff: 0, totalInterest: 0, totalPaid: 0, firstPayment: 0, seriesLength: 1 },
    ],
    [
      { balance: 3000, annualRate: 25, monthlyPayment: 0 },
      { monthsToPayoff: null, totalInterest: "Infinity", totalPaid: "Infinity", firstPayment: 0, seriesLength: 0 },
    ],
    [
      { balance: 3000, annualRate: 25, monthlyPayment: 0, paymentMode: "percent", minPercent: 3, minFloor: 25 },
      { monthsToPayoff: 197, totalInterest: 5528.46654, totalPaid: 8528.46654, firstPayment: 90, seriesLength: 198 },
    ],
    [
      { balance: 1000000, annualRate: 7.25, monthlyPayment: 0, paymentMode: "percent", minPercent: 3, minFloor: 25 },
      {
        monthsToPayoff: 330,
        totalInterest: 252063.7838,
        totalPaid: 1252063.784,
        firstPayment: 30000,
        seriesLength: 331,
      },
    ],
  ])("computeCreditCard(%o)", (input, expected) => {
    expect(summarize(computeCreditCard(input))).toEqual(expected);
  });
});
