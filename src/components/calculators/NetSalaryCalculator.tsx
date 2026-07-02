"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { computeNetSalary } from "@/core/calculators/salario-bruto-neto";
import type { ContractType, DisabilityGrade } from "@/core/fiscal/irpf";
import { useFormat } from "@/lib/format";
import NumberField from "../ui/NumberField";
import SelectField from "../ui/SelectField";
import Stat from "../ui/Stat";
import Notice from "../ui/Notice";

export default function NetSalaryCalculator() {
  const t = useTranslations("calc.salario-bruto-neto");
  const { formatEUR, formatEURCents, formatPercent } = useFormat();
  // Datos básicos
  const [grossAnnual, setGrossAnnual] = useState(30000);
  const [payments, setPayments] = useState("14");
  const [contractType, setContractType] = useState<ContractType>("indefinido");
  // Circunstancias personales y familiares
  const [age, setAge] = useState(30);
  const [children, setChildren] = useState(0);
  const [childrenUnder3, setChildrenUnder3] = useState(0);
  const [ascendants, setAscendants] = useState(0);
  const [disability, setDisability] = useState<DisabilityGrade>("none");
  const [jointReturn, setJointReturn] = useState("no");
  const [pensionContribution, setPensionContribution] = useState(0);

  const result = useMemo(
    () =>
      computeNetSalary({
        grossAnnual,
        payments: payments === "12" ? 12 : 14,
        contractType,
        age,
        children,
        childrenUnder3,
        ascendants,
        disability,
        jointReturn: jointReturn === "yes",
        pensionContribution,
      }),
    [
      grossAnnual,
      payments,
      contractType,
      age,
      children,
      childrenUnder3,
      ascendants,
      disability,
      jointReturn,
      pensionContribution,
    ],
  );

  return (
    <div className="grid gap-6">
      <Notice>{t("note")}</Notice>

      <div className="grid gap-6 rounded-xl border border-border bg-surface p-5">
        <section className="grid gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("groupBasic")}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label={t("grossAnnual")} value={grossAnnual} onChange={setGrossAnnual} step={1000} help={t("help.grossAnnual")} />
            <SelectField
              label={t("payments")}
              value={payments}
              onChange={setPayments}
              options={[
                { value: "14", label: t("payments14") },
                { value: "12", label: t("payments12") },
              ]}
              help={t("help.payments")}
            />
            <SelectField
              label={t("contractType")}
              value={contractType}
              onChange={setContractType}
              options={[
                { value: "indefinido", label: t("contractIndefinido") },
                { value: "temporal", label: t("contractTemporal") },
              ]}
              help={t("help.contractType")}
            />
            <NumberField label={t("pensionContribution")} value={pensionContribution} onChange={setPensionContribution} step={100} help={t("help.pensionContribution")} />
          </div>
        </section>

        <section className="grid gap-3 border-t border-border pt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("groupPersonal")}</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          </div>
        </section>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("netPerPayment")} value={formatEURCents(result.netPerPayment)} highlight />
        <Stat label={t("netAnnual")} value={formatEUR(result.netAnnual)} />
        <Stat label={t("socialSecurity")} value={formatEUR(result.socialSecurity)} />
        <Stat label={t("incomeTax")} value={formatEUR(result.incomeTax)} />
        <Stat label={t("withholdingRate")} value={formatPercent(result.withholdingRate)} />
        <Stat label={t("totalDeductionRate")} value={formatPercent(result.totalDeductionRate)} />
        <Stat label={t("personalMinimum")} value={formatEUR(result.personalMinimum)} />
        <Stat label={t("taxableBase")} value={formatEUR(result.taxableBase)} />
      </div>
    </div>
  );
}
