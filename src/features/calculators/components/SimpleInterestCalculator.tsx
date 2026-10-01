"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { computeSimpleInterest } from "@sextante/core/calculators/interes-simple";
import { useFormat } from "@/shared/format/use-format";
import NumberField from "@/shared/ui/NumberField";
import Stat from "@/shared/ui/Stat";
import Notice from "@/shared/ui/Notice";
import TimeSeriesChart from "@/shared/charts/TimeSeriesChart";
import BreakdownDonut from "@/shared/charts/BreakdownDonut";
import CalculatorLayout from "@/features/calculators/components/CalculatorLayout";
import { useNumberField } from "./CalculatorState";

export default function SimpleInterestCalculator() {
  const t = useTranslations("calc.interes-simple");
  const { formatEUR } = useFormat();
  const tc = useTranslations("chart");

  const [principal, setPrincipal] = useNumberField("principal", 10000);
  const [annualRate, setAnnualRate] = useNumberField("annualRate", 4);
  const [years, setYears] = useNumberField("years", 15);
  const [withholdingRate, setWithholdingRate] = useNumberField("withholdingRate", 19);

  const result = useMemo(
    () => computeSimpleInterest({ principal, annualRate, years, withholdingRate }),
    [principal, annualRate, years, withholdingRate],
  );

  return (
    <CalculatorLayout
      layout="sidebar"
      notice={<Notice>{t("note")}</Notice>}
      inputs={
        <>
          <NumberField
            label={t("principal")}
            value={principal}
            onChange={setPrincipal}
            step={1000}
            help={t("help.principal")}
          />
          <NumberField
            label={t("annualRate")}
            value={annualRate}
            onChange={setAnnualRate}
            step={0.5}
            max={100}
            help={t("help.annualRate")}
          />
          <NumberField label={t("years")} value={years} onChange={setYears} step={1} max={70} help={t("help.years")} />
          <NumberField
            label={t("withholdingRate")}
            value={withholdingRate}
            onChange={setWithholdingRate}
            step={1}
            max={100}
            help={t("help.withholdingRate")}
          />
        </>
      }
      results={
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Stat label={t("netFinalValue")} value={formatEUR(result.netFinalValue)} highlight />
            <Stat label={t("finalValue")} value={formatEUR(result.finalValue)} />
            <Stat label={t("totalInterest")} value={formatEUR(result.totalInterest)} />
            <Stat label={t("netInterest")} value={formatEUR(result.netInterest)} />
            <Stat label={t("withheld")} value={formatEUR(result.withheld)} />
          </div>

          <TimeSeriesChart
            title={t("chartTitle")}
            data={result.series}
            xKey="year"
            stack={[
              { key: "contributed", name: t("seriesContributed"), color: "var(--brand)" },
              { key: "interest", name: t("seriesInterest"), color: "var(--accent)" },
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
              { name: t("seriesContributed"), value: principal, color: "var(--brand)" },
              { name: t("seriesInterest"), value: result.totalInterest, color: "var(--accent)" },
            ]}
          />
        </>
      }
    />
  );
}
