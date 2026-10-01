"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { computeBuyVsRent } from "@sextante/core/calculators/hipoteca-vs-alquiler";
import { useFormat } from "@/lib/format";
import NumberField from "@/shared/ui/NumberField";
import Stat from "@/shared/ui/Stat";
import Notice from "@/shared/ui/Notice";
import CalculatorLayout from "@/features/calculators/components/CalculatorLayout";
import { useNumberField } from "./CalculatorState";

export default function BuyVsRentCalculator() {
  const t = useTranslations("calc.hipoteca-vs-alquiler");
  const { formatEUR } = useFormat();
  const [purchasePrice, setPurchasePrice] = useNumberField("purchasePrice", 250000);
  const [purchaseCosts, setPurchaseCosts] = useNumberField("purchaseCosts", 25000);
  const [downPayment, setDownPayment] = useNumberField("downPayment", 50000);
  const [mortgageRate, setMortgageRate] = useNumberField("mortgageRate", 3);
  const [mortgageTerm, setMortgageTerm] = useNumberField("mortgageTerm", 30);
  const [annualCostRate, setAnnualCostRate] = useNumberField("annualCostRate", 1);
  const [appreciationRate, setAppreciationRate] = useNumberField("appreciationRate", 2);
  const [monthlyRent, setMonthlyRent] = useNumberField("monthlyRent", 1000);
  const [rentGrowthRate, setRentGrowthRate] = useNumberField("rentGrowthRate", 2);
  const [investmentReturn, setInvestmentReturn] = useNumberField("investmentReturn", 5);
  const [horizonYears, setHorizonYears] = useNumberField("horizonYears", 10);
  const [sellingCostsRate, setSellingCostsRate] = useNumberField("sellingCostsRate", 5);

  const result = useMemo(
    () =>
      computeBuyVsRent({
        purchasePrice,
        purchaseCosts,
        downPayment,
        mortgageRate,
        mortgageTerm,
        annualCostRate,
        appreciationRate,
        monthlyRent,
        rentGrowthRate,
        investmentReturn,
        horizonYears,
        sellingCostsRate,
      }),
    [
      purchasePrice,
      purchaseCosts,
      downPayment,
      mortgageRate,
      mortgageTerm,
      annualCostRate,
      appreciationRate,
      monthlyRent,
      rentGrowthRate,
      investmentReturn,
      horizonYears,
      sellingCostsRate,
    ],
  );

  const verdict =
    result.cheaper === "tie"
      ? t("verdictTie")
      : t("verdict", {
          option: result.cheaper === "buy" ? t("optionBuy") : t("optionRent"),
          amount: formatEUR(Math.abs(result.difference)),
          years: horizonYears,
        });

  return (
    <CalculatorLayout
      inputCount={12}
      notice={<Notice variant="info">{t("note")}</Notice>}
      inputs={
        <>
          <NumberField
            label={t("purchasePrice")}
            value={purchasePrice}
            onChange={setPurchasePrice}
            step={5000}
            help={t("help.purchasePrice")}
          />
          <NumberField
            label={t("purchaseCosts")}
            value={purchaseCosts}
            onChange={setPurchaseCosts}
            step={1000}
            help={t("help.purchaseCosts")}
          />
          <NumberField
            label={t("downPayment")}
            value={downPayment}
            onChange={setDownPayment}
            step={5000}
            help={t("help.downPayment")}
          />
          <NumberField
            label={t("mortgageRate")}
            value={mortgageRate}
            onChange={setMortgageRate}
            step={0.1}
            max={100}
            help={t("help.mortgageRate")}
          />
          <NumberField
            label={t("mortgageTerm")}
            value={mortgageTerm}
            onChange={setMortgageTerm}
            min={1}
            step={1}
            help={t("help.mortgageTerm")}
          />
          <NumberField
            label={t("annualCostRate")}
            value={annualCostRate}
            onChange={setAnnualCostRate}
            step={0.1}
            max={100}
            help={t("help.annualCostRate")}
          />
          <NumberField
            label={t("appreciationRate")}
            value={appreciationRate}
            onChange={setAppreciationRate}
            step={0.5}
            min={-100}
            help={t("help.appreciationRate")}
          />
          <NumberField
            label={t("monthlyRent")}
            value={monthlyRent}
            onChange={setMonthlyRent}
            step={50}
            help={t("help.monthlyRent")}
          />
          <NumberField
            label={t("rentGrowthRate")}
            value={rentGrowthRate}
            onChange={setRentGrowthRate}
            step={0.5}
            min={-100}
            help={t("help.rentGrowthRate")}
          />
          <NumberField
            label={t("investmentReturn")}
            value={investmentReturn}
            onChange={setInvestmentReturn}
            step={0.5}
            min={-100}
            help={t("help.investmentReturn")}
          />
          <NumberField
            label={t("horizonYears")}
            value={horizonYears}
            onChange={setHorizonYears}
            min={1}
            step={1}
            help={t("help.horizonYears")}
          />
          <NumberField
            label={t("sellingCostsRate")}
            value={sellingCostsRate}
            onChange={setSellingCostsRate}
            step={0.5}
            max={100}
            help={t("help.sellingCostsRate")}
          />
        </>
      }
      results={
        <>
          <div className="rounded-xl border border-brand bg-brand-soft p-4 text-brand">
            <div className="text-sm font-medium opacity-80">{t("verdictTitle")}</div>
            <p className="mt-1 text-lg font-semibold">{verdict}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Stat label={t("buyNetCost")} value={formatEUR(result.buyNetCost)} />
            <Stat label={t("rentNetCost")} value={formatEUR(result.rentNetCost)} />
            <Stat label={t("buyEquityEnd")} value={formatEUR(result.buyEquityEnd)} />
            <Stat label={t("totalRentPaid")} value={formatEUR(result.totalRentPaid)} />
          </div>
        </>
      }
    />
  );
}
