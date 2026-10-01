"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { computeInflation } from "@sextante/core/calculators/inflacion";
import { useFormat } from "@/shared/format/use-format";
import NumberField from "@/shared/ui/NumberField";
import Stat from "@/shared/ui/Stat";
import TimeSeriesChart from "@/shared/charts/TimeSeriesChart";
import CalculatorLayout from "@/features/calculators/components/CalculatorLayout";
import { useNumberField } from "./CalculatorState";

export default function InflationCalculator() {
  const t = useTranslations("calc.inflacion");
  const { formatEUR, formatPercent } = useFormat();
  const tc = useTranslations("chart");

  const [amount, setAmount] = useNumberField("amount", 10000);
  const [annualRate, setAnnualRate] = useNumberField("annualRate", 3);
  const [years, setYears] = useNumberField("years", 20);
  const [nominalReturn, setNominalReturn] = useNumberField("nominalReturn", 2);

  const result = useMemo(
    () => computeInflation({ amount, annualRate, years, nominalReturn }),
    [amount, annualRate, years, nominalReturn],
  );

  return (
    <CalculatorLayout
      inputCount={4}
      inputs={
        <>
          <NumberField label={t("amount")} value={amount} onChange={setAmount} step={1000} help={t("help.amount")} />
          <NumberField
            label={t("annualRate")}
            value={annualRate}
            onChange={setAnnualRate}
            step={0.1}
            min={-100}
            max={100}
            help={t("help.annualRate")}
          />
          <NumberField label={t("years")} value={years} onChange={setYears} step={1} max={70} help={t("help.years")} />
          <NumberField
            label={t("nominalReturn")}
            value={nominalReturn}
            onChange={setNominalReturn}
            step={0.1}
            min={0}
            max={100}
            help={t("help.nominalReturn")}
          />
        </>
      }
      results={
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={t("nominalNeeded")} value={formatEUR(result.nominalNeeded)} highlight />
            <Stat label={t("realValue")} value={formatEUR(result.realValue)} />
            <Stat label={t("realValueInvested")} value={formatEUR(result.realValueInvested)} />
            <Stat label={t("lossPercent")} value={formatPercent(result.lossPercent)} />
            <Stat label={t("realReturn")} value={formatPercent(result.realReturn)} />
          </div>

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
            labels={{
              axisX: tc("axisYear"),
              total: tc("total"),
              selectionTitle: tc("selectionTitle"),
              growth: tc("growth"),
              contributed: tc("contributed"),
              interest: tc("interest"),
            }}
          />
        </>
      }
    />
  );
}
