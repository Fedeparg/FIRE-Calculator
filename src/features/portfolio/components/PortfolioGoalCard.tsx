"use client";

import { useTranslations } from "next-intl";

import { FIRE_CALCULATOR_SLUG } from "@sextante/core/portfolio-goal";
import { goalProgress, goalSettingsFromInputs } from "@/features/portfolio/model/goal-scenario";
import { Link } from "@/i18n/navigation";
import { useFormat } from "@/lib/format";
import { useSavedScenarios } from "@/features/scenarios/use-saved-scenarios";

type Props = {
  /** Valor de mercado de la cartera en `display` (el mismo total que el resto del Resumen). */
  marketValue: number;
  display: string;
  rates: Record<string, number>;
};

/**
 * Resumen del objetivo FIRE en la pestaña Resumen: el porcentaje conseguido y el tiempo que
 * falta, con el plan activo (`activeScenario`, el mismo que carga la pestaña Objetivo), y su
 * nombre para que se sepa cuál es. Sin escenario guardado invita a definirlo, en vez de inventar uno.
 */
export default function PortfolioGoalCard({ marketValue, display, rates }: Props) {
  const t = useTranslations("portfolio.goalCard");
  const tGoal = useTranslations("portfolio.goal");
  const { formatCurrency, formatPercent } = useFormat();
  // Cualquier fallo (sin sesión, red, servidor) se trata como "sin plan guardado".
  const { status, active } = useSavedScenarios(FIRE_CALCULATOR_SLUG);
  const settings = active ? goalSettingsFromInputs(active.inputs) : null;

  const progress = settings ? goalProgress(settings, marketValue, display, rates) : null;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">{t("title")}</h2>
        <Link href="/portfolio/objetivo" className="text-sm font-medium text-brand underline-offset-2 hover:underline">
          {active ? t("details") : t("define")}
        </Link>
      </div>

      {active && <p className="-mt-2 truncate text-sm text-muted">{t("plan", { name: active.name })}</p>}
      {status === "loading" && <p className="text-sm text-muted">{t("loading")}</p>}
      {status !== "loading" && !active && <p className="text-sm text-muted">{t("empty")}</p>}
      {active && progress === null && <p className="text-sm text-muted">{t("notConvertible")}</p>}
      {progress && progress.progress !== null && (
        <>
          <p className="text-3xl font-semibold tabular-nums text-foreground">
            {formatPercent(Math.floor(progress.progress))}
          </p>
          <div
            role="progressbar"
            aria-label={tGoal("progressAria")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress.progress)}
            className="h-2.5 overflow-hidden rounded-full bg-surface-2"
          >
            <div className="h-full rounded-full bg-brand" style={{ width: `${progress.progress}%` }} />
          </div>
          <p className="text-sm text-muted">
            {progress.reached
              ? tGoal("reached")
              : progress.mode === "amount"
                ? t("summaryAmount", {
                    target: formatCurrency(progress.target, display),
                    year: new Date().getFullYear() + progress.deadlineYears,
                    onTrack: String(progress.onTrack),
                    required:
                      progress.requiredContribution === null
                        ? "—"
                        : formatCurrency(progress.requiredContribution, display),
                  })
                : t("summary", {
                    target: formatCurrency(progress.target, display),
                    years: progress.yearsToTarget ?? -1,
                  })}
          </p>
        </>
      )}
    </section>
  );
}
