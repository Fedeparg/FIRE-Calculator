"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { computeCreditCard, type PaymentMode } from "@/core/calculators/tarjeta-credito";
import { formatEUR, formatEURCents, formatNumber } from "@/core/format";
import NumberField from "../ui/NumberField";
import SelectField from "../ui/SelectField";
import Stat from "../ui/Stat";
import TimeSeriesChart from "../charts/TimeSeriesChart";
import CalculatorLayout from "../CalculatorLayout";

export default function CreditCardCalculator() {
  const t = useTranslations("calc.tarjeta-credito");
  const tc = useTranslations("chart");

  const [balance, setBalance] = useState(2000);
  const [annualRate, setAnnualRate] = useState(22);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("fixed");
  const [monthlyPayment, setMonthlyPayment] = useState(100);
  const [minPercent, setMinPercent] = useState(3);
  const [minFloor, setMinFloor] = useState(25);

  const result = useMemo(
    () => computeCreditCard({ balance, annualRate, paymentMode, monthlyPayment, minPercent, minFloor }),
    [balance, annualRate, paymentMode, monthlyPayment, minPercent, minFloor],
  );

  const isPercent = paymentMode === "percent";
  const neverPaysOff = result.monthsToPayoff === null;

  return (
    <CalculatorLayout
      inputCount={isPercent ? 5 : 4}
      inputs={
        <>
          <NumberField label={t("balance")} value={balance} onChange={setBalance} step={100} help={t("help.balance")} />
          <NumberField label={t("annualRate")} value={annualRate} onChange={setAnnualRate} step={0.5} max={100} help={t("help.annualRate")} />
          <SelectField
            label={t("paymentMode")}
            value={paymentMode}
            onChange={setPaymentMode}
            options={[
              { value: "fixed", label: t("modeFixed") },
              { value: "percent", label: t("modePercent") },
            ]}
            help={t("help.paymentMode")}
          />
          {isPercent ? (
            <>
              <NumberField label={t("minPercent")} value={minPercent} onChange={setMinPercent} step={0.5} min={0} max={100} help={t("help.minPercent")} />
              <NumberField label={t("minFloor")} value={minFloor} onChange={setMinFloor} step={5} min={0} help={t("help.minFloor")} />
            </>
          ) : (
            <NumberField label={t("monthlyPayment")} value={monthlyPayment} onChange={setMonthlyPayment} step={10} help={t("help.monthlyPayment")} />
          )}
        </>
      }
      results={
        <>
          {neverPaysOff && (
            <p className="rounded-xl border border-border bg-surface p-4 text-sm text-foreground">
              {t("never")}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label={t("monthsToPayoff")}
              value={neverPaysOff ? "∞" : formatNumber(result.monthsToPayoff ?? 0)}
              highlight
            />
            <Stat label={t("totalInterest")} value={neverPaysOff ? "—" : formatEUR(result.totalInterest)} />
            <Stat label={t("totalPaid")} value={neverPaysOff ? "—" : formatEUR(result.totalPaid)} />
            {isPercent && (
              <Stat label={t("firstPayment")} value={neverPaysOff ? "—" : formatEURCents(result.firstPayment)} />
            )}
          </div>

          {!neverPaysOff && result.series.length > 1 && (
            <TimeSeriesChart
              title={t("chartTitle")}
              data={result.series}
              xKey="month"
              stack={[]}
              lines={[
                { key: "balance", name: t("seriesBalance"), color: "var(--brand)" },
                { key: "interestPaid", name: t("seriesInterest"), color: "var(--accent)" },
              ]}
              valueKey="balance"
              labels={{
                axisX: t("axisMonth"),
                total: tc("total"),
                selectionTitle: tc("selectionTitle"),
                growth: tc("growth"),
                contributed: tc("contributed"),
                interest: tc("interest"),
              }}
            />
          )}
        </>
      }
    />
  );
}
