"use client";

import { useTranslations } from "next-intl";

import type { CurrencyNote } from "@/features/portfolio/model/goal-amounts";
import type { GoalOutcome } from "@sextante/core/portfolio/goal";
import { useFormat } from "@/shared/format/use-format";
import Stat from "@/shared/ui/Stat";
import StatGrid from "@/shared/ui/StatGrid";
import { useTodayUtc } from "@/shared/ui/use-today-utc";
import { yearOf } from "@sextante/core/dates";

type Props = {
  goal: GoalOutcome;
  display: string;
  /** Positions included in the total, and total positions: if there are more, it must be said. */
  valued: number;
  total: number;
  /** Currency conversion notice for the amounts, if applicable. */
  note: CurrencyNote;
};

/** What the goal says: figures, progress bar and notes (term, currency, excluded positions). */
export default function PortfolioGoalResults({ goal, display, valued, total, note }: Props) {
  const t = useTranslations("portfolio.goal");
  const tp = useTranslations("portfolio.summary");
  const { formatCurrency, formatPercent } = useFormat();
  const currentYear = yearOf(useTodayUtc());

  const excluded = total - valued;
  const etaValue = goal.reached
    ? t("etaReached")
    : goal.yearsToTarget === null
      ? "—"
      : t("etaYears", { years: goal.yearsToTarget });

  return (
    <>
      <StatGrid>
        <Stat label={t("target")} value={formatCurrency(goal.target, display)} highlight />
        <Stat label={t("current")} value={formatCurrency(goal.current, display)} />
        <Stat label={t("remaining")} value={formatCurrency(goal.remaining, display)} />
        {goal.mode === "fire" ? (
          <Stat label={t("eta")} value={etaValue} />
        ) : (
          <Stat
            label={t("requiredContribution")}
            value={goal.requiredContribution === null ? "—" : formatCurrency(goal.requiredContribution, display)}
          />
        )}
      </StatGrid>

      {goal.progress !== null && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">{t("progressAria")}</span>
            <span className="font-semibold tabular-nums text-foreground">{formatPercent(goal.progress)}</span>
          </div>
          <div
            role="progressbar"
            aria-label={t("progressAria")}
            aria-valuemin={0}
            aria-valuemax={100}
            // Not rounded to an integer: announcing 4.43 % as "4" loses precision for no
            // reason (ARIA allows decimals). Capped at two decimals so the floating-point noise
            // is not carried along.
            aria-valuenow={Math.round(goal.progress * 100) / 100}
            aria-valuetext={t("progressValue", { percent: formatPercent(goal.progress) })}
            className="h-3 w-full overflow-hidden rounded-full bg-surface-2"
          >
            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${goal.progress}%` }} />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1 text-xs text-muted">
        {goal.reached && <p className="text-success">{t("reached")}</p>}
        {goal.mode === "amount" && !goal.reached && (
          <p className={goal.onTrack ? "text-success" : undefined}>
            {t(goal.onTrack ? "amountOnTrack" : "amountOffTrack", {
              projected: formatCurrency(goal.projectedAtDeadline, display),
              year: currentYear + goal.deadlineYears,
            })}
          </p>
        )}
        {goal.mode === "fire" && !goal.reached && goal.yearsToTarget === null && <p>{t("etaNever")}</p>}
        {goal.mode === "fire" && !goal.reached && goal.yearsToTarget !== null && (
          // The current year is read once on mount, in UTC like every other portfolio date.
          <p>{t("etaYear", { year: currentYear + goal.yearsToTarget })}</p>
        )}
        {valued === 0 && <p>{t("noValuation")}</p>}
        {excluded > 0 && <p>{tp("excluded", { count: excluded, total })}</p>}
        <p>{t("currencyHint", { currency: display })}</p>
        {note && (
          <p className={note.kind === "notConvertible" ? "text-warning" : undefined}>
            {t(note.kind === "converted" ? "currencyConverted" : "currencyNotConvertible", {
              from: note.from,
              to: note.to,
            })}
          </p>
        )}
      </div>
    </>
  );
}
