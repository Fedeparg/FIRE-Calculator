"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { SPAIN_SAVINGS_WITHHOLDING_PCT } from "@sextante/core/fiscal/countries";
import { computeSimpleInterest } from "@sextante/core/calculators/interes-simple";
import { useFormat } from "@/shared/format/use-format";
import Stat from "@/shared/ui/Stat";
import Notice from "@/shared/ui/Notice";
import TimeSeriesChart from "@/shared/charts/TimeSeriesChart";
import BreakdownDonut from "@/shared/charts/BreakdownDonut";
import CalculatorLayout from "@/features/calculators/components/CalculatorLayout";
import { useBoundNumberField } from "./CalculatorState";
import NumField from "./NumField";
import { useInputs } from "./use-inputs";

export default function SimpleInterestCalculator() {
  const t = useTranslations("calc.interes-simple");
  const { formatEUR } = useFormat();

  const principal = useBoundNumberField("principal", 10000);
  const annualRate = useBoundNumberField("annualRate", 4);
  const years = useBoundNumberField("years", 15);
  const withholdingRate = useBoundNumberField("withholdingRate", SPAIN_SAVINGS_WITHHOLDING_PCT);

  const inputs = useInputs({ principal, annualRate, years, withholdingRate });
  const result = useMemo(() => computeSimpleInterest(inputs), [inputs]);

  return (
    <CalculatorLayout
      layout="sidebar"
      notice={<Notice>{t("note")}</Notice>}
      inputs={
        <>
          <NumField field={principal} step={1000} />
          <NumField field={annualRate} step={0.5} max={100} />
          <NumField field={years} step={1} max={70} />
          <NumField field={withholdingRate} step={1} max={100} />
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
          />

          <BreakdownDonut
            title={t("donutTitle")}
            centerLabel={t("donutCenter")}
            data={[
              { name: t("seriesContributed"), value: inputs.principal, color: "var(--brand)" },
              { name: t("seriesInterest"), value: result.totalInterest, color: "var(--accent)" },
            ]}
          />
        </>
      }
    />
  );
}
