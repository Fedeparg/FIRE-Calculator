"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { computeBudget } from "@sextante/core/calculators/presupuesto";
import { useFormat } from "@/lib/format";
import NumberField from "../ui/NumberField";
import Stat from "../ui/Stat";
import BreakdownDonut from "../charts/BreakdownDonut";
import CalculatorLayout from "../CalculatorLayout";
import { useNumberField } from "./CalculatorState";

export default function BudgetCalculator() {
  const t = useTranslations("calc.presupuesto-mensual");
  const { formatEUR, formatPercent } = useFormat();
  const [income, setIncome] = useNumberField("income", 2000);
  const [needs, setNeeds] = useNumberField("needs", 1000);
  const [wants, setWants] = useNumberField("wants", 600);

  const result = useMemo(() => computeBudget({ income, needs, wants }), [income, needs, wants]);

  const rows = [
    { key: "needs", actual: result.needsRate, target: 50, recommended: result.recommendedNeeds },
    { key: "wants", actual: result.wantsRate, target: 30, recommended: result.recommendedWants },
    { key: "savings", actual: result.savingsRate, target: 20, recommended: result.recommendedSavings },
  ] as const;

  return (
    <CalculatorLayout
      inputCount={3}
      inputs={
        <>
          <NumberField label={t("income")} value={income} onChange={setIncome} step={100} help={t("help.income")} />
          <NumberField label={t("needs")} value={needs} onChange={setNeeds} step={50} help={t("help.needs")} />
          <NumberField label={t("wants")} value={wants} onChange={setWants} step={50} help={t("help.wants")} />
        </>
      }
      results={
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label={t("savings")} value={formatEUR(result.savings)} highlight />
            <Stat label={t("savingsRate")} value={formatPercent(result.savingsRate)} />
            <Stat label={t("annualSavings")} value={formatEUR(result.annualSavings)} />
          </div>

          <div className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-medium text-foreground">{t("comparisonTitle")}</h2>
            <div className="grid gap-2 text-sm">
              <div className="grid grid-cols-3 text-xs font-semibold uppercase tracking-wide text-muted">
                <span>{t("comparisonCategory")}</span>
                <span className="text-right">{t("comparisonActual")}</span>
                <span className="text-right">{t("comparisonTarget")}</span>
              </div>
              {rows.map((r) => (
                <div key={r.key} className="grid grid-cols-3 items-center border-t border-border pt-2">
                  <span className="text-foreground">
                    {t(`slice${r.key === "needs" ? "Needs" : r.key === "wants" ? "Wants" : "Savings"}`)}
                  </span>
                  <span className="text-right font-medium text-foreground">{formatPercent(r.actual)}</span>
                  <span className="text-right text-muted">
                    {formatPercent(r.target)} · {formatEUR(r.recommended)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <BreakdownDonut
            title={t("donutTitle")}
            centerLabel={t("donutCenter")}
            data={[
              { name: t("sliceNeeds"), value: needs, color: "var(--brand)" },
              { name: t("sliceWants"), value: wants, color: "var(--accent)" },
              { name: t("sliceSavings"), value: Math.max(0, result.savings), color: "var(--muted)" },
            ]}
          />
        </>
      }
    />
  );
}
