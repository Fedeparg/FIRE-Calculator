"use client";

import { useDeferredValue, useMemo } from "react";
import { useTranslations } from "next-intl";

import { MAX_RETIREMENT_YEARS, MAX_VOLATILITY } from "@sextante/core/calculators/fire-montecarlo";
import { encodeFieldValue } from "@/shared/url-state/url-state";
import { monthlyContribution, simulatePortfolioGoal } from "@sextante/core/portfolio/goal";
import type { Frequency } from "@sextante/core/projection";
import { Link } from "@/i18n/navigation";
import { useFormat } from "@/shared/format/use-format";
import NumberField from "@/shared/ui/NumberField";
import Stat from "@/shared/ui/Stat";
import { roundCents } from "@sextante/core/money";

type Props = {
  /** Amounts already expressed in the currency being viewed (the same ones the goal uses). */
  annualExpenses: number;
  contribution: number;
  frequency: Frequency;
  withdrawalRate: number;
  annualReturn: number;
  /** Portfolio market value: the same "current net worth" as the rest of the block. */
  currentValue: number;
  volatility: number;
  onVolatilityChange: (value: number) => void;
  retirementYears: number;
  onRetirementYearsChange: (value: number) => void;
};

/**
 * "What if the market does not cooperate?": the Monte Carlo part of the goal. The deterministic
 * goal answers "when do you get there if everything tracks the average"; this answers "how likely
 * are you to get there and last", starting from the portfolio's REAL value.
 *
 * The computation is `simulatePortfolioGoal` (pure core). This component only defers it: 5,000
 * lives cost tens of milliseconds and the block recomputes on every keystroke, so
 * `useDeferredValue` lets the fields respond instantly while the simulation trails behind, just
 * like in the simulator.
 */
export default function PortfolioGoalSimulation({
  annualExpenses,
  contribution,
  frequency,
  withdrawalRate,
  annualReturn,
  currentValue,
  volatility,
  onVolatilityChange,
  retirementYears,
  onRetirementYearsChange,
}: Props) {
  const t = useTranslations("portfolio.goal.montecarlo");
  const { formatPercent } = useFormat();

  const inputs = useDeferredValue(
    useMemo(
      () => ({
        annualExpenses,
        contribution,
        frequency,
        withdrawalRate,
        annualReturn,
        currentValue,
        volatility,
        retirementYears,
      }),
      [
        annualExpenses,
        contribution,
        frequency,
        withdrawalRate,
        annualReturn,
        currentValue,
        volatility,
        retirementYears,
      ],
    ),
  );
  const result = useMemo(() => simulatePortfolioGoal(inputs), [inputs]);

  const { p10, p50, p90 } = result.yearsToFire;
  const yearsLabel = (years: number | null) =>
    years === null ? t("never") : years === 0 ? t("now") : t("years", { years });

  /**
   * Link to the simulator with the SAME data, in its URL keys. The simulator has no frequency:
   * savings are already converted to monthly and rounded to cents, which is what the field
   * accepts. The current net worth is rounded too: whole euros are enough in the URL.
   */
  const simulatorHref = useMemo(() => {
    const params = new URLSearchParams({
      annualExpenses: encodeFieldValue(annualExpenses),
      currentSavings: encodeFieldValue(Math.round(currentValue)),
      savings: encodeFieldValue(roundCents(monthlyContribution(contribution, frequency))),
      annualReturn: encodeFieldValue(annualReturn),
      volatility: encodeFieldValue(volatility),
      withdrawalRate: encodeFieldValue(withdrawalRate),
      retirementYears: encodeFieldValue(retirementYears),
    });
    return `/calculadoras/simulador-montecarlo?${params.toString()}`;
  }, [
    annualExpenses,
    currentValue,
    contribution,
    frequency,
    annualReturn,
    volatility,
    withdrawalRate,
    retirementYears,
  ]);

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-foreground">{t("title")}</h3>
        <p className="text-xs text-muted">{t("intro")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label={t("volatility")}
          value={volatility}
          onChange={onVolatilityChange}
          step={1}
          min={0}
          max={MAX_VOLATILITY}
          help={t("help.volatility")}
        />
        <NumberField
          label={t("retirementYears")}
          value={retirementYears}
          onChange={onRetirementYearsChange}
          step={1}
          min={0}
          max={MAX_RETIREMENT_YEARS}
          help={t("help.retirementYears")}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label={t("successRate")} value={formatPercent(result.successRate * 100)} highlight />
        <Stat label={t("medianYears")} value={yearsLabel(p50)} />
      </div>

      <p className="text-xs text-muted">
        {p10 !== null && t("range", { fast: yearsLabel(p10), slow: yearsLabel(p90) })} {t("assumptions")}{" "}
        <Link href={simulatorHref} className="font-medium text-brand underline underline-offset-2">
          {t("openSimulator")}
        </Link>
      </p>
    </div>
  );
}
