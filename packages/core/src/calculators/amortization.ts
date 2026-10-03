// Level-payment loan math (French amortization), shared by the mortgage, early repayment,
// mortgage affordability and credit card calculators. Pure core.

/** Monthly rate (a fraction, not %) from the annual TIN (nominal rate) in base 100 (3 = 3%). NaN counts as 0. */
export function monthlyRate(annualPercent: number): number {
  return (annualPercent || 0) / 100 / 12;
}

/**
 * Level payment that amortizes `principal` over `months` payments at the monthly rate `rate`. At a
 * zero rate the French formula is 0/0, so the principal is split into equal parts.
 */
export function levelPayment(principal: number, rate: number, months: number): number {
  return rate === 0 ? principal / months : (principal * rate) / (1 - Math.pow(1 + rate, -months));
}

/** Inverse of `levelPayment`: the principal that a `payment` over `months` payments can finance. */
export function presentValueOfPayments(payment: number, rate: number, months: number): number {
  return rate === 0 ? payment * months : (payment * (1 - Math.pow(1 + rate, -months))) / rate;
}

export interface AmortizationMonth {
  /** Month number, starting at 1. */
  month: number;
  /** Outstanding balance at the start of the month. */
  balanceBefore: number;
  interest: number;
  /**
   * Principal repaid by the payment: `payment − interest`, unclamped. It can be negative (the payment
   * does not cover the interest) or exceed the balance on the last payment; the consumer decides.
   */
  principalPart: number;
  /** Balance at the end of the month, never negative. */
  balanceAfter: number;
}

/**
 * Walks the schedule month by month (up to `maxMonths`). It is a generator so each consumer can stop
 * whenever it needs to (e.g. once the balance is paid off) without the walk knowing that rule.
 */
export function* amortizationSchedule(
  principal: number,
  rate: number,
  payment: number,
  maxMonths: number,
): Generator<AmortizationMonth, void, undefined> {
  let balance = principal;
  for (let month = 1; month <= maxMonths; month++) {
    const interest = balance * rate;
    const principalPart = payment - interest;
    const balanceAfter = Math.max(0, balance - principalPart);
    yield { month, balanceBefore: balance, interest, principalPart, balanceAfter };
    balance = balanceAfter;
  }
}
