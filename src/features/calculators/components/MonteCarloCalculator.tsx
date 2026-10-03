"use client";

import { useDeferredValue, useMemo } from "react";
import { useTranslations } from "next-intl";
import { firstItem, lastItem } from "@sextante/core/arrays";
import {
  MAX_RETIREMENT_YEARS,
  MAX_VOLATILITY,
  simulateFire,
  withdrawalSensitivity,
  type ReturnModel,
} from "@sextante/core/calculators/fire-montecarlo";
import { HISTORICAL_RETURNS } from "@sextante/core/data/shiller-returns";
import { useFormat } from "@/shared/format/use-format";
import NumberField from "@/shared/ui/NumberField";
import Notice from "@/shared/ui/Notice";
import SelectField from "@/shared/ui/SelectField";
import Stat from "@/shared/ui/Stat";
import TimeSeriesChart from "@/shared/charts/TimeSeriesChart";
import CalculatorLayout from "@/features/calculators/components/CalculatorLayout";
import { useNumberField, useOptionField } from "./CalculatorState";

const MODELS = ["lognormal", "historical"] as const;
type ModelKind = (typeof MODELS)[number];

/** Paths for the sensitivity table: five simulations in a row, so fewer than the main one. */
const SENSITIVITY_PATHS = 2000;
const FIRST_YEAR = firstItem(HISTORICAL_RETURNS).year;
const LAST_YEAR = lastItem(HISTORICAL_RETURNS).year;

