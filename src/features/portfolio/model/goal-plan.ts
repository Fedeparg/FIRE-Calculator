// Estado del bloque "Tu objetivo" de la cartera como un reductor puro: qué importes y
// parámetros tiene el plan, qué escenario guardado está cargado y con qué nombre se guardará.
// Sin React: se prueba en node. El hook `useGoalPlan` lo conecta con `useReducer`.

import {
  DEFAULT_TARGET_AMOUNT,
  amountsFromSettings,
  paramsFromSettings,
  type GoalAmounts,
  type GoalParams,
} from "@/features/portfolio/model/goal-amounts";
import { goalSettingsFromInputs } from "@/features/portfolio/model/goal-scenario";

/** Lo mínimo de un escenario guardado que necesita el plan. */
type ScenarioLike = { id: string; name: string; inputs: Record<string, unknown> };

export type GoalPlanState = {
  /**
   * Importes CON la divisa en la que se introdujeron (o en la que se guardó el escenario). No
   * se reescriben al cambiar la divisa de la cartera: la conversión se deriva al pintar.
   */
  amounts: GoalAmounts;
  params: GoalParams;
  /**
   * Cambia cada vez que los importes se aplican de golpe (cargar un escenario, proponer la cifra
   * de ejemplo) y sirve de `key` de los campos, forzando su remontaje con los valores nuevos.
   */
  version: number;
  /** Escenario cargado (`""` si ninguno). */
  selectedId: string;
  /**
   * `inputs` completos del escenario cargado. Se conservan para que al actualizarlo no se
   * pierdan las claves que este bloque no edita (p. ej. el crecimiento del ahorro que sí tiene
   * la calculadora): se guarda el original con los campos de aquí sobrescritos.
   */
  loadedInputs: Record<string, unknown>;
  /** Nombre con el que se guardará. */
  name: string;
};

export type GoalPlanAction =
  | { type: "applyScenario"; scenario: ScenarioLike }
  | { type: "setAmounts"; amounts: GoalAmounts }
  | { type: "patchParams"; patch: Partial<GoalParams> }
  /** Cambia de modo; al pasar a cantidad sin cifra, propone la de ejemplo (`shown`: importes que se ven). */
  | { type: "setMode"; mode: GoalParams["mode"]; display: string; shown: Omit<GoalAmounts, "currency"> }
  | { type: "setName"; name: string }
  | { type: "saved"; scenario: ScenarioLike };

/** Valores iniciales de la calculadora FIRE (los mismos que `GOAL_FIELD_SPECS`). */
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
      // Los importes se guardan en SU divisa (`goalCurrency`, o EUR si viene de la calculadora).
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
      // Un plan FIRE no trae cifra objetivo: al pasar a modo cantidad se propone la de ejemplo
      // en vez de un objetivo de 0 que se daría por alcanzado.
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
