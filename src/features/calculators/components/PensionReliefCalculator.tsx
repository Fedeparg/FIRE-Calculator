"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { computePensionRelief } from "@sextante/core/calculators/desgravacion-plan-pensiones";
import { FISCAL_YEAR_LABEL } from "@sextante/core/fiscal/brackets";
import { SELECTABLE_REGIONS, toSupportedRegion, type RegionSelection } from "@sextante/core/fiscal/regions";
import { useFormat } from "@/lib/format";
import RegionSelectField from "./RegionSelectField";
import NumberField from "@/components/ui/NumberField";
import Stat from "@/components/ui/Stat";
import Notice from "@/components/ui/Notice";
import CalculatorLayout from "@/features/calculators/components/CalculatorLayout";
import { useNumberField, useOptionField } from "./CalculatorState";

export default function PensionReliefCalculator() {
  const t = useTranslations("calc.desgravacion-plan-pensiones");
  const { formatEUR, formatPercent } = useFormat();
  const [grossAnnual, setGrossAnnual] = useNumberField("grossAnnual", 40000);
  const [contribution, setContribution] = useNumberField("contribution", 1500);
  const [employerContribution, setEmployerContribution] = useNumberField("employerContribution", 0);
  const [region, setRegion] = useOptionField<RegionSelection>("region", "", SELECTABLE_REGIONS);

  const result = useMemo(
    () =>
      computePensionRelief({
        grossAnnual,
        contribution,
        employerContribution,
        region: toSupportedRegion(region),
      }),
    [grossAnnual, contribution, employerContribution, region],
  );

  return (
    <CalculatorLayout
      inputCount={4}
      notice={<Notice>{t("note", { year: FISCAL_YEAR_LABEL })}</Notice>}
      inputs={
        <>
          <NumberField
            label={t("grossAnnual")}
            value={grossAnnual}
            onChange={setGrossAnnual}
            step={1000}
            help={t("help.grossAnnual")}
          />
          <NumberField
            label={t("contribution")}
            value={contribution}
            onChange={setContribution}
            step={100}
            help={t("help.contribution")}
          />
          <NumberField
            label={t("employerContribution")}
            value={employerContribution}
            onChange={setEmployerContribution}
            min={0}
            step={500}
            help={t("help.employerContribution")}
          />
          <RegionSelectField value={region} onChange={setRegion} />
        </>
      }
      results={
        <div className="grid gap-4 sm:grid-cols-2">
          <Stat label={t("taxSaving")} value={formatEUR(result.taxSaving)} highlight />
          <Stat label={t("appliedContribution")} value={formatEUR(result.appliedContribution)} />
          <Stat label={t("netCost")} value={formatEUR(result.netCost)} />
          <Stat label={t("savingRate")} value={formatPercent(result.savingRate)} />
          {result.excess > 0 && <Stat label={t("excess")} value={formatEUR(result.excess)} />}
          {result.employerApplied > 0 && (
            <Stat label={t("employerApplied")} value={formatEUR(result.employerApplied)} />
          )}
          {result.employerApplied > 0 && <Stat label={t("totalApplied")} value={formatEUR(result.totalApplied)} />}
        </div>
      }
    />
  );
}
