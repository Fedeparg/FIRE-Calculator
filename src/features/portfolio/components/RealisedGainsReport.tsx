"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import Notice from "@/shared/ui/Notice";
import SelectField from "@/shared/ui/SelectField";
import { UTF8_BOM } from "@/shared/format/csv";
import type { ReferenceRates } from "@sextante/core/fiscal/fx-reference";
import { buildIncomeReport, type IncomeEvent } from "@sextante/core/fiscal/income";
import { buildSavingsReturn } from "@sextante/core/fiscal/savings-return";
import {
  buildRealisedGainsReport,
  TAX_CURRENCY,
  type RealisedGainsPosition,
  type RealisedGainsYear,
} from "@sextante/core/fiscal/realised-gains";
import { buildRealisedGainsCsv } from "@/features/portfolio/model/realised-gains-csv";
import { asLocale } from "@/i18n/types";
import { downloadBlob } from "@/shared/format/download";
import { useFormat } from "@/shared/format/use-format";
import Button from "@/shared/ui/Button";
import IncomeSection from "./IncomeSection";
import SavingsReturnSection from "./SavingsReturnSection";

type Props = {
  positions: RealisedGainsPosition[];
  /** Dividendos, intereses y recompensas. */
  income: IncomeEvent[];
  /** Tipos de referencia del BCE de las divisas con ventas. */
  rates: ReferenceRates;
  /** `false` si hacían falta tipos y no se pudieron cargar. */
  ratesLoaded: boolean;
};

/** Color del importe según su signo, con los tokens del tema. */
function signColor(value: number): string {
  return value > 0 ? "text-success" : value < 0 ? "text-danger" : "text-foreground";
}

/**
 * Informe anual de ganancias y pérdidas REALIZADAS: las ventas registradas en la cartera,
 * emparejadas por FIFO, pasadas a euros y compensadas dentro de cada ejercicio.
 *
 * El cálculo es `buildRealisedGainsReport` (core puro y testeado); aquí solo se elige el
 * ejercicio, se pinta y se exporta. Los tipos del BCE llegan ya cargados del servidor.
 */
