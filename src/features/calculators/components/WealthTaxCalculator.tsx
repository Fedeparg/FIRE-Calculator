"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { computeWealthTax } from "@sextante/core/calculators/impuesto-patrimonio";
import { FISCAL_YEAR_LABEL } from "@sextante/core/fiscal/brackets";
import { useFormat } from "@/shared/format/use-format";
import NumberField from "@/shared/ui/NumberField";
import Stat from "@/shared/ui/Stat";
import Notice from "@/shared/ui/Notice";
import CalculatorLayout from "@/features/calculators/components/CalculatorLayout";
import { useNumberField } from "./CalculatorState";

export default function WealthTaxCalculator() {
  const t = useTranslations("calc.impuesto-patrimonio");
  const { formatEUR, formatPercent } = useFormat();
  const [totalWealth, setTotalWealth] = useNumberField("totalWealth", 1500000);
  const [primaryResidenceValue, setPrimaryResidenceValue] = useNumberField("primaryResidenceValue", 300000);
  const [exemptMinimum, setExemptMinimum] = useNumberField("exemptMinimum", 700000);
  const [regionalRebate, setRegionalRebate] = useNumberField("regionalRebate", 0);

  const result = useMemo(
    () => computeWealthTax({ totalWealth, primaryResidenceValue, exemptMinimum, regionalRebate }),
    [totalWealth, primaryResidenceValue, exemptMinimum, regionalRebate],
  );

  return (
    <CalculatorLayout
      layout="sidebar"
      notice={<Notice>{t("note", { year: FISCAL_YEAR_LABEL })}</Notice>}
      inputs={
        <>
          <NumberField
            label={t("totalWealth")}
            value={totalWealth}
            onChange={setTotalWealth}
            step={50000}
            help={t("help.totalWealth")}
          />
          <NumberField
            label={t("primaryResidenceValue")}
            value={primaryResidenceValue}
            onChange={setPrimaryResidenceValue}
            step={25000}
            help={t("help.primaryResidenceValue")}
          />
          <NumberField
            label={t("exemptMinimum")}
            value={exemptMinimum}
            onChange={setExemptMinimum}
            step={50000}
            help={t("help.exemptMinimum")}
          />
          <NumberField
            label={t("regionalRebate")}
            value={regionalRebate}
            onChange={setRegionalRebate}
            min={0}
            max={100}
            step={5}
            help={t("help.regionalRebate")}
          />
        </>
      }
      results={
        <div className="grid gap-4 sm:grid-cols-2">
          <Stat label={t("tax")} value={formatEUR(result.tax)} highlight />
          <Stat label={t("taxableBase")} value={formatEUR(result.taxableBase)} />
          <Stat label={t("grossTax")} value={formatEUR(result.grossTax)} />
          <Stat label={t("effectiveRate")} value={formatPercent(result.effectiveRate)} />
        </div>
      }
    />
  );
}
