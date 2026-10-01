import { describe, expect, it } from "vitest";

import {
  buildGoalInputs,
  computeGoal,
  showAmounts,
  toCents,
  type GoalAmounts,
  type GoalParams,
  type ShownAmounts,
} from "./goal-amounts";

const amounts: GoalAmounts = { currency: "EUR", annualExpenses: 24000, contribution: 800, targetAmount: 100000 };
const params: GoalParams = {
  mode: "fire",
  frequency: "monthly",
  annualReturn: 5,
  withdrawalRate: 4,
  targetYears: 10,
  volatility: 15,
  retirementYears: 40,
};
// USD por unidad: 1 EUR = 2 USD, para que las cuentas sean exactas.
const rates = { USD: 1, EUR: 2 };

describe("toCents", () => {
  it("rounds to two decimals", () => {
    expect(toCents(1.239)).toBe(1.24);
    expect(toCents(0.1 + 0.2)).toBe(0.3);
    expect(toCents(10)).toBe(10);
    expect(toCents(0)).toBe(0);
  });
});

describe("showAmounts", () => {
  it("returns the amounts untouched when the currency matches", () => {
    expect(showAmounts(amounts, "EUR", rates)).toEqual({
      annualExpenses: 24000,
      contribution: 800,
      targetAmount: 100000,
      note: null,
    });
  });

  it("converts every amount and says so", () => {
    expect(showAmounts(amounts, "USD", rates)).toEqual({
      annualExpenses: 48000,
      contribution: 1600,
      targetAmount: 200000,
      note: { kind: "converted", from: "EUR", to: "USD" },
    });
  });

  it("keeps the original amounts and warns when a rate is missing", () => {
    expect(showAmounts(amounts, "GBP", rates)).toEqual({
      annualExpenses: 24000,
      contribution: 800,
      targetAmount: 100000,
      note: { kind: "notConvertible", from: "EUR", to: "GBP" },
    });
  });
});

describe("computeGoal", () => {
  const shown: ShownAmounts = { annualExpenses: 24000, contribution: 800, targetAmount: 100000, note: null };

  it("computes the FIRE goal from expenses and withdrawal rate", () => {
    const goal = computeGoal(shown, params, 50000);
    expect(goal.mode).toBe("fire");
    expect(goal.target).toBe(600000);
    expect(goal.current).toBe(50000);
  });

  it("computes the amount goal from the target amount", () => {
    const goal = computeGoal(shown, { ...params, mode: "amount" }, 50000);
    expect(goal.mode).toBe("amount");
    expect(goal.target).toBe(100000);
  });

  it("does not blow up with a zero portfolio and zero return", () => {
    const goal = computeGoal(shown, { ...params, annualReturn: 0 }, 0);
    expect(goal.current).toBe(0);
    expect(Number.isNaN(goal.remaining)).toBe(false);
  });
});

describe("buildGoalInputs", () => {
  const shown: ShownAmounts = { annualExpenses: 30000, contribution: 500, targetAmount: 90000, note: null };

  it("overrides the goal fields and keeps the keys this block does not edit", () => {
    const inputs = buildGoalInputs({ savingsGrowth: 3, annualExpenses: 1 }, shown, params, "EUR", 12345.678);
    expect(inputs).toMatchObject({
      savingsGrowth: 3,
      annualExpenses: 30000,
      currentSavings: 12345.68,
      savings: 500,
      goalCurrency: "EUR",
      goalMode: "fire",
      targetAmount: 90000,
      targetYears: 10,
      volatility: 15,
      retirementYears: 40,
    });
  });
});
