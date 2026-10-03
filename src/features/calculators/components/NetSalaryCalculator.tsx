"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { estimateNetSalary } from "@sextante/core/fiscal/irpf";
import { FISCAL_YEAR_LABEL } from "@sextante/core/fiscal/brackets";
import {
  CONTRACT_TYPES,
  DISABILITY_GRADES,
  JOINT_RETURN_OPTIONS,
  PAYMENT_COUNTS,
  type ContractType,
  type DisabilityGrade,
  type JointReturnOption,
  type PaymentCount,
} from "@sextante/core/fiscal/irpf";
import { SELECTABLE_REGIONS, toSupportedRegion, type RegionSelection } from "@sextante/core/fiscal/regions";
import { useFormat } from "@/shared/format/use-format";
import RegionSelectField from "./RegionSelectField";
import SelectField from "@/shared/ui/SelectField";
import Stat from "@/shared/ui/Stat";
import Notice from "@/shared/ui/Notice";
import CalculatorLayout from "./CalculatorLayout";
import { useBoundNumberField, useBoundOptionField } from "./CalculatorState";
import NumField from "./NumField";
import { useInputs } from "./use-inputs";
import StatGrid from "@/shared/ui/StatGrid";

export default function NetSalaryCalculator() {
  const t = useTranslations("calc.salario-bruto-neto");
  const { formatEUR, formatEURCents, formatPercent } = useFormat();
  // Datos básicos
  const grossAnnual = useBoundNumberField("grossAnnual", 30000);
  const payments = useBoundOptionField<PaymentCount>("payments", "14", PAYMENT_COUNTS);
  const contractType = useBoundOptionField<ContractType>("contractType", "indefinido", CONTRACT_TYPES);
  const region = useBoundOptionField<RegionSelection>("region", "", SELECTABLE_REGIONS);
  // Circunstancias personales y familiares
  const age = useBoundNumberField("age", 30);
  const children = useBoundNumberField("children", 0);
  const childrenUnder3 = useBoundNumberField("childrenUnder3", 0);
  const ascendants = useBoundNumberField("ascendants", 0);
  const disability = useBoundOptionField<DisabilityGrade>("disability", "none", DISABILITY_GRADES);
  const jointReturn = useBoundOptionField<JointReturnOption>("jointReturn", "no", JOINT_RETURN_OPTIONS);
  const pensionContribution = useBoundNumberField("pensionContribution", 0);

  const inputs = useInputs({
    grossAnnual,
    payments,
    contractType,
    region,
    age,
    children,
    childrenUnder3,
    ascendants,
    disability,
    jointReturn,
    pensionContribution,
  });
  const result = useMemo(
    () =>
      estimateNetSalary({
        ...inputs,
        payments: inputs.payments === "12" ? 12 : 14,
        region: toSupportedRegion(inputs.region),
        jointReturn: inputs.jointReturn === "yes",
      }),
    [inputs],
  );

  return (
    <CalculatorLayout
      layout="grouped"
      notice={<Notice>{t("note", { year: FISCAL_YEAR_LABEL })}</Notice>}
      groups={[
        {
          id: "basic",
          title: t("groupBasic"),
          fields: (
            <>
              <NumField field={grossAnnual} step={1000} />
              <SelectField
                label={t("payments")}
                value={payments.value}
                onChange={payments.set}
                options={[
                  { value: "14", label: t("payments14") },
                  { value: "12", label: t("payments12") },
                ]}
                help={t("help.payments")}
              />
              <SelectField
                label={t("contractType")}
                value={contractType.value}
                onChange={contractType.set}
                options={[
                  { value: "indefinido", label: t("contractIndefinido") },
                  { value: "temporal", label: t("contractTemporal") },
                ]}
                help={t("help.contractType")}
              />
              <NumField field={pensionContribution} step={100} />
              <RegionSelectField value={region.value} onChange={region.set} />
            </>
          ),
        },
        {
          id: "personal",
          title: t("groupPersonal"),
          columns: 3,
          fields: (
            <>
              <NumField field={age} min={16} max={120} step={1} />
              <SelectField
                label={t("jointReturn")}
                value={jointReturn.value}
                onChange={jointReturn.set}
                options={[
                  { value: "no", label: t("jointNo") },
                  { value: "yes", label: t("jointYes") },
                ]}
                help={t("help.jointReturn")}
              />
              <NumField field={children} min={0} step={1} />
              <NumField field={childrenUnder3} min={0} step={1} />
              <NumField field={ascendants} min={0} step={1} />
              <SelectField
                label={t("disability")}
                value={disability.value}
                onChange={disability.set}
                options={[
                  { value: "none", label: t("disabilityNone") },
                  { value: "g33", label: t("disability33") },
                  { value: "g65", label: t("disability65") },
                ]}
                help={t("help.disability")}
              />
            </>
          ),
        },
      ]}
      results={
        <StatGrid>
          <Stat label={t("netPerPayment")} value={formatEURCents(result.netPerPayment)} highlight />
          <Stat label={t("netAnnual")} value={formatEUR(result.netAnnual)} />
          <Stat label={t("socialSecurity")} value={formatEUR(result.socialSecurity)} />
          <Stat label={t("incomeTax")} value={formatEUR(result.incomeTax)} />
          <Stat label={t("withholdingRate")} value={formatPercent(result.withholdingRate)} />
          <Stat label={t("totalDeductionRate")} value={formatPercent(result.totalDeductionRate)} />
          <Stat label={t("personalMinimum")} value={formatEUR(result.personalMinimum)} />
          <Stat label={t("taxableBase")} value={formatEUR(result.taxableBase)} />
        </StatGrid>
      }
    />
  );
}
