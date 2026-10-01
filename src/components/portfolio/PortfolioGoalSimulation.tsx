"use client";

import { useDeferredValue, useMemo } from "react";
import { useTranslations } from "next-intl";

import { MAX_RETIREMENT_YEARS, MAX_VOLATILITY } from "@sextante/core/calculators/fire-montecarlo";
import { encodeFieldValue } from "@/core/calculator-url-state";
import { monthlyContribution, simulatePortfolioGoal } from "@sextante/core/portfolio-goal";
import type { Frequency } from "@sextante/core/projection";
import { Link } from "@/i18n/navigation";
import { useFormat } from "@/lib/format";
import NumberField from "../ui/NumberField";
import Stat from "../ui/Stat";

type Props = {
  /** Importes ya expresados en la divisa que se está viendo (los mismos que usa el objetivo). */
  annualExpenses: number;
  contribution: number;
  frequency: Frequency;
  withdrawalRate: number;
  annualReturn: number;
  /** Valor de mercado de la cartera: el mismo "patrimonio actual" que el resto del bloque. */
  currentValue: number;
  volatility: number;
  onVolatilityChange: (value: number) => void;
  retirementYears: number;
  onRetirementYearsChange: (value: number) => void;
};

/**
 * "¿Y si el mercado no acompaña?": la parte Monte Carlo del objetivo. El objetivo determinista
 * responde "cuándo llegas si todo va según la media"; esto responde "con qué probabilidad
 * llegas y aguantas", partiendo del valor REAL de la cartera.
 *
 * El cálculo es `simulatePortfolioGoal` (core puro). Aquí solo se difiere: 5.000 vidas cuestan
 * decenas de milisegundos y el bloque se recalcula con cada tecla, así que `useDeferredValue`
 * deja que los campos respondan al instante y la simulación vaya por detrás, igual que en el
 * simulador.
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
   * Enlace al simulador con los MISMOS datos, en sus claves de URL. El simulador no tiene
   * frecuencia: el ahorro va ya convertido a mensual y redondeado a céntimos, que es lo que
   * admite el campo. El patrimonio actual se redondea también: en la URL basta con el euro.
   */
  const simulatorHref = useMemo(() => {
    const params = new URLSearchParams({
      annualExpenses: encodeFieldValue(annualExpenses),
      currentSavings: encodeFieldValue(Math.round(currentValue)),
      savings: encodeFieldValue(Math.round(monthlyContribution(contribution, frequency) * 100) / 100),
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
