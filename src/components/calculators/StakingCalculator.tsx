"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { computeStaking } from "@/core/calculators/staking";
import { formatEUR } from "@/core/format";
import NumberField from "../ui/NumberField";
import Stat from "../ui/Stat";
import Notice from "../ui/Notice";
import TimeSeriesChart from "../charts/TimeSeriesChart";
import BreakdownDonut from "../charts/BreakdownDonut";
import CalculatorLayout from "../CalculatorLayout";

export default function StakingCalculator() {
  const t = useTranslations("calc.staking");
  const tc = useTranslations("chart");

  const [principal, setPrincipal] = useState(5000);
  const [apy, setApy] = useState(8);
  const [years, setYears] = useState(5);
  const [withholdingRate, setWithholdingRate] = useState(19);

  const result = useMemo(
    () => computeStaking({ principal, apy, years, withholdingRate }),
    [principal, apy, years, withholdingRate],
  );

  return (
    <CalculatorLayout
      inputCount={4}
      notice={<Notice>{t("note")}</Notice>}
      inputs={
        <>
          <NumberField label={t("principal")} value={principal} onChange={setPrincipal} step={500} help={t("help.principal")} />
          <NumberField label={t("apy")} value={apy} onChange={setApy} step={0.5} max={1000} help={t("help.apy")} />
          <NumberField label={t("years")} value={years} onChange={setYears} step={1} max={50} help={t("help.years")} />
          <NumberField label={t("withholdingRate")} value={withholdingRate} onChange={setWithholdingRate} step={1} max={100} help={t("help.withholdingRate")} />
        </>
      }
      results={
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={t("netFinalValue")} value={formatEUR(result.netFinalValue)} highlight />
            <Stat label={t("finalValue")} value={formatEUR(result.finalValue)} />
            <Stat label={t("rewards")} value={formatEUR(result.rewards)} />
            <Stat label={t("netRewards")} value={formatEUR(result.netRewards)} />
          </div>

          <TimeSeriesChart
            title={t("chartTitle")}
            data={result.series}
            xKey="year"
            stack={[
              { key: "contributed", name: t("seriesPrincipal"), color: "var(--brand)" },
              { key: "interest", name: t("seriesRewards"), color: "var(--accent)" },
            ]}
            valueKey="value"
            contributedKey="contributed"
            interestKey="interest"
            labels={{
              axisX: tc("axisYear"),
              total: tc("total"),
              selectionTitle: tc("selectionTitle"),
              growth: tc("growth"),
              contributed: tc("contributed"),
              interest: tc("interest"),
            }}
          />

          <BreakdownDonut
            title={t("donutTitle")}
            centerLabel={t("donutCenter")}
            data={[
              { name: t("seriesPrincipal"), value: principal, color: "var(--brand)" },
              { name: t("seriesRewards"), value: result.rewards, color: "var(--accent)" },
            ]}
          />
        </>
      }
    />
  );
}
