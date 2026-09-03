"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { computePayrollWithholding } from "@/core/calculators/irpf-nomina";
import { FISCAL_YEAR_LABEL } from "@/core/fiscal/brackets";
import type { ContractType, DisabilityGrade } from "@/core/fiscal/irpf";
import { toSupportedRegion, type RegionSelection } from "@/core/fiscal/regions";
import { useFormat } from "@/lib/format";
import RegionSelectField from "./RegionSelectField";
import NumberField from "../ui/NumberField";
import SelectField from "../ui/SelectField";
import Stat from "../ui/Stat";
import Notice from "../ui/Notice";
import CalculatorLayout from "../CalculatorLayout";

export default function PayrollWithholdingCalculator() {
  const t = useTranslations("calc.irpf-nomina");
  const { formatEUR, formatEURCents, formatPercent } = useFormat();
  // Datos de la nómina
  const [grossAnnual, setGrossAnnual] = useState(30000);
  const [payments, setPayments] = useState("14");
  const [contractType, setContractType] = useState<ContractType>("indefinido");
  const [region, setRegion] = useState<RegionSelection>("");
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
      computePayrollWithholding({
        grossAnnual,
        payments: payments === "12" ? 12 : 14,
        contractType,
        region: toSupportedRegion(region),
        pensionContribution,
        age,
        jointReturn: jointReturn === "yes",
        children,
        childrenUnder3,
        ascendants,
        disability,
      }),
    [grossAnnual, payments, contractType, region, pensionContribution, age, jointReturn, children, childrenUnder3, ascendants, disability],
  );

  return (
    <CalculatorLayout
      inputCount={11}
      notice={<Notice>{t("note", { year: FISCAL_YEAR_LABEL })}</Notice>}
      inputs={
        <>
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
          <Stat label={t("withholdingRate")} value={formatPercent(result.withholdingRate)} highlight />
          <Stat label={t("withholdingPerPayment")} value={formatEURCents(result.withholdingPerPayment)} />
          <Stat label={t("netPerPayment")} value={formatEURCents(result.netPerPayment)} />
          <Stat label={t("annualWithholding")} value={formatEUR(result.annualWithholding)} />
          <Stat label={t("socialSecurityPerPayment")} value={formatEURCents(result.socialSecurityPerPayment)} />
          <Stat label={t("grossPerPayment")} value={formatEURCents(result.grossPerPayment)} />
        </div>
      }
    />
  );
}
