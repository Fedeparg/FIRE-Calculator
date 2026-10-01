"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { computeFire } from "@sextante/core/calculators/fire";
import { FREQUENCIES, type Frequency } from "@sextante/core/projection";
import { Link } from "@/i18n/navigation";
import { useFormat } from "@/lib/format";
import NumberField from "@/components/ui/NumberField";
import SelectField from "@/components/ui/SelectField";
import Stat from "@/components/ui/Stat";
import TimeSeriesChart from "@/components/charts/TimeSeriesChart";
import BreakdownDonut from "@/components/charts/BreakdownDonut";
import CalculatorLayout from "@/components/CalculatorLayout";
import { useNumberField, useOptionField } from "./CalculatorState";

export default function FireCalculator() {
  const t = useTranslations("calc.independencia-financiera");
  const { formatEUR } = useFormat();
  const tf = useTranslations("frequency");
  const tc = useTranslations("chart");

  const [annualExpenses, setAnnualExpenses] = useNumberField("annualExpenses", 24000);
  const [currentSavings, setCurrentSavings] = useNumberField("currentSavings", 20000);
  const [savings, setSavings] = useNumberField("savings", 800);
  const [frequency, setFrequency] = useOptionField<Frequency>("frequency", "monthly", FREQUENCIES);
  const [annualReturn, setAnnualReturn] = useNumberField("annualReturn", 5);
  const [withdrawalRate, setWithdrawalRate] = useNumberField("withdrawalRate", 4);
  const [savingsGrowth, setSavingsGrowth] = useNumberField("savingsGrowth", 0);

  const result = useMemo(
    () =>
      computeFire({
        annualExpenses,
        currentSavings,
        savings,
        frequency,
        annualReturn,
        withdrawalRate,
        savingsGrowth,
      }),
    [annualExpenses, currentSavings, savings, frequency, annualReturn, withdrawalRate, savingsGrowth],
  );

  const yearsLabel =
    result.yearsToFire === null
      ? t("notReached")
      : result.yearsToFire === 0
        ? t("alreadyFree")
        : t("years", { years: result.yearsToFire });

  const firePoint = result.series.find((p) => p.year === result.yearsToFire) ?? result.series.at(-1);

  const frequencyOptions = FREQUENCIES.map((f) => ({ value: f, label: tf(f) }));

  return (
    <CalculatorLayout
      inputCount={7}
      inputs={
        <>
          <NumberField
            label={t("annualExpenses")}
            value={annualExpenses}
            onChange={setAnnualExpenses}
            step={1000}
            help={t("help.annualExpenses")}
          />
          <NumberField
            label={t("currentSavings")}
            value={currentSavings}
            onChange={setCurrentSavings}
            step={1000}
            help={t("help.currentSavings")}
          />
          <NumberField label={t("savings")} value={savings} onChange={setSavings} step={50} help={t("help.savings")} />
          <SelectField
            label={tf("label")}
            value={frequency}
            options={frequencyOptions}
            onChange={setFrequency}
            help={tf("help")}
          />
          <NumberField
            label={t("annualReturn")}
            value={annualReturn}
            onChange={setAnnualReturn}
            step={0.5}
            max={100}
            help={t("help.annualReturn")}
          />
          <NumberField
            label={t("withdrawalRate")}
            value={withdrawalRate}
            onChange={setWithdrawalRate}
            step={0.1}
            min={1}
            max={100}
            help={t("help.withdrawalRate")}
          />
          <NumberField
            label={t("savingsGrowth")}
            value={savingsGrowth}
            onChange={setSavingsGrowth}
            step={0.5}
            max={100}
            help={t("help.savingsGrowth")}
          />
        </>
      }
      results={
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Stat label={t("fireNumber")} value={formatEUR(result.fireNumber)} highlight />
            <Stat label={t("yearsToFire")} value={yearsLabel} />
          </div>

          <TimeSeriesChart
            title={t("chartTitle")}
            data={result.series}
            xKey="year"
            stack={[
              { key: "contributed", name: tc("contributed"), color: "var(--brand)" },
              { key: "interest", name: tc("interest"), color: "var(--accent)" },
            ]}
            lines={[{ key: "target", name: t("seriesTarget"), color: "var(--muted)" }]}
            valueKey="value"
            contributedKey="contributed"
            interestKey="interest"
            labels={{
              axisX: tc("axisYear"),
              total: tc("total"),
              selectionTitle: tc("selectionTitle"),
              growth: tc("growth"),
              contributed: tc("contributed"),
              interest: tc("interest"),
            }}
          />

          {firePoint && (
            <BreakdownDonut
              title={t("donutTitle")}
              centerLabel={t("donutCenter")}
              data={[
                { name: tc("contributed"), value: firePoint.contributed, color: "var(--brand)" },
                { name: tc("interest"), value: firePoint.interest, color: "var(--accent)" },
              ]}
            />
          )}

          <p className="text-sm text-muted">
            <Link
              href="/calculadoras/simulador-montecarlo"
              className="font-medium text-brand underline underline-offset-2"
            >
              {t("monteCarloLink")}
            </Link>
          </p>
        </>
      }
    />
  );
}
