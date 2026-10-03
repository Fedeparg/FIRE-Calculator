import { describe, expect, it } from "vitest";

import { DEFAULT_TARGET_AMOUNT } from "./goal-amounts";
import { goalPlanReducer, initialGoalPlan } from "./goal-plan";

const scenario = {
  id: "s1",
  name: "Plan",
  inputs: { annualExpenses: 30000, savings: 1000, annualReturn: 6, extra: "se conserva" },
};

describe("goalPlanReducer", () => {
  it("cargar un escenario aplica sus cifras, recuerda sus inputs y remonta los campos", () => {
    const state = goalPlanReducer(initialGoalPlan("EUR"), { type: "applyScenario", scenario });

    expect(state.amounts).toMatchObject({ annualExpenses: 30000, contribution: 1000 });
    expect(state.params.annualReturn).toBe(6);
    expect(state).toMatchObject({ selectedId: "s1", name: "Plan", loadedInputs: scenario.inputs, version: 1 });
  });

  it("pasar a modo cantidad sin cifra propone la de ejemplo en la divisa que se ve", () => {
    const shown = { annualExpenses: 24000, contribution: 800, targetAmount: 0 };
    const state = goalPlanReducer(initialGoalPlan("EUR"), { type: "setMode", mode: "amount", display: "USD", shown });

    expect(state.params.mode).toBe("amount");
    expect(state.amounts).toEqual({ ...shown, currency: "USD", targetAmount: DEFAULT_TARGET_AMOUNT });
    expect(state.version).toBe(1);
  });

  it("con cifra ya puesta, cambiar de modo no toca los importes", () => {
    const initial = initialGoalPlan("EUR");
    const shown = { annualExpenses: 24000, contribution: 800, targetAmount: 5000 };
    const state = goalPlanReducer(initial, { type: "setMode", mode: "amount", display: "EUR", shown });

    expect(state.amounts).toBe(initial.amounts);
    expect(state.version).toBe(0);
  });

  it("guardar fija el escenario cargado sin cambiar las cifras", () => {
    const initial = initialGoalPlan("EUR");
    const state = goalPlanReducer(initial, { type: "saved", scenario });

    expect(state).toMatchObject({ selectedId: "s1", loadedInputs: scenario.inputs, amounts: initial.amounts });
  });
});
