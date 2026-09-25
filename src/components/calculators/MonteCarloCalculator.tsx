"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  MAX_RETIREMENT_YEARS,
  MAX_VOLATILITY,
  simulateFire,
} from "@/core/calculators/fire-montecarlo";
import { useFormat } from "@/lib/format";
import NumberField from "../ui/NumberField";
import Notice from "../ui/Notice";
import Stat from "../ui/Stat";
import TimeSeriesChart from "../charts/TimeSeriesChart";
import CalculatorLayout from "../CalculatorLayout";
import { useNumberField } from "./CalculatorState";

export default function MonteCarloCalculator() {
  const t = useTranslations("calc.simulador-montecarlo");
  const tc = useTranslations("chart");
  const { formatPercent } = useFormat();

  // Mismas claves que la calculadora FIRE donde el dato es el mismo.
  const [annualExpenses, setAnnualExpenses] = useNumberField("annualExpenses", 24000);
  const [currentSavings, setCurrentSavings] = useNumberField("currentSavings", 20000);
  const [monthlySavings, setMonthlySavings] = useNumberField("savings", 800);
  const [annualReturn, setAnnualReturn] = useNumberField("annualReturn", 5);
  const [volatility, setVolatility] = useNumberField("volatility", 15);
  const [withdrawalRate, setWithdrawalRate] = useNumberField("withdrawalRate", 4);
  const [retirementYears, setRetirementYears] = useNumberField("retirementYears", 40);

  // 5.000 vidas × ~120 años: unos pocos milisegundos, así que basta con memoizar en el hilo
  // principal. La semilla es fija, por eso el resultado es idéntico en servidor y cliente.
  const result = useMemo(
    () =>
      simulateFire({
        annualExpenses,
        currentSavings,
        monthlySavings,
        annualReturn,
        volatility,
        withdrawalRate,
        retirementYears,
      }),
    [annualExpenses, currentSavings, monthlySavings, annualReturn, volatility, withdrawalRate, retirementYears],
  );

  const { p10, p50, p90 } = result.yearsToFire;
  const medianLabel =
    p50 === null ? t("notReached") : p50 === 0 ? t("alreadyFree") : t("years", { years: p50 });
  const rangeLabel =
    p10 === null
      ? null
      : p90 === null
        ? t("rangeOpen", { p10 })
        : t("range", { p10, p90 });
  const deterministicLabel =
    result.deterministicYearsToFire === null
      ? t("deterministicNotReached")
      : t("deterministic", { years: result.deterministicYearsToFire });

  return (
    <CalculatorLayout
      inputCount={7}
      notice={<Notice>{t("note")}</Notice>}
      inputs={
        <>
          <NumberField label={t("annualExpenses")} value={annualExpenses} onChange={setAnnualExpenses} min={0} step={1000} help={t("help.annualExpenses")} />
          <NumberField label={t("currentSavings")} value={currentSavings} onChange={setCurrentSavings} min={0} step={1000} help={t("help.currentSavings")} />
          <NumberField label={t("monthlySavings")} value={monthlySavings} onChange={setMonthlySavings} min={0} step={50} help={t("help.monthlySavings")} />
          <NumberField label={t("annualReturn")} value={annualReturn} onChange={setAnnualReturn} step={0.5} max={100} help={t("help.annualReturn")} />
          <NumberField label={t("volatility")} value={volatility} onChange={setVolatility} step={1} min={0} max={MAX_VOLATILITY} help={t("help.volatility")} />
          <NumberField label={t("withdrawalRate")} value={withdrawalRate} onChange={setWithdrawalRate} step={0.1} min={1} max={100} help={t("help.withdrawalRate")} />
          <NumberField label={t("retirementYears")} value={retirementYears} onChange={setRetirementYears} step={1} min={0} max={MAX_RETIREMENT_YEARS} help={t("help.retirementYears")} />
        </>
      }
      results={
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Stat label={t("successRate")} value={formatPercent(result.successRate * 100)} highlight />
            <Stat label={t("medianYears")} value={medianLabel} />
            <Stat label={t("reachRate")} value={formatPercent(result.reachRate * 100)} />
            <Stat label={t("survivalRate")} value={formatPercent(result.survivalRate * 100)} />
          </div>

          <p className="text-sm text-muted">
            {rangeLabel && <>{rangeLabel} </>}
            {deterministicLabel}
          </p>

          <TimeSeriesChart
            title={t("chartTitle")}
            data={result.series}
            xKey="year"
            stack={[]}
            bands={[
              { lowKey: "p10", highKey: "p90", name: t("band80"), color: "var(--brand)" },
              { lowKey: "p25", highKey: "p75", name: t("band50"), color: "var(--brand)" },
            ]}
            lines={[
              { key: "p50", name: t("seriesMedian"), color: "var(--brand)", dashed: false },
              { key: "deterministic", name: t("seriesDeterministic"), color: "var(--accent)" },
              { key: "target", name: t("seriesTarget"), color: "var(--muted)" },
            ]}
            valueKey="p50"
            selectable={false}
            showTotal={false}
            labels={{ axisX: tc("axisYear") }}
          />
        </>
      }
    />
  );
}
