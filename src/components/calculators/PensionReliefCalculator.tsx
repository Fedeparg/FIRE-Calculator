"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { computePensionRelief } from "@/core/calculators/desgravacion-plan-pensiones";
import { FISCAL_YEAR_LABEL } from "@/core/fiscal/brackets";
import { useFormat } from "@/lib/format";
import NumberField from "../ui/NumberField";
import Stat from "../ui/Stat";
import Notice from "../ui/Notice";
import CalculatorLayout from "../CalculatorLayout";

export default function PensionReliefCalculator() {
  const t = useTranslations("calc.desgravacion-plan-pensiones");
  const { formatEUR, formatPercent } = useFormat();
  const [grossAnnual, setGrossAnnual] = useState(40000);
  const [contribution, setContribution] = useState(1500);
  const [employerContribution, setEmployerContribution] = useState(0);

  const result = useMemo(
    () => computePensionRelief({ grossAnnual, contribution, employerContribution }),
    [grossAnnual, contribution, employerContribution],
  );

  return (
    <CalculatorLayout
      inputCount={3}
      notice={<Notice>{t("note", { year: FISCAL_YEAR_LABEL })}</Notice>}
      inputs={
        <>
          <NumberField label={t("grossAnnual")} value={grossAnnual} onChange={setGrossAnnual} step={1000} help={t("help.grossAnnual")} />
          <NumberField label={t("contribution")} value={contribution} onChange={setContribution} step={100} help={t("help.contribution")} />
          <NumberField label={t("employerContribution")} value={employerContribution} onChange={setEmployerContribution} min={0} step={500} help={t("help.employerContribution")} />
        </>
      }
      results={
        <div className="grid gap-4 sm:grid-cols-2">
          <Stat label={t("taxSaving")} value={formatEUR(result.taxSaving)} highlight />
          <Stat label={t("appliedContribution")} value={formatEUR(result.appliedContribution)} />
          <Stat label={t("netCost")} value={formatEUR(result.netCost)} />
          <Stat label={t("savingRate")} value={formatPercent(result.savingRate)} />
          {result.excess > 0 && <Stat label={t("excess")} value={formatEUR(result.excess)} />}
          {result.employerApplied > 0 && <Stat label={t("employerApplied")} value={formatEUR(result.employerApplied)} />}
          {result.employerApplied > 0 && <Stat label={t("totalApplied")} value={formatEUR(result.totalApplied)} />}
        </div>
      }
    />
  );
}
