import { describe, expect, it } from "vitest";

import { goalProgress, goalSettingsFromInputs } from "./goal-scenario";

// USD per unit: 1 EUR = 1.10 USD.
const RATES = { USD: 1, EUR: 1.1 };

describe("goalSettingsFromInputs", () => {
  it("reads a scenario saved from the portfolio, with its currency", () => {
    expect(
      goalSettingsFromInputs({
        annualExpenses: 30000,
        savings: 1000,
        frequency: "quarterly",
        annualReturn: 6,
        withdrawalRate: 3.5,
        goalCurrency: "USD",
      }),
    ).toMatchObject({
      currency: "USD",
      annualExpenses: 30000,
      contribution: 1000,
      frequency: "quarterly",
      annualReturn: 6,
      withdrawalRate: 3.5,
    });
  });

  it("assumes euros if the scenario comes from the calculator (no goalCurrency)", () => {
    expect(goalSettingsFromInputs({ annualExpenses: 24000 }).currency).toBe("EUR");
  });

  it("sets missing amounts to 0 and uses the defaults for everything else", () => {
    expect(goalSettingsFromInputs({})).toMatchObject({
      annualExpenses: 0,
      contribution: 0,
      frequency: "monthly",
      withdrawalRate: 4,
    });
    expect(goalSettingsFromInputs(null).annualExpenses).toBe(0);
    expect(goalSettingsFromInputs({ frequency: "hourly" }).frequency).toBe("monthly");
  });
});

describe("goalProgress", () => {
  const settings = goalSettingsFromInputs({ annualExpenses: 24000, savings: 1000, withdrawalRate: 4 });

  it("computes progress in the same currency", () => {
    expect(goalProgress(settings, 150000, "EUR", RATES)).toMatchObject({
      target: 600000,
      current: 150000,
      progress: 25,
    });
  });

  it("converts the goal amounts into the currency being viewed", () => {
    expect(goalProgress(settings, 165000, "USD", RATES)?.target).toBeCloseTo(660000, 6);
  });

  it("does not compare different currencies if the rate is missing", () => {
    expect(goalProgress(settings, 100, "JPY", RATES)).toBeNull();
  });

  it("in amount mode measures the target figure and the term, converted", () => {
    const amount = goalSettingsFromInputs({
      goalMode: "amount",
      targetAmount: 100000,
      targetYears: 5,
      savings: 0,
      annualReturn: 0,
      goalCurrency: "EUR",
    });
    expect(amount).toMatchObject({ mode: "amount", targetAmount: 100000, targetYears: 5 });
    const outcome = goalProgress(amount, 55000, "USD", RATES);
    expect(outcome?.mode).toBe("amount");
    expect(outcome?.target).toBeCloseTo(110000, 6);
    expect(outcome?.progress).toBeCloseTo(50, 6);
    expect(outcome?.mode === "amount" && outcome.onTrack).toBe(false);
  });

  it("scenarios without a mode are FIRE", () => {
    expect(settings.mode).toBe("fire");
    expect(goalProgress(settings, 0, "EUR", RATES)?.mode).toBe("fire");
  });
});
