import { describe, expect, it } from "vitest";

import { goalProgress, goalSettingsFromInputs } from "./goal-scenario";

// USD por unidad: 1 EUR = 1,10 USD.
const RATES = { USD: 1, EUR: 1.1 };

describe("goalSettingsFromInputs", () => {
  it("lee un escenario guardado desde la cartera, con su divisa", () => {
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

  it("asume euros si el escenario viene de la calculadora (sin goalCurrency)", () => {
    expect(goalSettingsFromInputs({ annualExpenses: 24000 }).currency).toBe("EUR");
  });

  it("deja a 0 los importes que faltan y usa los valores por defecto en el resto", () => {
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

  it("calcula el progreso en la misma divisa", () => {
    expect(goalProgress(settings, 150000, "EUR", RATES)).toMatchObject({
      target: 600000,
      current: 150000,
      progress: 25,
    });
  });

  it("convierte los importes del objetivo a la divisa que se está viendo", () => {
    expect(goalProgress(settings, 165000, "USD", RATES)?.target).toBeCloseTo(660000, 6);
  });

  it("no compara divisas distintas si falta la tasa", () => {
    expect(goalProgress(settings, 100, "JPY", RATES)).toBeNull();
  });

  it("en modo cantidad mide la cifra objetivo y el plazo, convertidos", () => {
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

  it("los escenarios sin modo son FIRE", () => {
    expect(settings.mode).toBe("fire");
    expect(goalProgress(settings, 0, "EUR", RATES)?.mode).toBe("fire");
  });
});