export default function RealisedGainsReport({ positions, income, rates, ratesLoaded }: Props) {
  const t = useTranslations("portfolio.realisedGains");
  const locale = asLocale(useLocale());

  const report = useMemo(() => buildRealisedGainsReport(positions, rates), [positions, rates]);
  const incomeReport = useMemo(() => buildIncomeReport(income, rates), [income, rates]);
  // Ejercicios con ventas o con cobros; sin ninguno, el actual (para poder anotar el primer cobro).
  const years = useMemo(() => {
    const all = new Set([...report.years.map((y) => y.year), ...incomeReport.years.map((y) => y.year)]);
    if (all.size === 0) all.add(new Date().getUTCFullYear());
    return [...all].sort((a, b) => b - a);
  }, [report, incomeReport]);

  const [selected, setSelected] = useState<string>(() => String(years[0]));
  const [failed, setFailed] = useState(false);
  const selectedYear = years.find((y) => String(y) === selected) ?? years[0];
  const year = report.years.find((y) => y.year === selectedYear);
  const incomeEvents = income.filter((event) => event.paidAt.startsWith(String(selectedYear)));
  const incomeSummary = incomeReport.years.find((y) => y.year === selectedYear);
  // Sin saldos negativos de años anteriores todavía: se introducirán con el formulario de pendientes.
  const savingsReturn = buildSavingsReturn({
    year: selectedYear,
    gains: year,
    income: incomeSummary,
    incomeEvents,
    rates,
    pending: [],
  });

  const hasForeign = year?.sales.some((sale) => sale.currency !== TAX_CURRENCY) ?? false;

  function handleDownload() {
    if (!year) return;
    setFailed(false);
    try {
      const csv = buildRealisedGainsCsv(
        year,
        {
          date: t("csv.date"),
          ticker: t("csv.ticker"),
          name: t("csv.name"),
          currency: t("csv.currency"),
          quantity: t("csv.quantity"),
          price: t("csv.price"),
          fees: t("csv.fees"),
          transferValue: t("csv.transferValue"),
          acquisitionValue: t("csv.acquisitionValue"),
          gain: t("csv.gain"),
          exchangeRate: t("csv.exchangeRate"),
          transferValueEur: t("csv.transferValueEur"),
          acquisitionValueEur: t("csv.acquisitionValueEur"),
          gainEur: t("csv.gainEur"),
          fxDifferenceEur: t("csv.fxDifferenceEur"),
        },
        locale,
      );
      downloadBlob(
        new Blob([UTF8_BOM, csv], { type: "text/csv;charset=utf-8" }),
        `sextante-plusvalias-${year.year}.csv`,
      );
    } catch {
      // Solo puede fallar el navegador (memoria, descargas bloqueadas): se avisa.
      setFailed(true);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="w-40">
          <SelectField
            label={t("yearLabel")}
            value={String(selectedYear)}
            onChange={setSelected}
            options={years.map((y) => ({ value: String(y), label: String(y) }))}
          />
        </div>
        {year && (
          <div className="flex flex-col items-end gap-1">
            <Button variant="secondary" onClick={handleDownload}>
              {t("download", { year: year.year })}
            </Button>
            {failed && <p className="text-xs text-warning">{t("downloadError")}</p>}
          </div>
        )}
      </div>

      {!ratesLoaded && <Notice variant="warning">{t("ratesUnavailable")}</Notice>}

      {year ? <SalesSection year={year} showFx={hasForeign} /> : <Notice variant="info">{t("noSalesThisYear")}</Notice>}

      {year && year.unconverted.length > 0 && (
        <Notice variant="warning">
          {t("unconverted", {
            currencies: year.unconverted.map((u) => u.currency).join(", "),
            count: year.unconverted.reduce((sum, u) => sum + u.sales, 0),
          })}
        </Notice>
      )}
      {year && year.fxIncomplete > 0 && (
        <Notice variant="warning">{t("fxIncomplete", { count: year.fxIncomplete })}</Notice>
      )}
      {hasForeign && <Notice variant="info">{t("fxCriterion")}</Notice>}

      <IncomeSection year={selectedYear} summary={incomeSummary} events={incomeEvents} />

      <SavingsReturnSection result={savingsReturn} />

      <Notice variant="info">{t("scope")}</Notice>
    </div>
  );
}

/** Ventas convertidas del ejercicio: resumen compensado y desglose por posición, en euros. */
function SalesSection({ year, showFx }: { year: RealisedGainsYear; showFx: boolean }) {
  const t = useTranslations("portfolio.realisedGains");
  const { formatCurrency, formatQuantity } = useFormat();
  const eur = (value: number) => formatCurrency(value, TAX_CURRENCY);
  const signed = (value: number) => `${value > 0 ? "+" : ""}${eur(value)}`;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold text-foreground">{t("salesTitle")}</h2>

      <dl className={`grid grid-cols-1 gap-4 ${showFx ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted">{t("gains")}</dt>
          <dd className="text-lg font-semibold tabular-nums text-success">{eur(year.gains)}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted">{t("losses")}</dt>
          <dd className="text-lg font-semibold tabular-nums text-danger">{eur(year.losses)}</dd>
        </div>
        {showFx && (
          <div className="flex flex-col gap-1">
            <dt className="text-sm text-muted">{t("fxDifference")}</dt>
            <dd className={`text-lg font-semibold tabular-nums ${signColor(year.fxDifference)}`}>
              {signed(year.fxDifference)}
            </dd>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted">{t("net")}</dt>
          <dd className={`text-lg font-semibold tabular-nums ${signColor(year.total)}`}>{signed(year.total)}</dd>
        </div>
      </dl>

      {year.rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="px-3 pt-3 text-left text-xs text-muted">{t("tableCaption")}</caption>
            <thead>
              <tr className="border-b border-border text-muted">
                <th scope="col" className="px-3 py-2 font-medium">
                  {t("position")}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t("sales")}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t("quantity")}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t("transferValue")}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t("acquisitionValue")}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t("gain")}
                </th>
                {showFx && (
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {t("fxDifference")}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {year.rows.map((row) => (
                <tr key={row.positionId} className="border-b border-border last:border-0">
                  <th scope="row" className="px-3 py-2 font-normal">
                    <span className="font-medium text-foreground">{row.ticker}</span>
                    {row.currency !== TAX_CURRENCY && <span className="ml-1.5 text-xs text-muted">{row.currency}</span>}
                    {row.name && <span className="block text-xs text-muted">{row.name}</span>}
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">{row.sales}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">{formatQuantity(row.quantity)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">{eur(row.transferValue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">{eur(row.acquisitionValue)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${signColor(row.gain)}`}>{signed(row.gain)}</td>
                  {showFx && (
                    <td className={`px-3 py-2 text-right tabular-nums ${signColor(row.fxDifference)}`}>
                      {row.currency === TAX_CURRENCY ? "—" : signed(row.fxDifference)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
