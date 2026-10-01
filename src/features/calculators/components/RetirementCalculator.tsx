"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { computeRetirement } from "@sextante/core/calculators/ahorro-jubilacion";
import { useFormat } from "@/lib/format";
import NumberField from "@/shared/ui/NumberField";
import Stat from "@/shared/ui/Stat";
import Notice from "@/shared/ui/Notice";
import TimeSeriesChart from "@/shared/charts/TimeSeriesChart";
import BreakdownDonut from "@/shared/charts/BreakdownDonut";
import CalculatorLayout from "@/features/calculators/components/CalculatorLayout";
import { useNumberField } from "./CalculatorState";

export default function RetirementCalculator() {
  const t = useTranslations("calc.ahorro-jubilacion");
  const { formatEUR, formatEURCents, formatNumber } = useFormat();
  const tc = useTranslations("chart");

  const [currentAge, setCurrentAge] = useNumberField("currentAge", 30);
  const [retirementAge, setRetirementAge] = useNumberField("retirementAge", 67);
  const [currentSavings, setCurrentSavings] = useNumberField("currentSavings", 15000);
  const [monthlySavings, setMonthlySavings] = useNumberField("monthlySavings", 300);
  const [annualReturn, setAnnualReturn] = useNumberField("annualReturn", 6);
  const [inflationRate, setInflationRate] = useNumberField("inflationRate", 2.5);
  const [annualFee, setAnnualFee] = useNumberField("annualFee", 0.3);
  const [contributionGrowth, setContributionGrowth] = useNumberField("contributionGrowth", 0);

  const result = useMemo(
    () =>
      computeRetirement({
        currentAge,
        retirementAge,
        currentSavings,
        monthlySavings,
        annualReturn,
        inflationRate,
        annualFee,
        contributionGrowth,
      }),
    [
      currentAge,
      retirementAge,
      currentSavings,
      monthlySavings,
      annualReturn,
      inflationRate,
      annualFee,
      contributionGrowth,
    ],
  );

  return (
    <CalculatorLayout
      inputCount={8}
      notice={<Notice>{t("note")}</Notice>}
      inputs={
        <>
          <NumberField
            label={t("currentAge")}
            value={currentAge}
            onChange={setCurrentAge}
            step={1}
            max={100}
            help={t("help.currentAge")}
          />
          <NumberField
            label={t("retirementAge")}
            value={retirementAge}
            onChange={setRetirementAge}
            step={1}
            max={100}
            help={t("help.retirementAge")}
          />
          <NumberField
            label={t("currentSavings")}
            value={currentSavings}
            onChange={setCurrentSavings}
            step={1000}
            help={t("help.currentSavings")}
          />
          <NumberField
            label={t("monthlySavings")}
            value={monthlySavings}
            onChange={setMonthlySavings}
            step={50}
            help={t("help.monthlySavings")}
          />
          <NumberField
            label={t("annualReturn")}
            value={annualReturn}
            onChange={setAnnualReturn}
            step={0.5}
            min={-100}
            max={100}
            help={t("help.annualReturn")}
          />
          <NumberField
            label={t("inflationRate")}
            value={inflationRate}
            onChange={setInflationRate}
            step={0.1}
            min={0}
            max={100}
            help={t("help.inflationRate")}
          />
          <NumberField
            label={t("annualFee")}
            value={annualFee}
            onChange={setAnnualFee}
            step={0.1}
            min={0}
            max={100}
            help={t("help.annualFee")}
          />
          <NumberField
            label={t("contributionGrowth")}
            value={contributionGrowth}
            onChange={setContributionGrowth}
            step={0.5}
            min={0}
            max={100}
            help={t("help.contributionGrowth")}
          />
        </>
      }
      results={
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={t("finalRealValue")} value={formatEUR(result.finalRealValue)} highlight />
            <Stat label={t("finalValue")} value={formatEUR(result.finalValue)} />
            <Stat label={t("monthlyIncome")} value={formatEURCents(result.monthlyIncome)} />
            <Stat label={t("monthlyIncomeNominal")} value={formatEURCents(result.monthlyIncomeNominal)} />
            <Stat label={t("yearsToRetirement")} value={formatNumber(result.yearsToRetirement)} />
          </div>

          <TimeSeriesChart
            title={t("chartTitle")}
            data={result.series}
            xKey="year"
            stack={[
              { key: "contributed", name: t("seriesContributed"), color: "var(--brand)" },
              { key: "interest", name: t("seriesInterest"), color: "var(--accent)" },
            ]}
            lines={[{ key: "realValue", name: t("seriesReal"), color: "var(--muted)" }]}
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
              { name: t("seriesContributed"), value: result.totalContributed, color: "var(--brand)" },
              { name: t("seriesInterest"), value: result.totalInterest, color: "var(--accent)" },
            ]}
          />
        </>
      }
    />
  );
}
