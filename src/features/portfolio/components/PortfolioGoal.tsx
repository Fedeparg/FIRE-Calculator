"use client";

import { Fragment } from "react";
import { useTranslations } from "next-intl";

import { GOAL_MODES } from "@sextante/core/portfolio/goal";
import { useGoalPlan, usePlanPersistence } from "@/features/portfolio/use-goal-plan";
import Notice from "@/shared/ui/Notice";
import SelectField from "@/shared/ui/SelectField";
import ToggleGroup from "@/shared/ui/ToggleGroup";
import PortfolioGoalFields from "./PortfolioGoalFields";
import PortfolioGoalPlanForm from "./PortfolioGoalPlanForm";
import PortfolioGoalResults from "./PortfolioGoalResults";
import PortfolioGoalSimulation from "./PortfolioGoalSimulation";

type Props = {
  /**
   * Valor de mercado de la cartera, en `display`. Es EXACTAMENTE el mismo agregado que muestra
   * el resumen (lo calcula `PortfolioDataProvider` una sola vez): comparar el objetivo con otra cifra
   * daría dos "patrimonios actuales" distintos en la misma pantalla.
   */
  marketValue: number;
  /** Posiciones incluidas en ese total. */
  valued: number;
  /** Posiciones totales: si sobran, parte de la cartera no entra y hay que decirlo. */
  total: number;
  /** Divisa elegida en la cartera. Gobierna también los importes del objetivo. */
  display: string;
  /** USD por unidad de cada divisa, para convertir los importes al cambiar de divisa. */
  rates: Record<string, number>;
};

/**
 * "Tu objetivo": une la calculadora de independencia financiera con la cartera real. El
 * usuario define su gasto anual y su tasa de retiro, y ve el patrimonio objetivo, cuánto lleva
 * de verdad (la valoración de sus posiciones), cuánto le falta y en cuánto tiempo llegaría al
 * ritmo de aportación actual.
 *
 * El cálculo NO vive aquí: es `computeGoal` (core puro y testeado) sobre `computePortfolioGoal`,
 * que a su vez delega en `computeFire` y en el motor de proyección. El estado vive en
 * `useGoalPlan` y el guardado en `usePlanPersistence`; este componente solo compone los campos,
 * los resultados y el formulario de guardado.
 *
 * **Divisa.** Los importes del objetivo se expresan siempre en la divisa elegida para el total
 * de la cartera. Al cambiarla, se convierten con las mismas tasas FX que usa el resumen; si
 * falta la tasa, se avisa en vez de comparar importes en divisas distintas.
 *
 * **Persistencia.** Se reutiliza el CRUD de escenarios guardados (`useSavedScenarios`) con el
 * slug de la calculadora FIRE: no hace falta almacenamiento nuevo y el objetivo aparece también
 * en la calculadora. Al abrir se carga el plan activo (`active`, el que enseña el Resumen). Sin
 * sesión válida el bloque sigue calculando en local, simplemente no ofrece guardar.
 */
export default function PortfolioGoal({ marketValue, valued, total, display, rates }: Props) {
  const t = useTranslations("portfolio.goal");
  const ts = useTranslations("calculator.scenarios");
  const goalPlan = useGoalPlan(display, rates, marketValue);
  const { plan, dispatch, shown, goal, updateAmounts, patchParams, changeMode } = goalPlan;
  const persistence = usePlanPersistence(goalPlan, display);

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">
          {t(plan.params.mode === "amount" ? "titleAmount" : "title")}
        </h2>
        <p className="text-sm text-muted">{t(plan.params.mode === "amount" ? "introAmount" : "intro")}</p>
      </div>

      {persistence.scenarios.length > 0 && (
        <SelectField
          label={t("planLabel")}
          value={plan.selectedId}
          onChange={(id) => void persistence.select(id)}
          options={persistence.scenarios.map((s) => ({ value: s.id, label: s.name }))}
          help={t("planHint")}
        />
      )}
      {persistence.listStatus !== "loading" && persistence.scenarios.length === 0 && (
        <Notice variant="info">{t("noPlan")}</Notice>
      )}

      <ToggleGroup
        label={t("modeLabel")}
        value={plan.params.mode}
        options={GOAL_MODES.map((m) => ({ value: m, label: t(`mode.${m}`) }))}
        onChange={changeMode}
        size="md"
      />

      {/* La `key` remonta los campos al cargar un escenario o al cambiar de divisa. */}
      <Fragment key={`${plan.version}-${display}`}>
        <PortfolioGoalFields
          display={display}
          shown={shown}
          params={plan.params}
          onAmountsChange={updateAmounts}
          onParamsChange={patchParams}
        />
      </Fragment>

      <PortfolioGoalResults goal={goal} display={display} valued={valued} total={total} note={shown.note} />

      <Notice variant="info">{t("assumptions")}</Notice>

      {/* La simulación mide si el dinero DURA un retiro: solo tiene sentido en modo FIRE. Misma
          `key` que los campos de arriba: cargar un escenario remonta también estos. */}
      {plan.params.mode === "fire" && (
        <PortfolioGoalSimulation
          key={`sim-${plan.version}`}
          annualExpenses={shown.annualExpenses}
          contribution={shown.contribution}
          frequency={plan.params.frequency}
          withdrawalRate={plan.params.withdrawalRate}
          annualReturn={plan.params.annualReturn}
          currentValue={goal.current}
          volatility={plan.params.volatility}
          onVolatilityChange={(volatility) => patchParams({ volatility })}
          retirementYears={plan.params.retirementYears}
          onRetirementYearsChange={(retirementYears) => patchParams({ retirementYears })}
        />
      )}

      {persistence.listStatus === "ready" && (
        <PortfolioGoalPlanForm
          name={plan.name}
          onNameChange={(name) => dispatch({ type: "setName", name })}
          updating={persistence.updating}
          quotaReached={persistence.quotaReached}
          saving={persistence.saving}
          onSubmit={(event) => {
            event.preventDefault();
            void persistence.save();
          }}
        />
      )}

      {persistence.errorKey && <p className="text-sm text-warning">{ts(persistence.errorKey)}</p>}

      {/* Guardar y cargar cambian cifras de golpe: se anuncia, no solo se ve. */}
      <p role="status" aria-live="polite" className="sr-only">
        {persistence.status}
      </p>
    </section>
  );
}
