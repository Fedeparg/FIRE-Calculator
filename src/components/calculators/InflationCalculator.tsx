"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { computeInflation } from "@/core/calculators/inflacion";
import { formatEUR, formatPercent } from "@/core/format";
import NumberField from "../ui/NumberField";
import Stat from "../ui/Stat";
import TimeSeriesChart from "../charts/TimeSeriesChart";
import CalculatorLayout from "../CalculatorLayout";

export default function InflationCalculator() {
  const t = useTranslations("calc.inflacion");
  const tc = useTranslations("chart");

  const [amount, setAmount] = useState(10000);
  const [annualRate, setAnnualRate] = useState(3);
  const [years, setYears] = useState(20);
  const [nominalReturn, setNominalReturn] = useState(2);

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
          <NumberField label={t("annualRate")} value={annualRate} onChange={setAnnualRate} step={0.1} min={-100} max={100} help={t("help.annualRate")} />
          <NumberField label={t("years")} value={years} onChange={setYears} step={1} max={70} help={t("help.years")} />
          <NumberField label={t("nominalReturn")} value={nominalReturn} onChange={setNominalReturn} step={0.1} min={0} max={100} help={t("help.nominalReturn")} />
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
