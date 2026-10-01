"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { computeMortgage, type MortgageYearPoint } from "@sextante/core/calculators/hipoteca";
import { useFormat } from "@/lib/format";
import NumberField from "@/components/ui/NumberField";
import Stat from "@/components/ui/Stat";
import ChartDataTable, { type ChartTableColumn } from "@/components/charts/ChartDataTable";
import ChartTooltip from "@/components/charts/ChartTooltip";
import BreakdownDonut from "@/components/charts/BreakdownDonut";
import CalculatorLayout from "@/features/calculators/components/CalculatorLayout";
import { useNumberField } from "./CalculatorState";

export default function MortgageCalculator() {
  const t = useTranslations("calc.hipoteca-fija");
  const { formatCompactEUR, formatEUR, formatEURCents, formatNumber, formatPercent } = useFormat();
  const tc = useTranslations("chart");

  const [principal, setPrincipal] = useNumberField("principal", 180000);
  const [annualRate, setAnnualRate] = useNumberField("annualRate", 3);
  const [years, setYears] = useNumberField("years", 30);
  const [openingFeeRate, setOpeningFeeRate] = useNumberField("openingFeeRate", 0.5);
  const [annualInsurance, setAnnualInsurance] = useNumberField("annualInsurance", 300);

  const result = useMemo(
    () => computeMortgage({ principal, annualRate, years, openingFeeRate, annualInsurance }),
    [principal, annualRate, years, openingFeeRate, annualInsurance],
  );

  // Alternativa textual del cuadro de amortización (ver `ChartDataTable`).
  const scheduleColumns: ChartTableColumn<MortgageYearPoint>[] = [
    { label: tc("axisYear"), value: (row) => formatNumber(row.year) },
    { label: t("seriesPrincipal"), value: (row) => formatEUR(row.principalPaid) },
    { label: t("seriesInterest"), value: (row) => formatEUR(row.interestPaid) },
    { label: t("seriesBalance"), value: (row) => formatEUR(row.balance) },
  ];

  return (
    <CalculatorLayout
      inputCount={5}
      inputs={
        <>
          <NumberField
            label={t("principal")}
            value={principal}
            onChange={setPrincipal}
            step={5000}
            help={t("help.principal")}
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
            label={t("years")}
            value={years}
            onChange={setYears}
            step={1}
            min={1}
            max={40}
            help={t("help.years")}
          />
          <NumberField
            label={t("openingFeeRate")}
            value={openingFeeRate}
            onChange={setOpeningFeeRate}
            step={0.1}
            max={100}
            help={t("help.openingFeeRate")}
          />
          <NumberField
            label={t("annualInsurance")}
            value={annualInsurance}
            onChange={setAnnualInsurance}
            step={50}
            help={t("help.annualInsurance")}
          />
        </>
      }
      results={
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label={t("monthlyPayment")} value={formatEURCents(result.monthlyPayment)} highlight />
            <Stat label={t("apr")} value={formatPercent(result.apr)} />
            <Stat label={t("totalInterest")} value={formatEUR(result.totalInterest)} />
            <Stat label={t("totalPaid")} value={formatEUR(result.totalPaid)} />
            <Stat label={t("openingCost")} value={formatEUR(result.openingCost)} />
            <Stat label={t("insuranceCost")} value={formatEUR(result.insuranceCost)} />
            <Stat label={t("totalCostWithFees")} value={formatEUR(result.totalCostWithFees)} />
          </div>

          <div className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-medium text-foreground">{t("chartTitle")}</h2>
            <div
              style={{ width: "100%", height: 300 }}
              role="img"
              aria-label={tc("imageLabel", { title: t("chartTitle") })}
            >
              <ResponsiveContainer>
                <ComposedChart data={result.schedule} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="year" tick={{ fontSize: 12, fill: "var(--muted)" }} />
                  <YAxis tick={{ fontSize: 12, fill: "var(--muted)" }} tickFormatter={formatCompactEUR} width={70} />
                  <Tooltip content={<ChartTooltip labelPrefix={tc("axisYear")} />} />
                  <Legend />
                  <Bar dataKey="principalPaid" name={t("seriesPrincipal")} stackId="cuota" fill="var(--brand)" />
                  <Bar dataKey="interestPaid" name={t("seriesInterest")} stackId="cuota" fill="var(--accent)" />
                  <Line
                    type="monotone"
                    dataKey="balance"
                    name={t("seriesBalance")}
                    stroke="var(--muted)"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <ChartDataTable title={t("chartTitle")} columns={scheduleColumns} rows={result.schedule} />
          </div>

          <BreakdownDonut
            title={t("donutTitle")}
            centerLabel={t("donutCenter")}
            data={[
              { name: t("seriesPrincipal"), value: principal, color: "var(--brand)" },
              { name: t("seriesInterest"), value: result.totalInterest, color: "var(--accent)" },
            ]}
          />
        </>
      }
    />
  );
}
