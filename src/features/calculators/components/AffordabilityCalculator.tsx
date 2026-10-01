"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { computeAffordability } from "@sextante/core/calculators/hipoteca-asequible";
import { useFormat } from "@/lib/format";
import NumberField from "@/shared/ui/NumberField";
import Stat from "@/shared/ui/Stat";
import CalculatorLayout from "@/features/calculators/components/CalculatorLayout";
import { useNumberField } from "./CalculatorState";

export default function AffordabilityCalculator() {
  const t = useTranslations("calc.que-hipoteca-me-puedo-permitir");
  const { formatEUR, formatEURCents } = useFormat();
  const [netMonthlyIncome, setNetMonthlyIncome] = useNumberField("netMonthlyIncome", 2000);
  const [monthlyDebts, setMonthlyDebts] = useNumberField("monthlyDebts", 0);
  const [downPayment, setDownPayment] = useNumberField("downPayment", 40000);
  const [annualRate, setAnnualRate] = useNumberField("annualRate", 3);
  const [termYears, setTermYears] = useNumberField("termYears", 30);
  const [effortRatio, setEffortRatio] = useNumberField("effortRatio", 35);
  const [maxLtv, setMaxLtv] = useNumberField("maxLtv", 80);
  const [purchaseCostsRate, setPurchaseCostsRate] = useNumberField("purchaseCostsRate", 12);

  const result = useMemo(
    () =>
      computeAffordability({
        netMonthlyIncome,
        monthlyDebts,
        downPayment,
        annualRate,
        termYears,
        effortRatio,
        maxLtv,
        purchaseCostsRate,
      }),
    [netMonthlyIncome, monthlyDebts, downPayment, annualRate, termYears, effortRatio, maxLtv, purchaseCostsRate],
  );

  const bindingText = result.binding === "income" ? t("bindingIncome") : t("bindingSavings");

  return (
    <CalculatorLayout
      inputCount={8}
      inputs={
        <>
          <NumberField
            label={t("netMonthlyIncome")}
            value={netMonthlyIncome}
            onChange={setNetMonthlyIncome}
            step={100}
            help={t("help.netMonthlyIncome")}
          />
          <NumberField
            label={t("monthlyDebts")}
            value={monthlyDebts}
            onChange={setMonthlyDebts}
            step={50}
            help={t("help.monthlyDebts")}
          />
          <NumberField
            label={t("downPayment")}
            value={downPayment}
            onChange={setDownPayment}
            step={5000}
            help={t("help.downPayment")}
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
            label={t("termYears")}
            value={termYears}
            onChange={setTermYears}
            step={1}
            min={1}
            max={40}
            help={t("help.termYears")}
          />
          <NumberField
            label={t("effortRatio")}
            value={effortRatio}
            onChange={setEffortRatio}
            step={1}
            max={100}
            help={t("help.effortRatio")}
          />
          <NumberField
            label={t("maxLtv")}
            value={maxLtv}
            onChange={setMaxLtv}
            step={5}
            max={100}
            help={t("help.maxLtv")}
          />
          <NumberField
            label={t("purchaseCostsRate")}
            value={purchaseCostsRate}
            onChange={setPurchaseCostsRate}
            step={1}
            max={100}
            help={t("help.purchaseCostsRate")}
          />
        </>
      }
      results={
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Stat label={t("maxPrice")} value={formatEUR(result.maxPrice)} highlight />
            <Stat label={t("maxLoan")} value={formatEUR(result.maxLoan)} />
            <Stat label={t("estimatedMonthlyPayment")} value={formatEURCents(result.estimatedMonthlyPayment)} />
            <Stat label={t("downPaymentNeeded")} value={formatEUR(result.downPaymentNeeded)} />
            <Stat label={t("purchaseCostsAmount")} value={formatEUR(result.purchaseCostsAmount)} />
            <Stat label={t("maxMonthlyPayment")} value={formatEURCents(result.maxMonthlyPayment)} />
          </div>
          <p className="text-sm text-muted">
            {t("bindingLabel")} <span className="font-medium text-foreground">{bindingText}</span>
          </p>
        </>
      }
    />
  );
}