export default function MonteCarloCalculator() {
  const t = useTranslations("calc.simulador-montecarlo");
  const { formatCurrency, formatPercent } = useFormat();

  // Same keys as the FIRE calculator wherever the value means the same.
  const [annualExpenses, setAnnualExpenses] = useNumberField("annualExpenses", 24000);
  const [currentSavings, setCurrentSavings] = useNumberField("currentSavings", 20000);
  const [monthlySavings, setMonthlySavings] = useNumberField("savings", 800);
  const [annualReturn, setAnnualReturn] = useNumberField("annualReturn", 5);
  const [volatility, setVolatility] = useNumberField("volatility", 15);
  const [withdrawalRate, setWithdrawalRate] = useNumberField("withdrawalRate", 4);
  const [retirementYears, setRetirementYears] = useNumberField("retirementYears", 40);
  const [model, setModel] = useOptionField<ModelKind>("model", "lognormal", MODELS);
  const [stockShare, setStockShare] = useNumberField("stockShare", 60);

  // 5,000 paths × ~120 years take about 60 ms on a laptop (more on a modest phone), and it
  // recomputes on every keystroke. `useDeferredValue` tells React the simulation may lag
  // "behind": the field updates instantly and the result is recomputed at low priority,
  // discarding intermediate computations while typing continues. A single object is deferred
  // so all values change together. The seed is fixed, so the result is identical on server
  // and client.
  const latestInputs = useMemo(
    () => ({
      annualExpenses,
      currentSavings,
      monthlySavings,
      annualReturn,
      volatility,
      withdrawalRate,
      retirementYears,
      returnModel: (model === "historical"
        ? { kind: "historical", stockShare }
        : { kind: "lognormal" }) satisfies ReturnModel,
    }),
    [
      annualExpenses,
      currentSavings,
      monthlySavings,
      annualReturn,
      volatility,
      withdrawalRate,
      retirementYears,
      model,
      stockShare,
    ],
  );
  const inputs = useDeferredValue(latestInputs);
  // While the deferred value lags behind the latest keystroke, what is shown belongs to the
  // previous input: it is flagged and dimmed so nobody reads a stale result as the new one.
  const recalculating = inputs !== latestInputs;
  const result = useMemo(() => simulateFire(inputs), [inputs]);
  // Same input at other withdrawal rates, with the same market sequences (same seed).
  const sensitivity = useMemo(() => withdrawalSensitivity(inputs, undefined, { paths: SENSITIVITY_PATHS }), [inputs]);

  const { p10, p50, p90 } = result.yearsToFire;
  const medianLabel = p50 === null ? t("notReached") : p50 === 0 ? t("alreadyFree") : t("years", { years: p50 });
  const rangeLabel = p10 === null ? null : p90 === null ? t("rangeOpen", { p10 }) : t("range", { p10, p90 });
  const deterministicLabel =
    result.deterministicYearsToFire === null
      ? t("deterministicNotReached")
      : t("deterministic", { years: result.deterministicYearsToFire });

  return (
    <CalculatorLayout
      layout="grid"
      notice={<Notice>{t("note")}</Notice>}
      inputs={
        <>
          <NumberField
            label={t("annualExpenses")}
            value={annualExpenses}
            onChange={setAnnualExpenses}
            min={0}
            step={1000}
            help={t("help.annualExpenses")}
          />
          <NumberField
            label={t("currentSavings")}
            value={currentSavings}
            onChange={setCurrentSavings}
            min={0}
            step={1000}
            help={t("help.currentSavings")}
          />
          <NumberField
            label={t("monthlySavings")}
            value={monthlySavings}
            onChange={setMonthlySavings}
            min={0}
            step={50}
            help={t("help.monthlySavings")}
          />
          <SelectField
            label={t("model")}
            value={model}
            onChange={setModel}
            options={MODELS.map((m) => ({ value: m, label: t(`models.${m}`) }))}
            help={t("help.model", { from: FIRST_YEAR, to: LAST_YEAR })}
          />
          {/* Each model shows only its own parameters; the other's are kept in the URL. */}
          {model === "historical" ? (
            <NumberField
              label={t("stockShare")}
              value={stockShare}
              onChange={setStockShare}
              step={5}
              min={0}
              max={100}
              help={t("help.stockShare")}
            />
          ) : (
            <>
              <NumberField
                label={t("annualReturn")}
                value={annualReturn}
                onChange={setAnnualReturn}
                step={0.5}
                max={100}
                help={t("help.annualReturn")}
              />
              <NumberField
                label={t("volatility")}
                value={volatility}
                onChange={setVolatility}
                step={1}
                min={0}
                max={MAX_VOLATILITY}
                help={t("help.volatility")}
              />
            </>
          )}
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
            label={t("retirementYears")}
            value={retirementYears}
            onChange={setRetirementYears}
            step={1}
            min={0}
            max={MAX_RETIREMENT_YEARS}
            help={t("help.retirementYears")}
          />
        </>
      }
      results={
        <div className={`grid gap-6 transition-opacity ${recalculating ? "opacity-60" : ""}`} aria-busy={recalculating}>
          <p role="status" className="sr-only">
            {recalculating ? t("recalculating") : ""}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Stat label={t("successRate")} value={formatPercent(result.successRate * 100)} highlight />
            <Stat label={t("medianYears")} value={medianLabel} />
            <Stat label={t("reachRate")} value={formatPercent(result.reachRate * 100)} />
            <Stat label={t("survivalRate")} value={formatPercent(result.survivalRate * 100)} />
          </div>

          <p className="text-sm text-muted">
            {rangeLabel && <>{rangeLabel} </>}
            {deterministicLabel}
          </p>

          <TimeSeriesChart
            title={t("chartTitle")}
            data={result.series}
            xKey="year"
            stack={[]}
            bands={[
              { lowKey: "p10", highKey: "p90", name: t("band80"), color: "var(--brand)" },
              { lowKey: "p25", highKey: "p75", name: t("band50"), color: "var(--brand)" },
            ]}
            lines={[
              { key: "p50", name: t("seriesMedian"), color: "var(--brand)", dashed: false },
              { key: "deterministic", name: t("seriesDeterministic"), color: "var(--accent)" },
              { key: "target", name: t("seriesTarget"), color: "var(--muted)" },
            ]}
            valueKey="p50"
            selectable={false}
            showTotal={false}
          />

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[24rem] text-left text-sm">
              <caption className="px-3 pt-3 text-left text-xs text-muted">{t("sensitivityCaption")}</caption>
              <thead>
                <tr className="border-b border-border text-muted">
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t("sensitivityRate")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {t("sensitivityTarget")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {t("successRate")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sensitivity.map((row) => (
                  <tr
                    key={row.rate}
                    className={`border-b border-border last:border-0 ${row.rate === withdrawalRate ? "bg-surface-2" : ""}`}
                  >
                    <th scope="row" className="px-3 py-2 font-normal text-foreground">
                      {formatPercent(row.rate)}
                    </th>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {formatCurrency(row.fireNumber, "EUR")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {formatPercent(row.successRate * 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {model === "historical" && (
            <p className="text-xs text-muted">{t("historicalSource", { from: FIRST_YEAR, to: LAST_YEAR })}</p>
          )}
        </div>
      }
    />
  );
}
