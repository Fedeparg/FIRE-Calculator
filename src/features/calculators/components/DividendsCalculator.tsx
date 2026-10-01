"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { computeDividends } from "@sextante/core/calculators/dividendos";
import { useFormat } from "@/shared/format/use-format";
import NumberField from "@/shared/ui/NumberField";
import Stat from "@/shared/ui/Stat";
import Notice from "@/shared/ui/Notice";
import TimeSeriesChart from "@/shared/charts/TimeSeriesChart";
import CalculatorLayout from "@/features/calculators/components/CalculatorLayout";
import { useNumberField } from "./CalculatorState";

export default function DividendsCalculator() {
  const t = useTranslations("calc.dividendos");
  const { formatEUR, formatPercent } = useFormat();
  const tc = useTranslations("chart");

  const [shares, setShares] = useNumberField("shares", 100);
  const [dividendPerShare, setDividendPerShare] = useNumberField("dividendPerShare", 1.5);
  const [sharePrice, setSharePrice] = useNumberField("sharePrice", 50);
  const [withholdingRate, setWithholdingRate] = useNumberField("withholdingRate", 19);
  const [annualGrowth, setAnnualGrowth] = useNumberField("annualGrowth", 5);
  const [years, setYears] = useNumberField("years", 10);

  const result = useMemo(
    () => computeDividends({ shares, dividendPerShare, sharePrice, withholdingRate, annualGrowth, years }),
    [shares, dividendPerShare, sharePrice, withholdingRate, annualGrowth, years],
  );

  return (
    <CalculatorLayout
      inputCount={6}
      notice={<Notice>{t("note")}</Notice>}
      inputs={
        <>
          <NumberField label={t("shares")} value={shares} onChange={setShares} step={10} help={t("help.shares")} />
          <NumberField
            label={t("dividendPerShare")}
            value={dividendPerShare}
            onChange={setDividendPerShare}
            step={0.1}
            help={t("help.dividendPerShare")}
          />
          <NumberField
            label={t("sharePrice")}
            value={sharePrice}
            onChange={setSharePrice}
            step={1}
            help={t("help.sharePrice")}
          />
          <NumberField
            label={t("withholdingRate")}
            value={withholdingRate}
            onChange={setWithholdingRate}
            step={1}
            max={100}
            help={t("help.withholdingRate")}
          />
          <NumberField
            label={t("annualGrowth")}
            value={annualGrowth}
            onChange={setAnnualGrowth}
            step={0.5}
            max={100}
            help={t("help.annualGrowth")}
          />
          <NumberField label={t("years")} value={years} onChange={setYears} step={1} max={70} help={t("help.years")} />
        </>
      }
      results={
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Stat label={t("net")} value={formatEUR(result.net)} highlight />
            <Stat label={t("gross")} value={formatEUR(result.gross)} />
            <Stat label={t("withheld")} value={formatEUR(result.withheld)} />
            <Stat label={t("netYield")} value={result.netYield === null ? "—" : formatPercent(result.netYield)} />
            {years > 0 && <Stat label={t("cumulativeNet")} value={formatEUR(result.cumulativeNet)} />}
            {years > 0 && <Stat label={t("finalYearNet")} value={formatEUR(result.finalYearNet)} />}
          </div>

          {years > 0 && (
            <TimeSeriesChart
              title={t("chartTitle")}
              data={result.series}
              xKey="year"
              stack={[{ key: "cumulativeNet", name: t("seriesCumulativeNet"), color: "var(--accent)" }]}
              valueKey="cumulativeNet"
              labels={{
                axisX: tc("axisYear"),
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
