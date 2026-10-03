"use client";

import { useMemo, useReducer, useState } from "react";
import { useTranslations } from "next-intl";

import { MAX_SCENARIOS_PER_USER } from "@sextante/core/contracts";
import { FIRE_CALCULATOR_SLUG, type GoalMode } from "@sextante/core/portfolio/goal";
import {
  buildGoalInputs,
  computeGoal,
  showAmounts,
  type GoalAmounts,
  type GoalParams,
} from "@/features/portfolio/model/goal-amounts";
import { goalPlanReducer, initialGoalPlan } from "@/features/portfolio/model/goal-plan";
import { useSavedScenarios } from "@/features/scenarios/use-saved-scenarios";

/**
 * State and computation of the portfolio goal. State is a `useReducer` over the pure reducer
 * `goalPlanReducer` (several pieces that change together, e.g. loading a scenario touches
 * amounts, parameters, name and id at once); the converted values and the result are DERIVED on
 * every render, which avoids syncing state through effects.
 */
export function useGoalPlan(display: string, rates: Record<string, number>, marketValue: number) {
  // The lazy initializer (third argument) only runs on mount.
  const [plan, dispatch] = useReducer(goalPlanReducer, display, initialGoalPlan);
  const shown = useMemo(() => showAmounts(plan.amounts, display, rates), [plan.amounts, display, rates]);
  const goal = useMemo(() => computeGoal(shown, plan.params, marketValue), [shown, plan.params, marketValue]);

  return {
    plan,
    dispatch,
    shown,
    goal,
    /**
     * Typing into an amount pins it to the currency being viewed: all three are stored already
     * converted, so we never end up with one field in euros and another in dollars. If there was
     * no rate (they were shown unconverted), editing one assumes all of them are already in this
     * currency: that is what typing into a field labelled with it means.
     */
    updateAmounts(next: Partial<Omit<GoalAmounts, "currency">>) {
      dispatch({
        type: "setAmounts",
        amounts: {
          currency: display,
          annualExpenses: next.annualExpenses ?? shown.annualExpenses,
          contribution: next.contribution ?? shown.contribution,
          targetAmount: next.targetAmount ?? shown.targetAmount,
        },
      });
    },
    patchParams: (patch: Partial<GoalParams>) => dispatch({ type: "patchParams", patch }),
    changeMode: (mode: GoalMode) => dispatch({ type: "setMode", mode, display, shown }),
  };
}

/**
 * Saves and loads the goal as a FIRE calculator scenario (`useSavedScenarios`): no new storage is
 * needed and the plan also shows up in the calculator. When the initial load finishes, the active
 * plan (the one the Summary and the alerts show) is applied. Without a valid session the block
 * still computes locally; it just does not offer saving.
 */
export function usePlanPersistence({ plan, dispatch, shown, goal }: ReturnType<typeof useGoalPlan>, display: string) {
  const t = useTranslations("portfolio.goal");
  const scenarios = useSavedScenarios(FIRE_CALCULATOR_SLUG);
  const [saving, setSaving] = useState(false);
  // Last status message (saved/updated/loaded) for the live region.
  const [status, setStatus] = useState("");

  // The active plan is applied once, when loading finishes. It is adjusted during render (the
  // React pattern for deriving state from a change) instead of in an after-the-fact effect.
  const [initialApplied, setInitialApplied] = useState(false);
  if (!initialApplied && scenarios.status !== "loading") {
    setInitialApplied(true);
    if (scenarios.active) dispatch({ type: "applyScenario", scenario: scenarios.active });
  }

  /**
   * Choosing a plan makes it the active one: it is applied immediately and "touched" in the API
   * (a no-op PATCH that renews `updatedAt`) so the Summary and the alerts follow it. If that PATCH
   * fails, the plan stays loaded here but the user is told (with the error) it was not activated.
   */
  async function select(id: string) {
    const scenario = scenarios.scenarios.find((s) => s.id === id);
    if (!scenario) return;
    dispatch({ type: "applyScenario", scenario });
    const activated = await scenarios.activate(id);
    if (activated) setStatus(t("activated", { name: activated.name }));
  }

  /**
   * Saves the goal. If the name matches the loaded scenario's, that one is UPDATED (PATCH); if the
   * name changed, a new one is created (POST). Saving renews `updatedAt`: the saved plan becomes
   * the active one (first in the list).
   */
  async function save() {
    const trimmed = plan.name.trim();
    const loaded = scenarios.scenarios.find((s) => s.id === plan.selectedId);
    const updating = loaded !== undefined && loaded.name === trimmed;
    const inputs = buildGoalInputs(plan.loadedInputs, shown, plan.params, display, goal.current);

    setSaving(true);
    const saved = updating
      ? await scenarios.update(loaded.id, { name: trimmed, inputs }, { promote: true })
      : await scenarios.create(trimmed, inputs);
    setSaving(false);
    if (saved) {
      dispatch({ type: "saved", scenario: saved });
      setStatus(t(updating ? "updated" : "saved", { name: saved.name }));
    }
  }

  return {
    listStatus: scenarios.status,
    scenarios: scenarios.scenarios,
    errorKey: scenarios.error,
    saving,
    status,
    quotaReached: scenarios.scenarios.length >= MAX_SCENARIOS_PER_USER,
    /** Saving will update the loaded scenario (same name) instead of creating a new one. */
    updating: scenarios.scenarios.some((s) => s.id === plan.selectedId && s.name === plan.name.trim()),
    select,
    save,
  };
}
