"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { computeRoi } from "@sextante/core/calculators/roi";
import { useFormat } from "@/lib/format";
import NumberField from "@/components/ui/NumberField";
import Stat from "@/components/ui/Stat";
import Notice from "@/components/ui/Notice";
import CalculatorLayout from "@/features/calculators/components/CalculatorLayout";
import { useNumberField } from "./CalculatorState";

export default function RoiCalculator() {
  const t = useTranslations("calc.roi");
  const { formatEUR, formatPercent } = useFormat();
  const [initial, setInitial] = useNumberField("initial", 1000);
  const [final, setFinal] = useNumberField("final", 1500);
  const [years, setYears] = useNumberField("years", 5);
  const [costs, setCosts] = useNumberField("costs", 20);
  const [income, setIncome] = useNumberField("income", 50);
  const [taxRate, setTaxRate] = useNumberField("taxRate", 19);

  const result = useMemo(
    () => computeRoi({ initial, final, years: years > 0 ? years : undefined, costs, income, taxRate }),
    [initial, final, years, costs, income, taxRate],
  );

  return (
    <CalculatorLayout
      inputCount={6}
      notice={<Notice>{t("note")}</Notice>}
      inputs={
        <>
          <NumberField label={t("initial")} value={initial} onChange={setInitial} step={100} help={t("help.initial")} />
          <NumberField label={t("final")} value={final} onChange={setFinal} step={100} help={t("help.final")} />
          <NumberField label={t("years")} value={years} onChange={setYears} step={1} max={80} help={t("help.years")} />
          <NumberField label={t("costs")} value={costs} onChange={setCosts} step={10} help={t("help.costs")} />
          <NumberField label={t("income")} value={income} onChange={setIncome} step={10} help={t("help.income")} />
          <NumberField
            label={t("taxRate")}
            value={taxRate}
            onChange={setTaxRate}
            step={1}
            max={100}
            help={t("help.taxRate")}
          />
        </>
      }
      results={
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Stat label={t("roi")} value={formatPercent(result.roi)} highlight />
          <Stat label={t("gain")} value={formatEUR(result.gain)} />
          <Stat
            label={t("annualized")}
            value={result.annualized === null ? t("annualizedNa") : formatPercent(result.annualized)}
          />
          <Stat label={t("netRoi")} value={formatPercent(result.netRoi)} />
          <Stat label={t("netGain")} value={formatEUR(result.netGain)} />
          <Stat label={t("tax")} value={formatEUR(result.tax)} />
        </div>
      }
    />
  );
}
