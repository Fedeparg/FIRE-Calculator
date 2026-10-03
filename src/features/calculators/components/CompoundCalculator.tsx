"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { computeCompound } from "@sextante/core/calculators/interes-compuesto";
import { COMPOUNDING_FREQUENCIES, FREQUENCIES, type Frequency } from "@sextante/core/projection";
import { useFormat } from "@/shared/format/use-format";
import SelectField from "@/shared/ui/SelectField";
import Stat from "@/shared/ui/Stat";
import TimeSeriesChart from "@/shared/charts/TimeSeriesChart";
import BreakdownDonut from "@/shared/charts/BreakdownDonut";
import CalculatorLayout from "@/features/calculators/components/CalculatorLayout";
import { useBoundNumberField, useBoundOptionField } from "./CalculatorState";
import NumField from "./NumField";
import { useInputs } from "./use-inputs";
import StatGrid from "@/shared/ui/StatGrid";

export default function CompoundCalculator() {
  const t = useTranslations("calc.interes-compuesto");
  const { formatEUR } = useFormat();
  const tf = useTranslations("frequency");
  const tc = useTranslations("chart");

  const initial = useBoundNumberField("initial", 5000);
  const contribution = useBoundNumberField("contribution", 300);
  const frequency = useBoundOptionField<Frequency>("frequency", "monthly", FREQUENCIES);
  // Annual by default: the rate reads as an annual return and is not compounded within the year
  const compounding = useBoundOptionField<Frequency>("compounding", "annual", COMPOUNDING_FREQUENCIES);
  const annualRate = useBoundNumberField("annualRate", 7);
  const years = useBoundNumberField("years", 25);
  // Extras (off by default)
  const annualFee = useBoundNumberField("annualFee", 0);
  const contributionGrowth = useBoundNumberField("contributionGrowth", 0);
  const inflationRate = useBoundNumberField("inflationRate", 0);

  const inputs = useInputs({
    initial,
    contribution,
    frequency,
    compounding,
    annualRate,
    years,
    annualFee,
    contributionGrowth,
    inflationRate,
  });
  const result = useMemo(() => computeCompound(inputs), [inputs]);

  const frequencyOptions = FREQUENCIES.map((f) => ({ value: f, label: tf(f) }));
  const compoundingOptions = COMPOUNDING_FREQUENCIES.map((f) => ({ value: f, label: tf(f) }));

  return (
    <CalculatorLayout
      layout="grid"
      inputs={
        <>
          <NumField field={initial} step={1000} />
          <NumField field={contribution} step={50} />
          <SelectField
            label={tf("label")}
            value={frequency.value}
            options={frequencyOptions}
            onChange={frequency.set}
            help={tf("help")}
          />
          <SelectField
            label={t("compounding")}
            value={compounding.value}
            options={compoundingOptions}
            onChange={compounding.set}
            help={t("help.compounding")}
          />
          <NumField field={annualRate} step={0.5} max={100} />
          <NumField field={years} step={1} max={70} />
          <NumField field={annualFee} step={0.1} max={100} />
          <NumField field={contributionGrowth} step={0.5} max={100} />
          <NumField field={inflationRate} step={0.5} max={100} />
        </>
      }
      results={
        <>
          <StatGrid>
            <Stat label={t("finalValue")} value={formatEUR(result.finalValue)} highlight />
            {inputs.inflationRate > 0 && <Stat label={t("finalRealValue")} value={formatEUR(result.finalRealValue)} />}
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
