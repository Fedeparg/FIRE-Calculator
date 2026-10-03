import { describe, expect, it } from "vitest";

import { DEFAULT_TARGET_AMOUNT } from "./goal-amounts";
import { goalPlanReducer, initialGoalPlan } from "./goal-plan";

const scenario = {
  id: "s1",
  name: "Plan",
  inputs: { annualExpenses: 30000, savings: 1000, annualReturn: 6, extra: "se conserva" },
};

describe("goalPlanReducer", () => {
  it("loading a scenario applies its figures, remembers its inputs and remounts the fields", () => {
    const state = goalPlanReducer(initialGoalPlan("EUR"), { type: "applyScenario", scenario });

    expect(state.amounts).toMatchObject({ annualExpenses: 30000, contribution: 1000 });
    expect(state.params.annualReturn).toBe(6);
    expect(state).toMatchObject({ selectedId: "s1", name: "Plan", loadedInputs: scenario.inputs, version: 1 });
  });

  it("switching to amount mode without a figure proposes the example in the viewed currency", () => {
    const shown = { annualExpenses: 24000, contribution: 800, targetAmount: 0 };
    const state = goalPlanReducer(initialGoalPlan("EUR"), { type: "setMode", mode: "amount", display: "USD", shown });

    expect(state.params.mode).toBe("amount");
    expect(state.amounts).toEqual({ ...shown, currency: "USD", targetAmount: DEFAULT_TARGET_AMOUNT });
    expect(state.version).toBe(1);
  });

  it("with a figure already set, switching mode leaves the amounts alone", () => {
    const initial = initialGoalPlan("EUR");
    const shown = { annualExpenses: 24000, contribution: 800, targetAmount: 5000 };
    const state = goalPlanReducer(initial, { type: "setMode", mode: "amount", display: "EUR", shown });

    expect(state.amounts).toBe(initial.amounts);
    expect(state.version).toBe(0);
  });

  it("saving pins the loaded scenario without changing the figures", () => {
    const initial = initialGoalPlan("EUR");
    const state = goalPlanReducer(initial, { type: "saved", scenario });

    expect(state).toMatchObject({ selectedId: "s1", loadedInputs: scenario.inputs, amounts: initial.amounts });
  });
});
