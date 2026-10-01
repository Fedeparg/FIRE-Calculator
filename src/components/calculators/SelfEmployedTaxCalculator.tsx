"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { computeSelfEmployedTax } from "@/core/calculators/irpf-autonomos";
import { FISCAL_YEAR_LABEL } from "@sextante/core/fiscal/brackets";
import {
  DISABILITY_GRADES,
  JOINT_RETURN_OPTIONS,
  type DisabilityGrade,
  type JointReturnOption,
} from "@sextante/core/fiscal/irpf";
import {
  SELECTABLE_REGIONS,
  toSupportedRegion,
  type RegionSelection,
} from "@sextante/core/fiscal/regions";
import { useFormat } from "@/lib/format";
import RegionSelectField from "./RegionSelectField";
import NumberField from "../ui/NumberField";
import SelectField from "../ui/SelectField";
import Stat from "../ui/Stat";
import Notice from "../ui/Notice";
import CalculatorLayout from "../CalculatorLayout";
import { useNumberField, useOptionField } from "./CalculatorState";

/** Régimen de estimación de gastos que ofrece el desplegable. */
const EXPENSE_REGIMES = ["simplificada", "normal"] as const;
type ExpenseRegime = (typeof EXPENSE_REGIMES)[number];

export default function SelfEmployedTaxCalculator() {
  const t = useTranslations("calc.irpf-autonomos");
  const { formatEUR, formatPercent } = useFormat();
  // Datos de la actividad
  const [income, setIncome] = useNumberField("income", 40000);
  const [expenses, setExpenses] = useNumberField("expenses", 8000);
  const [socialSecurity, setSocialSecurity] = useNumberField("socialSecurity", 4000);
  const [regime, setRegime] = useOptionField<ExpenseRegime>(
    "regime",
    "simplificada",
    EXPENSE_REGIMES,
  );
  const [region, setRegion] = useOptionField<RegionSelection>("region", "", SELECTABLE_REGIONS);
  const [pensionContribution, setPensionContribution] = useNumberField("pensionContribution", 0);
  // Situación personal y familiar
  const [age, setAge] = useNumberField("age", 30);
  const [jointReturn, setJointReturn] = useOptionField<JointReturnOption>(
    "jointReturn",
    "no",
    JOINT_RETURN_OPTIONS,
  );
  const [children, setChildren] = useNumberField("children", 0);
  const [childrenUnder3, setChildrenUnder3] = useNumberField("childrenUnder3", 0);
  const [ascendants, setAscendants] = useNumberField("ascendants", 0);
  const [disability, setDisability] = useOptionField<DisabilityGrade>(
    "disability",
    "none",
    DISABILITY_GRADES,
  );

  const result = useMemo(
    () =>
      computeSelfEmployedTax({
        income,
        expenses,
        socialSecurity,
        simplifiedRegime: regime === "simplificada",
        region: toSupportedRegion(region),
        pensionContribution,
        age,
        jointReturn: jointReturn === "yes",
        children,
        childrenUnder3,
        ascendants,
        disability,
      }),
    [income, expenses, socialSecurity, regime, region, pensionContribution, age, jointReturn, children, childrenUnder3, ascendants, disability],
  );

  return (
    <CalculatorLayout
      inputCount={12}
      notice={<Notice>{t("note", { year: FISCAL_YEAR_LABEL })}</Notice>}
      inputs={
        <>
          <NumberField label={t("income")} value={income} onChange={setIncome} step={1000} help={t("help.income")} />
          <NumberField label={t("expenses")} value={expenses} onChange={setExpenses} step={500} help={t("help.expenses")} />
          <NumberField label={t("socialSecurity")} value={socialSecurity} onChange={setSocialSecurity} step={250} help={t("help.socialSecurity")} />
          <SelectField
            label={t("regime")}
            value={regime}
            onChange={setRegime}
            options={[
              { value: "simplificada", label: t("regimeSimplified") },
              { value: "normal", label: t("regimeNormal") },
            ]}
            help={t("help.regime")}
          />
          <NumberField label={t("pensionContribution")} value={pensionContribution} onChange={setPensionContribution} step={100} help={t("help.pensionContribution")} />
          <RegionSelectField value={region} onChange={setRegion} />
          <NumberField label={t("age")} value={age} onChange={setAge} min={16} max={120} step={1} help={t("help.age")} />
          <SelectField
            label={t("jointReturn")}
            value={jointReturn}
            onChange={setJointReturn}
            options={[
              { value: "no", label: t("jointNo") },
              { value: "yes", label: t("jointYes") },
            ]}
            help={t("help.jointReturn")}
          />
          <NumberField label={t("children")} value={children} onChange={setChildren} min={0} step={1} help={t("help.children")} />
          <NumberField label={t("childrenUnder3")} value={childrenUnder3} onChange={setChildrenUnder3} min={0} step={1} help={t("help.childrenUnder3")} />
          <NumberField label={t("ascendants")} value={ascendants} onChange={setAscendants} min={0} step={1} help={t("help.ascendants")} />
          <SelectField
            label={t("disability")}
            value={disability}
            onChange={setDisability}
            options={[
              { value: "none", label: t("disabilityNone") },
              { value: "g33", label: t("disability33") },
              { value: "g65", label: t("disability65") },
            ]}
            help={t("help.disability")}
          />
        </>
      }
      results={
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Stat label={t("incomeTax")} value={formatEUR(result.incomeTax)} highlight />
          <Stat label={t("grossNetIncome")} value={formatEUR(result.grossNetIncome)} />
          {result.difficultExpenses > 0 && (
            <Stat label={t("difficultExpenses")} value={formatEUR(result.difficultExpenses)} />
          )}
          <Stat label={t("netIncome")} value={formatEUR(result.netIncome)} />
          <Stat label={t("netAfterTax")} value={formatEUR(result.netAfterTax)} />
          <Stat label={t("effectiveRate")} value={formatPercent(result.effectiveRate)} />
          <Stat label={t("marginalRate")} value={formatPercent(result.marginalRate)} />
          <Stat label={t("personalMinimum")} value={formatEUR(result.personalMinimum)} />
          <Stat label={t("taxableBase")} value={formatEUR(result.taxableBase)} />
        </div>
      }
    />
  );
}
