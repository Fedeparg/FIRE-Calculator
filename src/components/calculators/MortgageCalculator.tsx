"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { computeMortgage } from "@/core/calculators/hipoteca";
import { formatCompactEUR, formatEUR, formatEURCents, formatPercent } from "@/core/format";
import NumberField from "../ui/NumberField";
import Stat from "../ui/Stat";
import ChartCard from "../ui/ChartCard";
import ChartTooltip from "../charts/ChartTooltip";
import BreakdownDonut from "../charts/BreakdownDonut";
import CalculatorLayout from "../CalculatorLayout";

export default function MortgageCalculator() {
  const t = useTranslations("calc.hipoteca-fija");
  const tc = useTranslations("chart");

  const [principal, setPrincipal] = useState(180000);
  const [annualRate, setAnnualRate] = useState(3);
  const [years, setYears] = useState(30);
  const [openingFeeRate, setOpeningFeeRate] = useState(0.5);
  const [annualInsurance, setAnnualInsurance] = useState(300);

  const result = useMemo(
    () => computeMortgage({ principal, annualRate, years, openingFeeRate, annualInsurance }),
    [principal, annualRate, years, openingFeeRate, annualInsurance],
  );

  return (
    <CalculatorLayout
      inputCount={5}
      inputs={
        <>
          <NumberField label={t("principal")} value={principal} onChange={setPrincipal} step={5000} help={t("help.principal")} />
          <NumberField label={t("annualRate")} value={annualRate} onChange={setAnnualRate} step={0.1} max={100} help={t("help.annualRate")} />
          <NumberField label={t("years")} value={years} onChange={setYears} step={1} min={1} max={40} help={t("help.years")} />
          <NumberField label={t("openingFeeRate")} value={openingFeeRate} onChange={setOpeningFeeRate} step={0.1} max={100} help={t("help.openingFeeRate")} />
          <NumberField label={t("annualInsurance")} value={annualInsurance} onChange={setAnnualInsurance} step={50} help={t("help.annualInsurance")} />
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

          <ChartCard title={t("chartTitle")}>
            <ComposedChart data={result.schedule} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="year" tick={{ fontSize: 12, fill: "var(--muted)" }} />
              <YAxis tick={{ fontSize: 12, fill: "var(--muted)" }} tickFormatter={formatCompactEUR} width={70} />
              <Tooltip content={<ChartTooltip labelPrefix={tc("axisYear")} />} />
              <Legend />
              <Bar dataKey="principalPaid" name={t("seriesPrincipal")} stackId="cuota" fill="var(--brand)" />
              <Bar dataKey="interestPaid" name={t("seriesInterest")} stackId="cuota" fill="var(--accent)" />
              <Line type="monotone" dataKey="balance" name={t("seriesBalance")} stroke="var(--muted)" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ChartCard>

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
