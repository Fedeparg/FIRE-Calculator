"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { computeSelfEmployedTax } from "@/core/calculators/irpf-autonomos";
import type { DisabilityGrade } from "@/core/fiscal/irpf";
import { formatEUR, formatPercent } from "@/core/format";
import NumberField from "../ui/NumberField";
import SelectField from "../ui/SelectField";
import Stat from "../ui/Stat";
import Notice from "../ui/Notice";
import CalculatorLayout from "../CalculatorLayout";

export default function SelfEmployedTaxCalculator() {
  const t = useTranslations("calc.irpf-autonomos");

  // Datos de la actividad
  const [income, setIncome] = useState(40000);
  const [expenses, setExpenses] = useState(8000);
  const [socialSecurity, setSocialSecurity] = useState(4000);
  const [pensionContribution, setPensionContribution] = useState(0);
  // Situación personal y familiar
  const [age, setAge] = useState(30);
  const [jointReturn, setJointReturn] = useState("no");
  const [children, setChildren] = useState(0);
  const [childrenUnder3, setChildrenUnder3] = useState(0);
  const [ascendants, setAscendants] = useState(0);
  const [disability, setDisability] = useState<DisabilityGrade>("none");

  const result = useMemo(
    () =>
      computeSelfEmployedTax({
        income,
        expenses,
        socialSecurity,
        pensionContribution,
        age,
        jointReturn: jointReturn === "yes",
        children,
        childrenUnder3,
        ascendants,
        disability,
      }),
    [income, expenses, socialSecurity, pensionContribution, age, jointReturn, children, childrenUnder3, ascendants, disability],
  );

  return (
    <CalculatorLayout
      inputCount={10}
      notice={<Notice>{t("note")}</Notice>}
      inputs={
        <>
          <NumberField label={t("income")} value={income} onChange={setIncome} step={1000} help={t("help.income")} />
          <NumberField label={t("expenses")} value={expenses} onChange={setExpenses} step={500} help={t("help.expenses")} />
          <NumberField label={t("socialSecurity")} value={socialSecurity} onChange={setSocialSecurity} step={250} help={t("help.socialSecurity")} />
          <NumberField label={t("pensionContribution")} value={pensionContribution} onChange={setPensionContribution} step={100} help={t("help.pensionContribution")} />
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
