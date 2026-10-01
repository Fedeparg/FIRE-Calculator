"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { computeCompound } from "@sextante/core/calculators/interes-compuesto";
import { COMPOUNDING_FREQUENCIES, FREQUENCIES, type Frequency } from "@sextante/core/projection";
import { useFormat } from "@/shared/format/use-format";
import NumberField from "@/shared/ui/NumberField";
import SelectField from "@/shared/ui/SelectField";
import Stat from "@/shared/ui/Stat";
import TimeSeriesChart from "@/shared/charts/TimeSeriesChart";
import BreakdownDonut from "@/shared/charts/BreakdownDonut";
import CalculatorLayout from "@/features/calculators/components/CalculatorLayout";
import { useNumberField, useOptionField } from "./CalculatorState";
import StatGrid from "@/shared/ui/StatGrid";

export default function CompoundCalculator() {
  const t = useTranslations("calc.interes-compuesto");
  const { formatEUR } = useFormat();
  const tf = useTranslations("frequency");
  const tc = useTranslations("chart");

  const [initial, setInitial] = useNumberField("initial", 5000);
  const [contribution, setContribution] = useNumberField("contribution", 300);
  const [frequency, setFrequency] = useOptionField<Frequency>("frequency", "monthly", FREQUENCIES);
  // Por defecto anual: la tasa se lee como rentabilidad anual y no se capitaliza dentro del año
  const [compounding, setCompounding] = useOptionField<Frequency>("compounding", "annual", COMPOUNDING_FREQUENCIES);
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
        compounding,
        annualRate,
        years,
        annualFee,
        contributionGrowth,
        inflationRate,
      }),
    [initial, contribution, frequency, compounding, annualRate, years, annualFee, contributionGrowth, inflationRate],
  );

  const frequencyOptions = FREQUENCIES.map((f) => ({ value: f, label: tf(f) }));
  const compoundingOptions = COMPOUNDING_FREQUENCIES.map((f) => ({ value: f, label: tf(f) }));

  return (
    <CalculatorLayout
      layout="grid"
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
          <SelectField
            label={t("compounding")}
            value={compounding}
            options={compoundingOptions}
            onChange={setCompounding}
            help={t("help.compounding")}
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
          <StatGrid>
            <Stat label={t("finalValue")} value={formatEUR(result.finalValue)} highlight />
            {inflationRate > 0 && <Stat label={t("finalRealValue")} value={formatEUR(result.finalRealValue)} />}
            <Stat label={t("totalContributed")} value={formatEUR(result.totalContributed)} />
            <Stat label={t("totalInterest")} value={formatEUR(result.totalInterest)} />
          </StatGrid>

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
