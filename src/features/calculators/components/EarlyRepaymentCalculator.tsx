"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { computeEarlyRepayment } from "@sextante/core/calculators/amortizacion-anticipada";
import { useFormat } from "@/shared/format/use-format";
import NumberField from "@/shared/ui/NumberField";
import Stat from "@/shared/ui/Stat";
import CalculatorLayout from "@/features/calculators/components/CalculatorLayout";
import { useNumberField } from "./CalculatorState";

export default function EarlyRepaymentCalculator() {
  const t = useTranslations("calc.amortizacion-anticipada");
  const { formatEUR, formatEURCents, formatNumber } = useFormat();
  const [pendingPrincipal, setPendingPrincipal] = useNumberField("pendingPrincipal", 150000);
  const [annualRate, setAnnualRate] = useNumberField("annualRate", 3);
  const [remainingYears, setRemainingYears] = useNumberField("remainingYears", 25);
  const [extraPayment, setExtraPayment] = useNumberField("extraPayment", 15000);
  const [compensationRate, setCompensationRate] = useNumberField("compensationRate", 0);

  const result = useMemo(
    () => computeEarlyRepayment({ pendingPrincipal, annualRate, remainingYears, extraPayment, compensationRate }),
    [pendingPrincipal, annualRate, remainingYears, extraPayment, compensationRate],
  );

  const hasFee = result.prepaymentFee > 0;

  return (
    <CalculatorLayout
      inputCount={5}
      inputs={
        <>
          <NumberField
            label={t("pendingPrincipal")}
            value={pendingPrincipal}
            onChange={setPendingPrincipal}
            step={5000}
            help={t("help.pendingPrincipal")}
          />
          <NumberField
            label={t("annualRate")}
            value={annualRate}
            onChange={setAnnualRate}
            step={0.1}
            max={100}
            help={t("help.annualRate")}
          />
          <NumberField
            label={t("remainingYears")}
            value={remainingYears}
            onChange={setRemainingYears}
            step={1}
            min={1}
            max={40}
            help={t("help.remainingYears")}
          />
          <NumberField
            label={t("extraPayment")}
            value={extraPayment}
            onChange={setExtraPayment}
            step={1000}
            help={t("help.extraPayment")}
          />
          <NumberField
            label={t("compensationRate")}
            value={compensationRate}
            onChange={setCompensationRate}
            step={0.1}
            max={100}
            help={t("help.compensationRate")}
          />
        </>
      }
      results={
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label={t("monthlyPaymentBefore")} value={formatEURCents(result.monthlyPaymentBefore)} />
            <Stat label={t("totalInterestBefore")} value={formatEUR(result.totalInterestBefore)} />
            <Stat label={t("prepaymentFee")} value={formatEUR(result.prepaymentFee)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <OptionCard
              title={t("reducePaymentTitle")}
              saved={formatEUR(result.reducePayment.interestSaved)}
              savedLabel={t("interestSaved")}
              detail={t("newPaymentDetail", { payment: formatEURCents(result.reducePayment.newMonthlyPayment) })}
              net={hasFee ? t("netSavedDetail", { amount: formatEUR(result.reducePayment.netSaved) }) : undefined}
            />
            <OptionCard
              title={t("reduceTermTitle")}
              saved={formatEUR(result.reduceTerm.interestSaved)}
              savedLabel={t("interestSaved")}
              detail={t("monthsSavedDetail", { months: formatNumber(result.reduceTerm.monthsSaved) })}
              net={hasFee ? t("netSavedDetail", { amount: formatEUR(result.reduceTerm.netSaved) }) : undefined}
            />
          </div>
        </>
      }
    />
  );
}

function OptionCard({
  title,
  saved,
  savedLabel,
  detail,
  net,
}: {
  title: string;
  saved: string;
  savedLabel: string;
  detail: string;
  net?: string;
}) {
  return (
    <div className="rounded-xl border border-brand bg-brand-soft p-4">
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <div className="mt-2 text-xs text-muted">{savedLabel}</div>
      <div className="text-2xl font-semibold text-brand">{saved}</div>
      <div className="mt-2 text-sm text-foreground">{detail}</div>
      {net && <div className="mt-1 text-sm font-medium text-foreground">{net}</div>}
    </div>
  );
}
