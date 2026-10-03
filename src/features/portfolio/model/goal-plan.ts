// State of the portfolio's "Your goal" block as a pure reducer: which amounts and
// parameters the plan has, which saved scenario is loaded and under what name it will be saved.
// No React: tested in node. The `useGoalPlan` hook wires it to `useReducer`.

import {
  DEFAULT_TARGET_AMOUNT,
  amountsFromSettings,
  paramsFromSettings,
  type GoalAmounts,
  type GoalParams,
} from "@/features/portfolio/model/goal-amounts";
import { goalSettingsFromInputs } from "@/features/portfolio/model/goal-scenario";

/** The minimum of a saved scenario the plan needs. */
type ScenarioLike = { id: string; name: string; inputs: Record<string, unknown> };

export type GoalPlanState = {
  /**
   * Amounts WITH the currency they were entered in (or the one the scenario was saved in). They
   * are not rewritten when the portfolio currency changes: conversion is derived at render time.
   */
  amounts: GoalAmounts;
  params: GoalParams;
  /**
   * Changes whenever the amounts are applied in one go (loading a scenario, proposing the example
   * figure) and serves as the fields' `key`, forcing them to remount with the new values.
   */
  version: number;
  /** Loaded scenario (`""` if none). */
  selectedId: string;
  /**
   * Full `inputs` of the loaded scenario. Kept so that updating it does not lose the keys this
   * block does not edit (e.g. the savings growth the calculator does have): the original is saved
   * with the fields from here overwritten.
   */
  loadedInputs: Record<string, unknown>;
  /** Name it will be saved under. */
  name: string;
};

export type GoalPlanAction =
  | { type: "applyScenario"; scenario: ScenarioLike }
  | { type: "setAmounts"; amounts: GoalAmounts }
  | { type: "patchParams"; patch: Partial<GoalParams> }
  /** Changes mode; switching to amount without a figure proposes the example (`shown`: amounts on screen). */
  | { type: "setMode"; mode: GoalParams["mode"]; display: string; shown: Omit<GoalAmounts, "currency"> }
  | { type: "setName"; name: string }
  | { type: "saved"; scenario: ScenarioLike };

/** Initial values of the FIRE calculator (the same as `GOAL_FIELD_SPECS`). */
export const DEFAULT_GOAL_PARAMS: GoalParams = {
  mode: "fire",
  frequency: "monthly",
  annualReturn: 5,
  withdrawalRate: 4,
  targetYears: 10,
  volatility: 15,
  retirementYears: 40,
};

export function initialGoalPlan(display: string): GoalPlanState {
  return {
    amounts: { currency: display, annualExpenses: 24000, contribution: 800, targetAmount: DEFAULT_TARGET_AMOUNT },
    params: DEFAULT_GOAL_PARAMS,
    version: 0,
    selectedId: "",
    loadedInputs: {},
    name: "",
  };
}

export function goalPlanReducer(state: GoalPlanState, action: GoalPlanAction): GoalPlanState {
  switch (action.type) {
    case "applyScenario": {
      // Amounts are stored in THEIR currency (`goalCurrency`, or EUR if it comes from the calculator).
      const settings = goalSettingsFromInputs(action.scenario.inputs);
      return {
        amounts: amountsFromSettings(settings),
        params: paramsFromSettings(settings),
        version: state.version + 1,
        selectedId: action.scenario.id,
        loadedInputs: action.scenario.inputs,
        name: action.scenario.name,
      };
    }
    case "setAmounts":
      return { ...state, amounts: action.amounts };
    case "patchParams":
      return { ...state, params: { ...state.params, ...action.patch } };
    case "setMode": {
      const params = { ...state.params, mode: action.mode };
      // A FIRE plan carries no target figure: switching to amount mode proposes the example one
      // instead of a target of 0 that would count as already reached.
      if (action.mode !== "amount" || action.shown.targetAmount > 0) return { ...state, params };
      return {
        ...state,
        params,
        amounts: { ...action.shown, currency: action.display, targetAmount: DEFAULT_TARGET_AMOUNT },
        version: state.version + 1,
      };
    }
    case "setName":
      return { ...state, name: action.name };
    case "saved":
      return { ...state, selectedId: action.scenario.id, loadedInputs: action.scenario.inputs };
  }
}
