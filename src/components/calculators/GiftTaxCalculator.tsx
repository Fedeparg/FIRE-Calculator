"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { computeGiftTax, type KinshipGroup } from "@/core/calculators/impuesto-donaciones";
import { FISCAL_YEAR_LABEL } from "@/core/fiscal/brackets";
import { useFormat } from "@/lib/format";
import NumberField from "../ui/NumberField";
import SelectField from "../ui/SelectField";
import Stat from "../ui/Stat";
import Notice from "../ui/Notice";
import CalculatorLayout from "../CalculatorLayout";

export default function GiftTaxCalculator() {
  const t = useTranslations("calc.impuesto-donaciones");
  const { formatEUR, formatMultiplier, formatPercent } = useFormat();
  const [amount, setAmount] = useState(100000);
  const [reduction, setReduction] = useState(0);
  const [kinship, setKinship] = useState<KinshipGroup>("grupoI_II");
  const [preexistingWealth, setPreexistingWealth] = useState(0);
  const [regionalRebate, setRegionalRebate] = useState(0);

  const result = useMemo(
    () => computeGiftTax({ amount, reduction, kinship, preexistingWealth, regionalRebate }),
    [amount, reduction, kinship, preexistingWealth, regionalRebate],
  );

  return (
    <CalculatorLayout
      inputCount={5}
      notice={<Notice>{t("note", { year: FISCAL_YEAR_LABEL })}</Notice>}
      inputs={
        <>
          <NumberField label={t("amount")} value={amount} onChange={setAmount} step={5000} help={t("help.amount")} />
          <NumberField label={t("reduction")} value={reduction} onChange={setReduction} step={1000} help={t("help.reduction")} />
          <SelectField
            label={t("kinship")}
            value={kinship}
            onChange={setKinship}
            options={[
              { value: "grupoI_II", label: t("kinshipI_II") },
              { value: "grupoIII", label: t("kinshipIII") },
              { value: "grupoIV", label: t("kinshipIV") },
            ]}
            help={t("help.kinship")}
          />
          <NumberField label={t("preexistingWealth")} value={preexistingWealth} onChange={setPreexistingWealth} min={0} step={10000} help={t("help.preexistingWealth")} />
          <NumberField label={t("regionalRebate")} value={regionalRebate} onChange={setRegionalRebate} min={0} max={100} step={5} help={t("help.regionalRebate")} />
        </>
      }
      results={
        <div className="grid gap-4 sm:grid-cols-2">
          <Stat label={t("tax")} value={formatEUR(result.tax)} highlight />
          <Stat label={t("taxableBase")} value={formatEUR(result.taxableBase)} />
          <Stat label={t("grossTax")} value={formatEUR(result.grossTax)} />
          <Stat label={t("coefficient")} value={`× ${formatMultiplier(result.coefficient)}`} />
          <Stat label={t("effectiveRate")} value={formatPercent(result.effectiveRate)} />
        </div>
      }
    />
  );
}
