"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { SPAIN_SAVINGS_WITHHOLDING_PCT } from "@sextante/core/fiscal/countries";
import { computeRoi } from "@sextante/core/calculators/roi";
import { useFormat } from "@/shared/format/use-format";
import Stat from "@/shared/ui/Stat";
import Notice from "@/shared/ui/Notice";
import CalculatorLayout from "@/features/calculators/components/CalculatorLayout";
import { useBoundNumberField } from "./CalculatorState";
import NumField from "./NumField";
import { useInputs } from "./use-inputs";
import StatGrid from "@/shared/ui/StatGrid";

export default function RoiCalculator() {
  const t = useTranslations("calc.roi");
  const { formatEUR, formatPercent } = useFormat();
  const initial = useBoundNumberField("initial", 1000);
  const final = useBoundNumberField("final", 1500);
  const years = useBoundNumberField("years", 5);
  const costs = useBoundNumberField("costs", 20);
  const income = useBoundNumberField("income", 50);
  const taxRate = useBoundNumberField("taxRate", SPAIN_SAVINGS_WITHHOLDING_PCT);

  const inputs = useInputs({ initial, final, years, costs, income, taxRate });
  const result = useMemo(() => computeRoi({ ...inputs, years: inputs.years > 0 ? inputs.years : undefined }), [inputs]);

  return (
    <CalculatorLayout
      layout="grid"
      notice={<Notice>{t("note")}</Notice>}
      inputs={
        <>
          <NumField field={initial} step={100} />
          <NumField field={final} step={100} />
          <NumField field={years} step={1} max={80} />
          <NumField field={costs} step={10} />
          <NumField field={income} step={10} />
          <NumField field={taxRate} step={1} max={100} />
        </>
      }
      results={
        <StatGrid columns={3}>
          <Stat label={t("roi")} value={formatPercent(result.roi)} highlight />
          <Stat label={t("gain")} value={formatEUR(result.gain)} />
          <Stat
            label={t("annualized")}
            value={result.annualized === null ? t("annualizedNa") : formatPercent(result.annualized)}
          />
          <Stat label={t("netRoi")} value={formatPercent(result.netRoi)} />
          <Stat label={t("netGain")} value={formatEUR(result.netGain)} />
          <Stat label={t("tax")} value={formatEUR(result.tax)} />
        </StatGrid>
      }
    />
  );
}
