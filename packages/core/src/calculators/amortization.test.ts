import { describe, expect, it } from "vitest";
import { amortizationSchedule, levelPayment, monthlyRate, presentValueOfPayments } from "./amortization.js";
import { itemAt, takeItems } from "../arrays.js";

describe("monthlyRate", () => {
  it("converts the annual TIN (nominal rate) in percent to a monthly fraction", () => {
    expect(monthlyRate(12)).toBeCloseTo(0.01, 12);
    expect(monthlyRate(0)).toBe(0);
  });

  it("treats NaN as 0 and lets Infinity through", () => {
    expect(monthlyRate(Number.NaN)).toBe(0);
    expect(monthlyRate(Infinity)).toBe(Infinity);
  });
});

describe("levelPayment", () => {
  it("matches the French amortization formula", () => {
    // €100,000 at 3% over 30 years: reference payment €421.60
    expect(levelPayment(100000, monthlyRate(3), 360)).toBeCloseTo(421.6, 2);
  });

  it("with a zero rate it splits the principal into equal parts", () => {
    expect(levelPayment(1200, 0, 12)).toBe(100);
  });

  it("with zero principal the payment is 0", () => {
    expect(levelPayment(0, 0.003, 120)).toBe(0);
    expect(levelPayment(0, 0, 120)).toBe(0);
  });

  it("a single payment returns the principal plus one month of interest", () => {
    expect(levelPayment(1000, 0.01, 1)).toBeCloseTo(1010, 9);
  });

  it("with a huge rate the payment tends to principal × rate, without overflowing", () => {
    const payment = levelPayment(1000, 1e6, 360);
    expect(Number.isFinite(payment)).toBe(true);
    expect(payment).toBeCloseTo(1000 * 1e6, -3);
  });
});

describe("presentValueOfPayments", () => {
  it("is the inverse of levelPayment", () => {
    for (const rate of [0, 0.0005, 0.0025, 0.02]) {
      for (const months of [1, 12, 360]) {
        const payment = levelPayment(180000, rate, months);
        expect(presentValueOfPayments(payment, rate, months)).toBeCloseTo(180000, 4);
      }
    }
  });

  it("with a zero rate it is payment × months", () => {
    expect(presentValueOfPayments(500, 0, 360)).toBe(180000);
  });

  it("with a zero payment it finances 0", () => {
    expect(presentValueOfPayments(0, 0.003, 240)).toBe(0);
  });
});

describe("amortizationSchedule", () => {
  it("pays off the principal in full within the term", () => {
    const rate = monthlyRate(3);
    const months = [...amortizationSchedule(100000, rate, levelPayment(100000, rate, 360), 360)];
    expect(months).toHaveLength(360);
    expect(itemAt(months, 0).month).toBe(1);
    expect(itemAt(months, 0).balanceBefore).toBe(100000);
    expect(itemAt(months, 0).interest).toBeCloseTo(250, 9);
    expect(months.at(-1)?.balanceAfter).toBeCloseTo(0, 6);
  });

  it("chains each month's closing balance to the next month's opening balance", () => {
    const months = [...amortizationSchedule(5000, 0.01, 300, 20)];
    months.slice(1).forEach((m, k) => expect(m.balanceBefore).toBe(itemAt(months, k).balanceAfter));
  });

  it("leaves no negative balance when the last payment exceeds the balance", () => {
    const months = [...amortizationSchedule(100, 0, 60, 5)];
    expect(months.map((m) => m.balanceAfter)).toEqual([40, 0, 0, 0, 0]);
    // the principal part is not clamped: the consumer decides
    expect(itemAt(months, 2).principalPart).toBe(60);
  });

  it("exposes a negative principal part if the payment does not cover the interest", () => {
    const [first, second] = takeItems([...amortizationSchedule(1000, 0.1, 50, 2)], 2);
    expect(first.principalPart).toBe(-50);
    expect(second.balanceBefore).toBe(1050);
  });

  it("with no months it yields nothing", () => {
    expect([...amortizationSchedule(1000, 0.01, 100, 0)]).toEqual([]);
  });

  it("is lazy: the consumer can stop without walking the whole term", () => {
    let seen = 0;
    for (const m of amortizationSchedule(1000, 0.01, 100, 1e9)) {
      seen++;
      if (m.month === 3) break;
    }
    expect(seen).toBe(3);
  });
});
