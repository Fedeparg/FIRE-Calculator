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
 * Estado y cálculo del objetivo de la cartera. El estado es un `useReducer` sobre el reductor
 * puro `goalPlanReducer` (varias piezas que cambian juntas, p. ej. cargar un escenario toca
 * importes, parámetros, nombre e id a la vez); lo convertido y el resultado se DERIVAN en cada
 * render, que es lo que evita sincronizar estado con efectos.
 */
export function useGoalPlan(display: string, rates: Record<string, number>, marketValue: number) {
  // El inicializador perezoso (tercer argumento) solo corre al montar.
  const [plan, dispatch] = useReducer(goalPlanReducer, display, initialGoalPlan);
  const shown = useMemo(() => showAmounts(plan.amounts, display, rates), [plan.amounts, display, rates]);
  const goal = useMemo(() => computeGoal(shown, plan.params, marketValue), [shown, plan.params, marketValue]);

  return {
    plan,
    dispatch,
    shown,
    goal,
    /**
     * Escribir en un importe lo fija en la divisa que se está viendo: se guardan los tres ya
     * convertidos, para no acabar con un campo en euros y otro en dólares. Si no había tasa (se
     * mostraban sin convertir), editar uno da por hecho que todos son ya de esta divisa: es lo
     * que significa teclear en un campo etiquetado con ella.
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
 * Guardar y cargar el objetivo como escenario de la calculadora FIRE (`useSavedScenarios`): no
 * hace falta almacenamiento nuevo y el plan aparece también en la calculadora. Al terminar la
 * carga inicial se aplica el plan activo (el que enseñan el Resumen y los avisos). Sin sesión
 * válida el bloque sigue calculando en local, simplemente no ofrece guardar.
 */
export function usePlanPersistence({ plan, dispatch, shown, goal }: ReturnType<typeof useGoalPlan>, display: string) {
  const t = useTranslations("portfolio.goal");
  const scenarios = useSavedScenarios(FIRE_CALCULATOR_SLUG);
  const [saving, setSaving] = useState(false);
  // Último mensaje de estado (guardado/actualizado/cargado) para la región viva.
  const [status, setStatus] = useState("");

  // Se aplica el plan activo una sola vez, al terminar la carga. Se ajusta durante el render (el
  // patrón de React para derivar estado de un cambio) en vez de con un efecto a posteriori.
  const [initialApplied, setInitialApplied] = useState(false);
  if (!initialApplied && scenarios.status !== "loading") {
    setInitialApplied(true);
    if (scenarios.active) dispatch({ type: "applyScenario", scenario: scenarios.active });
  }

  /**
   * Elegir un plan lo convierte en el activo: se aplica ya y se "toca" en la API (PATCH sin
   * cambios, que renueva `updatedAt`) para que el Resumen y los avisos lo sigan. Si ese PATCH
   * falla, el plan se queda cargado aquí pero se avisa (con el error) de que no se ha activado.
   */
  async function select(id: string) {
    const scenario = scenarios.scenarios.find((s) => s.id === id);
    if (!scenario) return;
    dispatch({ type: "applyScenario", scenario });
    const activated = await scenarios.activate(id);
    if (activated) setStatus(t("activated", { name: activated.name }));
  }

  /**
   * Guarda el objetivo. Si el nombre coincide con el del escenario cargado se ACTUALIZA ese
   * (PATCH); si se cambia el nombre, se crea uno nuevo (POST). Guardar renueva `updatedAt`: el
   * plan guardado pasa a ser el activo (primero de la lista).
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
    /** Guardar actualizará el escenario cargado (mismo nombre) en vez de crear uno. */
    updating: scenarios.scenarios.some((s) => s.id === plan.selectedId && s.name === plan.name.trim()),
    select,
    save,
  };
}
