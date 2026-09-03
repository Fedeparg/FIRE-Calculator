"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { computeRentalYield } from "@/core/calculators/rentabilidad-alquiler";
import { useFormat } from "@/lib/format";
import NumberField from "../ui/NumberField";
import Stat from "../ui/Stat";
import CalculatorLayout from "../CalculatorLayout";
import { useNumberField } from "./CalculatorState";

export default function RentalYieldCalculator() {
  const t = useTranslations("calc.rentabilidad-alquiler");
  const { formatEUR, formatPercent } = useFormat();
  const [purchasePrice, setPurchasePrice] = useNumberField("purchasePrice", 200000);
  const [purchaseCosts, setPurchaseCosts] = useNumberField("purchaseCosts", 20000);
  const [monthlyRent, setMonthlyRent] = useNumberField("monthlyRent", 1000);
  const [vacancyRate, setVacancyRate] = useNumberField("vacancyRate", 5);
  const [ibiAnnual, setIbiAnnual] = useNumberField("ibiAnnual", 400);
  const [communityMonthly, setCommunityMonthly] = useNumberField("communityMonthly", 50);
  const [insuranceAnnual, setInsuranceAnnual] = useNumberField("insuranceAnnual", 200);
  const [maintenanceAnnual, setMaintenanceAnnual] = useNumberField("maintenanceAnnual", 500);

  const result = useMemo(
    () =>
      computeRentalYield({
        purchasePrice,
        purchaseCosts,
        monthlyRent,
        vacancyRate,
        ibiAnnual,
        communityMonthly,
        insuranceAnnual,
        maintenanceAnnual,
      }),
    [purchasePrice, purchaseCosts, monthlyRent, vacancyRate, ibiAnnual, communityMonthly, insuranceAnnual, maintenanceAnnual],
  );

  return (
    <CalculatorLayout
      inputCount={8}
      inputs={
        <>
          <NumberField label={t("purchasePrice")} value={purchasePrice} onChange={setPurchasePrice} step={5000} help={t("help.purchasePrice")} />
          <NumberField label={t("purchaseCosts")} value={purchaseCosts} onChange={setPurchaseCosts} step={1000} help={t("help.purchaseCosts")} />
          <NumberField label={t("monthlyRent")} value={monthlyRent} onChange={setMonthlyRent} step={50} help={t("help.monthlyRent")} />
          <NumberField label={t("vacancyRate")} value={vacancyRate} onChange={setVacancyRate} step={1} max={100} help={t("help.vacancyRate")} />
          <NumberField label={t("ibiAnnual")} value={ibiAnnual} onChange={setIbiAnnual} step={50} help={t("help.ibiAnnual")} />
          <NumberField label={t("communityMonthly")} value={communityMonthly} onChange={setCommunityMonthly} step={10} help={t("help.communityMonthly")} />
          <NumberField label={t("insuranceAnnual")} value={insuranceAnnual} onChange={setInsuranceAnnual} step={50} help={t("help.insuranceAnnual")} />
          <NumberField label={t("maintenanceAnnual")} value={maintenanceAnnual} onChange={setMaintenanceAnnual} step={100} help={t("help.maintenanceAnnual")} />
        </>
      }
      results={
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Stat label={t("netYield")} value={formatPercent(result.netYield)} highlight />
          <Stat label={t("grossYield")} value={formatPercent(result.grossYield)} />
          <Stat label={t("monthlyNetCashflow")} value={formatEUR(result.monthlyNetCashflow)} />
          <Stat label={t("effectiveRentIncome")} value={formatEUR(result.effectiveRentIncome)} />
          <Stat label={t("totalAnnualExpenses")} value={formatEUR(result.totalAnnualExpenses)} />
          <Stat label={t("netIncome")} value={formatEUR(result.netIncome)} />
        </div>
      }
    />
  );
}
