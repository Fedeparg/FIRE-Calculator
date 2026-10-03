"use client";

import { Fragment } from "react";
import { useTranslations } from "next-intl";

import { GOAL_MODES } from "@sextante/core/portfolio/goal";
import { useGoalPlan, usePlanPersistence } from "@/features/portfolio/use-goal-plan";
import Notice from "@/shared/ui/Notice";
import SelectField from "@/shared/ui/SelectField";
import ToggleGroup from "@/shared/ui/ToggleGroup";
import { useApiErrorText } from "@/shared/api/use-api-error-text";
import PortfolioGoalFields from "./PortfolioGoalFields";
import PortfolioGoalPlanForm from "./PortfolioGoalPlanForm";
import PortfolioGoalResults from "./PortfolioGoalResults";
import PortfolioGoalSimulation from "./PortfolioGoalSimulation";

type Props = {
  /**
   * Portfolio market value, in `display`. It is EXACTLY the same aggregate the summary shows
   * (computed once by `PortfolioDataProvider`): comparing the goal against another figure would
   * show two different "current net worth" values on the same screen.
   */
  marketValue: number;
  /** Positions included in that total. */
  valued: number;
  /** Total positions: if there are more, part of the portfolio is left out and that must be said. */
  total: number;
  /** Currency chosen in the portfolio. It also governs the goal amounts. */
  display: string;
  /** USD per unit of each currency, to convert the amounts when the currency changes. */
  rates: Record<string, number>;
};

/**
 * "Your goal": joins the financial independence calculator with the real portfolio. The user
 * sets their annual spending and withdrawal rate, and sees the target net worth, how much they
 * actually have (the valuation of their positions), how much is missing and how long it would
 * take at the current contribution rate.
 *
 * The computation does NOT live here: it is `computeGoal` (pure, tested core) on top of
 * `computePortfolioGoal`, which in turn delegates to `computeFire` and the projection engine.
 * State lives in `useGoalPlan` and saving in `usePlanPersistence`; this component only composes
 * the fields, the results and the save form.
 *
 * **Currency.** Goal amounts are always expressed in the currency chosen for the portfolio total.
 * When it changes, they are converted with the same FX rates the summary uses; if the rate is
 * missing, we warn instead of comparing amounts in different currencies.
 *
 * **Persistence.** The saved scenarios CRUD (`useSavedScenarios`) is reused with the FIRE
 * calculator's slug: no new storage is needed and the goal also shows up in the calculator. On
 * open, the active plan is loaded (`active`, the one the Summary shows). Without a valid session
 * the block still computes locally; it just does not offer saving.
 */
export default function PortfolioGoal({ marketValue, valued, total, display, rates }: Props) {
  const t = useTranslations("portfolio.goal");
  const ts = useTranslations("calculator.scenarios");
  const scenarioErrorText = useApiErrorText(ts);
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

      {/* The `key` remounts the fields when a scenario is loaded or the currency changes. */}
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

      {/* The simulation measures whether the money LASTS through retirement: it only makes sense in
          FIRE mode. Same `key` as the fields above: loading a scenario remounts these too. */}
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

      {persistence.errorKey && <p className="text-sm text-warning">{scenarioErrorText(persistence.errorKey)}</p>}

      {/* Saving and loading change figures at once: it is announced, not just shown. */}
      <p role="status" aria-live="polite" className="sr-only">
        {persistence.status}
      </p>
    </section>
  );
}
