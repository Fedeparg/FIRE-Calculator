"use client";

import { useTranslations } from "next-intl";

import type { CurrencyNote } from "@/features/portfolio/model/goal-amounts";
import type { GoalOutcome } from "@/features/portfolio/model/goal-scenario";
import { useFormat } from "@/lib/format";
import Stat from "@/shared/ui/Stat";

type Props = {
  goal: GoalOutcome;
  display: string;
  /** Posiciones incluidas en el total, y posiciones totales: si sobran, hay que decirlo. */
  valued: number;
  total: number;
  /** Aviso de conversión de divisa de los importes, si procede. */
  note: CurrencyNote;
};

/** Lo que dice el objetivo: cifras, barra de progreso y notas (plazo, divisa, posiciones excluidas). */
export default function PortfolioGoalResults({ goal, display, valued, total, note }: Props) {
  const t = useTranslations("portfolio.goal");
  const tp = useTranslations("portfolio.summary");
  const { formatCurrency, formatPercent } = useFormat();

  const excluded = total - valued;
  const etaValue = goal.reached
    ? t("etaReached")
    : goal.yearsToTarget === null
      ? "—"
      : t("etaYears", { years: goal.yearsToTarget });

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
      </div>

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
            // Sin redondear a entero: un 4,43 % anunciado como "4" pierde precisión sin
            // motivo (ARIA admite decimales). Se acota a dos para no arrastrar el ruido
            // de la coma flotante.
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
              year: new Date().getFullYear() + goal.deadlineYears,
            })}
          </p>
        )}
        {goal.mode === "fire" && !goal.reached && goal.yearsToTarget === null && <p>{t("etaNever")}</p>}
        {goal.mode === "fire" && !goal.reached && goal.yearsToTarget !== null && (
          // El año se deriva en el render. Servidor y cliente pintan el mismo salvo que la
          // hidratación cruzara la medianoche del 31 de diciembre, y React lo corregiría solo.
          <p>{t("etaYear", { year: new Date().getFullYear() + goal.yearsToTarget })}</p>
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
