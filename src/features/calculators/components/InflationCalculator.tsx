"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { computeInflation } from "@sextante/core/calculators/inflacion";
import { useFormat } from "@/shared/format/use-format";
import Stat from "@/shared/ui/Stat";
import TimeSeriesChart from "@/shared/charts/TimeSeriesChart";
import CalculatorLayout from "@/features/calculators/components/CalculatorLayout";
import { useBoundNumberField } from "./CalculatorState";
import NumField from "./NumField";
import { useInputs } from "./use-inputs";
import StatGrid from "@/shared/ui/StatGrid";

export default function InflationCalculator() {
  const t = useTranslations("calc.inflacion");
  const { formatEUR, formatPercent } = useFormat();

  const amount = useBoundNumberField("amount", 10000);
  const annualRate = useBoundNumberField("annualRate", 3);
  const years = useBoundNumberField("years", 20);
  const nominalReturn = useBoundNumberField("nominalReturn", 2);

  const inputs = useInputs({ amount, annualRate, years, nominalReturn });
  const result = useMemo(() => computeInflation(inputs), [inputs]);

  return (
    <CalculatorLayout
      layout="sidebar"
      inputs={
        <>
          <NumField field={amount} step={1000} />
          <NumField field={annualRate} step={0.1} min={-100} max={100} />
          <NumField field={years} step={1} max={70} />
          <NumField field={nominalReturn} step={0.1} min={0} max={100} />
        </>
      }
      results={
        <>
          <StatGrid>
            <Stat label={t("nominalNeeded")} value={formatEUR(result.nominalNeeded)} highlight />
            <Stat label={t("realValue")} value={formatEUR(result.realValue)} />
            <Stat label={t("realValueInvested")} value={formatEUR(result.realValueInvested)} />
            <Stat label={t("lossPercent")} value={formatPercent(result.lossPercent)} />
            <Stat label={t("realReturn")} value={formatPercent(result.realReturn)} />
          </StatGrid>

          <TimeSeriesChart
            title={t("chartTitle")}
            data={result.series}
            xKey="year"
            stack={[]}
            lines={[
              { key: "nominalNeeded", name: t("seriesNominal"), color: "var(--muted)" },
              { key: "realValueInvested", name: t("seriesInvested"), color: "var(--accent)" },
              { key: "realValue", name: t("seriesReal"), color: "var(--brand)" },
            ]}
            valueKey="realValue"
          />
        </>
      }
    />
  );
}
