"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { computePensionRelief } from "@/core/calculators/desgravacion-plan-pensiones";
import { formatEUR, formatPercent } from "@/core/format";
import NumberField from "../ui/NumberField";
import Stat from "../ui/Stat";
import Notice from "../ui/Notice";
import CalculatorLayout from "../CalculatorLayout";

export default function PensionReliefCalculator() {
  const t = useTranslations("calc.desgravacion-plan-pensiones");

  const [grossAnnual, setGrossAnnual] = useState(40000);
  const [contribution, setContribution] = useState(1500);

  const result = useMemo(
    () => computePensionRelief({ grossAnnual, contribution }),
    [grossAnnual, contribution],
  );

  return (
    <CalculatorLayout
      inputCount={2}
      notice={<Notice>{t("note")}</Notice>}
      inputs={
        <>
          <NumberField label={t("grossAnnual")} value={grossAnnual} onChange={setGrossAnnual} step={1000} help={t("help.grossAnnual")} />
          <NumberField label={t("contribution")} value={contribution} onChange={setContribution} step={100} help={t("help.contribution")} />
        </>
      }
      results={
        <div className="grid gap-4 sm:grid-cols-2">
          <Stat label={t("taxSaving")} value={formatEUR(result.taxSaving)} highlight />
          <Stat label={t("appliedContribution")} value={formatEUR(result.appliedContribution)} />
          <Stat label={t("netCost")} value={formatEUR(result.netCost)} />
          <Stat label={t("savingRate")} value={formatPercent(result.savingRate)} />
          {result.excess > 0 && <Stat label={t("excess")} value={formatEUR(result.excess)} />}
        </div>
      }
    />
  );
}
