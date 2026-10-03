"use client";

import { useDeferredValue, useMemo } from "react";
import { useTranslations } from "next-intl";
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

/** Vidas de la tabla de sensibilidad: cinco simulaciones seguidas, así que menos que la principal. */
const SENSITIVITY_PATHS = 2000;
const FIRST_YEAR = HISTORICAL_RETURNS[0].year;
const LAST_YEAR = HISTORICAL_RETURNS[HISTORICAL_RETURNS.length - 1].year;

export default function MonteCarloCalculator() {
  const t = useTranslations("calc.simulador-montecarlo");
  const { formatCurrency, formatPercent } = useFormat();

  // Mismas claves que la calculadora FIRE donde el dato es el mismo.
  const [annualExpenses, setAnnualExpenses] = useNumberField("annualExpenses", 24000);
  const [currentSavings, setCurrentSavings] = useNumberField("currentSavings", 20000);
  const [monthlySavings, setMonthlySavings] = useNumberField("savings", 800);
  const [annualReturn, setAnnualReturn] = useNumberField("annualReturn", 5);
  const [volatility, setVolatility] = useNumberField("volatility", 15);
  const [withdrawalRate, setWithdrawalRate] = useNumberField("withdrawalRate", 4);
  const [retirementYears, setRetirementYears] = useNumberField("retirementYears", 40);
  const [model, setModel] = useOptionField<ModelKind>("model", "lognormal", MODELS);
  const [stockShare, setStockShare] = useNumberField("stockShare", 60);

  // 5.000 vidas × ~120 años cuestan unos 60 ms en un portátil (más en un móvil modesto), y se
  // recalcula con cada tecla. `useDeferredValue` le dice a React que la simulación puede ir
  // "por detrás": el campo se actualiza al instante y el resultado se recalcula con prioridad
  // baja, descartando cálculos intermedios si se sigue tecleando. Se difiere un único objeto
  // para que todos los valores cambien juntos. La semilla es fija, así que el resultado es
  // idéntico en servidor y cliente.
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
  // Mientras el valor diferido va por detrás del último tecleado, lo que se ve es de la entrada
  // anterior: se avisa y se atenúa para que nadie lea un resultado viejo como el nuevo.
  const recalculating = inputs !== latestInputs;
  const result = useMemo(() => simulateFire(inputs), [inputs]);
  // Misma entrada con otras tasas de retiro, con las mismas secuencias de mercado (misma semilla).
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
          {/* Cada modelo enseña solo sus parámetros; los del otro se conservan en la URL. */}
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
