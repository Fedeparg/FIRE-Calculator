"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { SPAIN_SAVINGS_WITHHOLDING_PCT } from "@sextante/core/fiscal/countries";
import { computeStaking } from "@sextante/core/calculators/staking";
import { useFormat } from "@/shared/format/use-format";
import Stat from "@/shared/ui/Stat";
import Notice from "@/shared/ui/Notice";
import TimeSeriesChart from "@/shared/charts/TimeSeriesChart";
import BreakdownDonut from "@/shared/charts/BreakdownDonut";
import CalculatorLayout from "@/features/calculators/components/CalculatorLayout";
import { useBoundNumberField } from "./CalculatorState";
import NumField from "./NumField";
import { useInputs } from "./use-inputs";
import StatGrid from "@/shared/ui/StatGrid";

export default function StakingCalculator() {
  const t = useTranslations("calc.staking");
  const { formatEUR } = useFormat();

  const principal = useBoundNumberField("principal", 5000);
  const apy = useBoundNumberField("apy", 8);
  const years = useBoundNumberField("years", 5);
  const withholdingRate = useBoundNumberField("withholdingRate", SPAIN_SAVINGS_WITHHOLDING_PCT);

  const inputs = useInputs({ principal, apy, years, withholdingRate });
  const result = useMemo(() => computeStaking(inputs), [inputs]);

  return (
    <CalculatorLayout
      layout="sidebar"
      notice={<Notice>{t("note")}</Notice>}
      inputs={
        <>
          <NumField field={principal} step={500} />
          <NumField field={apy} step={0.5} max={1000} />
          <NumField field={years} step={1} max={50} />
          <NumField field={withholdingRate} step={1} max={100} />
        </>
      }
      results={
        <>
          <StatGrid>
            <Stat label={t("netFinalValue")} value={formatEUR(result.netFinalValue)} highlight />
            <Stat label={t("finalValue")} value={formatEUR(result.finalValue)} />
            <Stat label={t("rewards")} value={formatEUR(result.rewards)} />
            <Stat label={t("netRewards")} value={formatEUR(result.netRewards)} />
          </StatGrid>

          <TimeSeriesChart
            title={t("chartTitle")}
            data={result.series}
            xKey="year"
            stack={[
              { key: "contributed", name: t("seriesPrincipal"), color: "var(--brand)" },
              { key: "interest", name: t("seriesRewards"), color: "var(--accent)" },
            ]}
            valueKey="value"
            contributedKey="contributed"
            interestKey="interest"
          />

          <BreakdownDonut
            title={t("donutTitle")}
            centerLabel={t("donutCenter")}
            data={[
              { name: t("seriesPrincipal"), value: inputs.principal, color: "var(--brand)" },
              { name: t("seriesRewards"), value: result.rewards, color: "var(--accent)" },
            ]}
          />
        </>
      }
    />
  );
}
