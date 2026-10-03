// Credit card (revolving debt): month-by-month amortization. Pure core. Payment modes: "fixed"
// (fixed payment) and "percent" (minimum as a % of the balance with a floor in euros; without a floor
// the payment tends to 0 and the debt never ends).

import { roundCents } from "../money.js";
import { monthlyRate } from "./amortization.js";

export const PAYMENT_MODES = ["fixed", "percent"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export interface CreditCardInput {
  balance: number;
  annualRate: number;
  paymentMode?: PaymentMode;
  monthlyPayment: number;
  minPercent?: number;
  minFloor?: number;
}

export interface CreditCardPoint {
  month: number;
  balance: number;
  interestPaid: number;
}

export interface CreditCardResult {
  monthsToPayoff: number | null;
  totalInterest: number;
  totalPaid: number;
  firstPayment: number;
  series: CreditCardPoint[];
}

const MAX_MONTHS = 1200;

const NEVER: CreditCardResult = {
  monthsToPayoff: null,
  totalInterest: Infinity,
  totalPaid: Infinity,
  firstPayment: 0,
  series: [],
};

export function computeCreditCard(input: CreditCardInput): CreditCardResult {
  const balance = Math.max(0, input.balance || 0);
  const rate = monthlyRate(input.annualRate);
  const mode: PaymentMode = input.paymentMode ?? "fixed";
  const fixedPayment = Math.max(0, input.monthlyPayment || 0);
  const minPercent = Math.max(0, input.minPercent || 0) / 100;
  const minFloor = Math.max(0, input.minFloor || 0);

  if (balance === 0) {
    return {
      monthsToPayoff: 0,
      totalInterest: 0,
      totalPaid: 0,
      firstPayment: 0,
      series: [{ month: 0, balance: 0, interestPaid: 0 }],
    };
  }

  // without a floor, in "percent" mode the debt never ends
  if (mode === "percent" && minFloor <= 0) return NEVER;
  // in "fixed" mode, if the payment does not cover the first month's interest the debt never goes down
  if (mode === "fixed" && fixedPayment <= balance * rate) return NEVER;

  let remaining = balance;
  let totalInterest = 0;
  let months = 0;
  let firstPayment = 0;
  const series: CreditCardPoint[] = [{ month: 0, balance: roundCents(balance), interestPaid: 0 }];

  while (remaining > 0 && months < MAX_MONTHS) {
    const interest = remaining * rate;
    totalInterest += interest;
    const due = remaining + interest;

    const scheduled = mode === "percent" ? Math.max(minFloor, remaining * minPercent) : fixedPayment;
    const pay = Math.min(scheduled, due);

    remaining = due - pay;
    months++;
    if (months === 1) firstPayment = pay;

    series.push({
      month: months,
      balance: roundCents(Math.max(0, remaining)),
      interestPaid: roundCents(totalInterest),
    });
  }

  if (remaining > 1e-6) return NEVER;

  return {
    monthsToPayoff: months,
    totalInterest,
    totalPaid: balance + totalInterest,
    firstPayment,
    series,
  };
}
