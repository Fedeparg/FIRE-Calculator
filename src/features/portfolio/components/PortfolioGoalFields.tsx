"use client";

import { useTranslations } from "next-intl";

import { FIRE_SEARCH_MAX_YEARS } from "@sextante/core/calculators/fire";
import { FREQUENCIES } from "@sextante/core/projection";
import type { GoalAmounts, GoalParams, ShownAmounts } from "@/features/portfolio/model/goal-amounts";
import NumberField from "@/shared/ui/NumberField";
import SelectField from "@/shared/ui/SelectField";

type Props = {
  /** Currency being viewed: label for the amounts. */
  display: string;
  /** Amounts already expressed in `display`. */
  shown: ShownAmounts;
  params: GoalParams;
  /** Typing an amount pins it to the currency being viewed (see `useGoalPlan`). */
  onAmountsChange: (next: Partial<Omit<GoalAmounts, "currency">>) => void;
  onParamsChange: (patch: Partial<GoalParams>) => void;
};

/** Editable goal fields; which ones are visible depends on the mode (FIRE or amount). */
export default function PortfolioGoalFields({ display, shown, params, onAmountsChange, onParamsChange }: Props) {
  const t = useTranslations("portfolio.goal");
  const tf = useTranslations("frequency");
  const frequencyOptions = FREQUENCIES.map((f) => ({ value: f, label: tf(f) }));

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {params.mode === "fire" ? (
        <>
          <NumberField
            label={t("annualExpenses", { currency: display })}
            value={shown.annualExpenses}
            onChange={(value) => onAmountsChange({ annualExpenses: value })}
            step={1000}
            help={t("help.annualExpenses")}
          />
          <NumberField
            label={t("withdrawalRate")}
            value={params.withdrawalRate}
            onChange={(withdrawalRate) => onParamsChange({ withdrawalRate })}
            step={0.1}
            min={1}
            max={100}
            help={t("help.withdrawalRate")}
          />
        </>
      ) : (
        <>
          <NumberField
            label={t("targetAmount", { currency: display })}
            value={shown.targetAmount}
            onChange={(value) => onAmountsChange({ targetAmount: value })}
            step={1000}
            help={t("help.targetAmount")}
          />
          <NumberField
            label={t("targetYears")}
            value={params.targetYears}
            onChange={(value) => onParamsChange({ targetYears: Math.round(value) })}
            step={1}
            min={0}
            max={FIRE_SEARCH_MAX_YEARS}
            help={t("help.targetYears")}
          />
        </>
      )}
      <NumberField
        label={t("contribution", { currency: display })}
        value={shown.contribution}
        onChange={(value) => onAmountsChange({ contribution: value })}
        step={50}
        help={t("help.contribution")}
      />
      <SelectField
        label={tf("label")}
        value={params.frequency}
        options={frequencyOptions}
        onChange={(frequency) => onParamsChange({ frequency })}
        help={tf("help")}
      />
      <NumberField
        label={t("annualReturn")}
        value={params.annualReturn}
        onChange={(annualReturn) => onParamsChange({ annualReturn })}
        step={0.5}
        max={100}
        help={t("help.annualReturn")}
      />
    </div>
  );
}
