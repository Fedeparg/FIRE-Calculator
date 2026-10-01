"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { computeCompound } from "@sextante/core/calculators/interes-compuesto";
import { FREQUENCIES, type Frequency } from "@sextante/core/projection";
import { useFormat } from "@/lib/format";
import NumberField from "@/shared/ui/NumberField";
import SelectField from "@/shared/ui/SelectField";
import Stat from "@/shared/ui/Stat";
import TimeSeriesChart from "@/shared/charts/TimeSeriesChart";
import BreakdownDonut from "@/shared/charts/BreakdownDonut";
import CalculatorLayout from "@/features/calculators/components/CalculatorLayout";
import { useNumberField, useOptionField } from "./CalculatorState";

export default function CompoundCalculator() {
  const t = useTranslations("calc.interes-compuesto");
  const { formatEUR } = useFormat();
  const tf = useTranslations("frequency");
  const tc = useTranslations("chart");

  const [initial, setInitial] = useNumberField("initial", 5000);
  const [contribution, setContribution] = useNumberField("contribution", 300);
  const [frequency, setFrequency] = useOptionField<Frequency>("frequency", "monthly", FREQUENCIES);
  const [annualRate, setAnnualRate] = useNumberField("annualRate", 7);
  const [years, setYears] = useNumberField("years", 25);
  // Extras (desactivados por defecto)
  const [annualFee, setAnnualFee] = useNumberField("annualFee", 0);
  const [contributionGrowth, setContributionGrowth] = useNumberField("contributionGrowth", 0);
  const [inflationRate, setInflationRate] = useNumberField("inflationRate", 0);

  const result = useMemo(
    () =>
      computeCompound({
        initial,
        contribution,
        frequency,
        annualRate,
        years,
        annualFee,
        contributionGrowth,
        inflationRate,
      }),
    [initial, contribution, frequency, annualRate, years, annualFee, contributionGrowth, inflationRate],
  );

  const frequencyOptions = FREQUENCIES.map((f) => ({ value: f, label: tf(f) }));

  return (
    <CalculatorLayout
      inputCount={8}
      inputs={
        <>
          <NumberField
            label={t("initial")}
            value={initial}
            onChange={setInitial}
            step={1000}
            help={t("help.initial")}
          />
          <NumberField
            label={t("contribution")}
            value={contribution}
            onChange={setContribution}
            step={50}
            help={t("help.contribution")}
          />
          <SelectField
            label={tf("label")}
            value={frequency}
            options={frequencyOptions}
            onChange={setFrequency}
            help={tf("help")}
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
            label={t("annualFee")}
            value={annualFee}
            onChange={setAnnualFee}
            step={0.1}
            max={100}
            help={t("help.annualFee")}
          />
          <NumberField
            label={t("contributionGrowth")}
            value={contributionGrowth}
            onChange={setContributionGrowth}
            step={0.5}
            max={100}
            help={t("help.contributionGrowth")}
          />
          <NumberField
            label={t("inflationRate")}
            value={inflationRate}
            onChange={setInflationRate}
            step={0.5}
            max={100}
            help={t("help.inflationRate")}
          />
        </>
      }
      results={
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={t("finalValue")} value={formatEUR(result.finalValue)} highlight />
            {inflationRate > 0 && <Stat label={t("finalRealValue")} value={formatEUR(result.finalRealValue)} />}
            <Stat label={t("totalContributed")} value={formatEUR(result.totalContributed)} />
            <Stat label={t("totalInterest")} value={formatEUR(result.totalInterest)} />
          </div>

          <TimeSeriesChart
            title={t("chartTitle")}
            data={result.series}
            xKey="year"
            stack={[
              { key: "contributed", name: tc("contributed"), color: "var(--brand)" },
              { key: "interest", name: tc("interest"), color: "var(--accent)" },
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
              { name: tc("contributed"), value: result.totalContributed, color: "var(--brand)" },
              { name: tc("interest"), value: result.totalInterest, color: "var(--accent)" },
            ]}
          />
        </>
      }
    />
  );
}
