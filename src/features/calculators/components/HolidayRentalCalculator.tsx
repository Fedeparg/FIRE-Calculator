"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { computeHolidayRental } from "@sextante/core/calculators/rentabilidad-alquiler-vacacional";
import { useFormat } from "@/lib/format";
import NumberField from "@/components/ui/NumberField";
import Stat from "@/components/ui/Stat";
import CalculatorLayout from "@/components/CalculatorLayout";
import { useNumberField } from "./CalculatorState";

export default function HolidayRentalCalculator() {
  const t = useTranslations("calc.rentabilidad-alquiler-vacacional");
  const { formatEUR, formatPercent } = useFormat();
  const [purchasePrice, setPurchasePrice] = useNumberField("purchasePrice", 200000);
  const [purchaseCosts, setPurchaseCosts] = useNumberField("purchaseCosts", 20000);
  const [nightlyRate, setNightlyRate] = useNumberField("nightlyRate", 100);
  const [occupiedNights, setOccupiedNights] = useNumberField("occupiedNights", 200);
  const [managementRate, setManagementRate] = useNumberField("managementRate", 20);
  const [cleaningFee, setCleaningFee] = useNumberField("cleaningFee", 50);
  const [avgStayNights, setAvgStayNights] = useNumberField("avgStayNights", 4);
  const [annualExpenses, setAnnualExpenses] = useNumberField("annualExpenses", 4000);

  const result = useMemo(
    () =>
      computeHolidayRental({
        purchasePrice,
        purchaseCosts,
        nightlyRate,
        occupiedNights,
        managementRate,
        cleaningFee,
        avgStayNights,
        annualExpenses,
      }),
    [
      purchasePrice,
      purchaseCosts,
      nightlyRate,
      occupiedNights,
      managementRate,
      cleaningFee,
      avgStayNights,
      annualExpenses,
    ],
  );

  return (
    <CalculatorLayout
      inputCount={8}
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
            label={t("nightlyRate")}
            value={nightlyRate}
            onChange={setNightlyRate}
            step={5}
            help={t("help.nightlyRate")}
          />
          <NumberField
            label={t("occupiedNights")}
            value={occupiedNights}
            onChange={setOccupiedNights}
            min={0}
            max={365}
            step={5}
            help={t("help.occupiedNights")}
          />
          <NumberField
            label={t("managementRate")}
            value={managementRate}
            onChange={setManagementRate}
            min={0}
            max={100}
            step={1}
            help={t("help.managementRate")}
          />
          <NumberField
            label={t("cleaningFee")}
            value={cleaningFee}
            onChange={setCleaningFee}
            step={5}
            help={t("help.cleaningFee")}
          />
          <NumberField
            label={t("avgStayNights")}
            value={avgStayNights}
            onChange={setAvgStayNights}
            min={1}
            step={1}
            help={t("help.avgStayNights")}
          />
          <NumberField
            label={t("annualExpenses")}
            value={annualExpenses}
            onChange={setAnnualExpenses}
            step={250}
            help={t("help.annualExpenses")}
          />
        </>
      }
      results={
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Stat label={t("netYield")} value={formatPercent(result.netYield)} highlight />
          <Stat label={t("grossYield")} value={formatPercent(result.grossYield)} />
          <Stat label={t("grossIncome")} value={formatEUR(result.grossIncome)} />
          <Stat label={t("netIncome")} value={formatEUR(result.netIncome)} />
          <Stat label={t("occupancyRate")} value={formatPercent(result.occupancyRate)} />
          <Stat label={t("managementCost")} value={formatEUR(result.managementCost)} />
          <Stat label={t("cleaningCost")} value={formatEUR(result.cleaningCost)} />
        </div>
      }
    />
  );
}
