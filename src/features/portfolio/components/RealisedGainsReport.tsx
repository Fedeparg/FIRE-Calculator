"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import Notice from "@/shared/ui/Notice";
import SelectField from "@/shared/ui/SelectField";
import { UTF8_BOM } from "@/shared/format/csv";
import type { ReferenceRates } from "@sextante/core/fiscal/fx-reference";
import { buildIncomeReport, type IncomeEvent } from "@sextante/core/fiscal/income";
import type { PendingNegative } from "@sextante/core/fiscal/savings-base";
import { buildSavingsReturns } from "@sextante/core/fiscal/savings-return";
import { taxBoxesFor } from "@sextante/core/fiscal/tax-boxes";
import type { AssetClass } from "@sextante/core/portfolio/types";
import {
  buildRealisedGainsReport,
  TAX_CURRENCY,
  type RealisedGainsPosition,
} from "@sextante/core/fiscal/realised-gains";
import { buildRealisedGainsCsv } from "@/features/portfolio/model/realised-gains-csv";
import { asLocale } from "@/i18n/types";
import { downloadBlob } from "@/shared/format/download";
import { useFormat } from "@/shared/format/use-format";
import { trackEvent } from "@/shared/analytics/track";
import Button from "@/shared/ui/Button";
import IncomeSection from "./IncomeSection";
import SalesBlocks from "./SalesBlocks";
import PendingBalancesForm from "./PendingBalancesForm";
import SavingsReturnSection from "./SavingsReturnSection";

type Props = {
  positions: RealisedGainsPosition[];
  /** Dividendos, intereses y recompensas. */
  income: IncomeEvent[];
  /** Saldos negativos pendientes de años que Sextante no calcula. */
  pendingBalances: PendingNegative[];
  /** Clase de activo de cada posición: decide el bloque de la declaración de sus ventas. */
  assetClasses: Record<string, AssetClass | null>;
  /** Tipos de referencia del BCE de las divisas con ventas. */
  rates: ReferenceRates;
  /** `false` si hacían falta tipos y no se pudieron cargar. */
  ratesLoaded: boolean;
};

/**
 * Informe anual de ganancias y pérdidas REALIZADAS: las ventas registradas en la cartera,
 * emparejadas por FIFO, pasadas a euros y compensadas dentro de cada ejercicio.
 *
 * El cálculo es `buildRealisedGainsReport` (core puro y testeado); aquí solo se elige el
 * ejercicio, se pinta y se exporta. Los tipos del BCE llegan ya cargados del servidor.
 */
export default function RealisedGainsReport({
  positions,
  income,
  pendingBalances,
  assetClasses,
  rates,
  ratesLoaded,
}: Props) {
  const t = useTranslations("portfolio.realisedGains");
  const locale = asLocale(useLocale());
  const { formatCurrency } = useFormat();

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
  // Se mide si el informe se usa (sin cifras): decide si merece la pena seguir invirtiendo en él.
  useEffect(() => trackEvent({ name: "tax-report-viewed" }), []);

  function changeYear(value: string) {
    setSelected(value);
    trackEvent({ name: "tax-report-year-changed" });
  }

  function handlePrint() {
    trackEvent({ name: "tax-report-exported", data: { format: "print" } });
    window.print();
  }
  const selectedYear = years.find((y) => String(y) === selected) ?? years[0];
  const year = report.years.find((y) => y.year === selectedYear);
  const incomeEvents = income.filter((event) => event.paidAt.startsWith(String(selectedYear)));
  const incomeSummary = incomeReport.years.find((y) => y.year === selectedYear);
  // Todos los ejercicios encadenados: los saldos negativos pasan de uno a otro (art. 49 LIRPF).
  const savingsReturns = useMemo(
    () =>
      buildSavingsReturns({
        gains: report.years,
        income: incomeReport.years,
        incomeEvents: income,
        rates,
        manualPending: pendingBalances,
      }),
    [report, incomeReport, income, rates, pendingBalances],
  );
  const savingsReturn = savingsReturns.find((r) => r.year === selectedYear);
  const boxes = taxBoxesFor(selectedYear);

  const hasForeign = year?.sales.some((sale) => sale.currency !== TAX_CURRENCY) ?? false;
  const eurFormat = (value: number) => formatCurrency(value, TAX_CURRENCY);

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
          deferredLossEur: t("csv.deferredLossEur"),
          integratedLossEur: t("csv.integratedLossEur"),
          computableGainEur: t("csv.computableGainEur"),
        },
        locale,
      );
      trackEvent({ name: "tax-report-exported", data: { format: "csv" } });
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
            onChange={changeYear}
            options={years.map((y) => ({ value: String(y), label: String(y) }))}
          />
        </div>
        {year && (
          <div className="flex flex-col items-end gap-1">
            <div className="flex flex-wrap gap-2 print:hidden">
              <Button variant="secondary" onClick={handlePrint}>
                {t("print")}
              </Button>
              <Button variant="secondary" onClick={handleDownload}>
                {t("download", { year: year.year })}
              </Button>
            </div>
            {failed && <p className="text-xs text-warning">{t("downloadError")}</p>}
          </div>
        )}
      </div>

      {!ratesLoaded && <Notice variant="warning">{t("ratesUnavailable")}</Notice>}

      {year ? (
        <SalesBlocks year={year} showFx={hasForeign} assetClasses={assetClasses} boxes={boxes} />
      ) : (
        <Notice variant="info">{t("noSalesThisYear")}</Notice>
      )}

      {year && year.unconverted.length > 0 && (
        <Notice variant="warning">
          {t("unconverted", {
            currencies: year.unconverted.map((u) => u.currency).join(", "),
            count: year.unconverted.reduce((sum, u) => sum + u.sales, 0),
          })}
        </Notice>
      )}
      {year && year.deferred < 0 && (
        <Notice variant="info">{t("deferred", { amount: eurFormat(-year.deferred) })}</Notice>
      )}
      {year && year.integrated < 0 && (
        <Notice variant="info">{t("integrated", { amount: eurFormat(-year.integrated) })}</Notice>
      )}
      {year && year.fxIncomplete > 0 && (
        <Notice variant="warning">{t("fxIncomplete", { count: year.fxIncomplete })}</Notice>
      )}
      {hasForeign && <Notice variant="info">{t("fxCriterion")}</Notice>}

      <IncomeSection year={selectedYear} boxes={boxes} summary={incomeSummary} events={incomeEvents} />

      {savingsReturn && <SavingsReturnSection result={savingsReturn} boxes={boxes} />}

      <PendingBalancesForm balances={pendingBalances} firstYear={years[years.length - 1]} />

      <Notice variant="info">{t("scope")}</Notice>
    </div>
  );
}
