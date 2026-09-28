"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import Notice from "@/components/ui/Notice";
import SelectField from "@/components/ui/SelectField";
import { UTF8_BOM } from "@/core/csv";
import { FISCAL_YEAR_LABEL } from "@/core/fiscal/brackets";
import {
  buildRealisedGainsReport,
  TAX_CURRENCY,
  type RealisedGainsCurrencyGroup,
} from "@/core/fiscal/realised-gains";
import { buildRealisedGainsCsv } from "@/core/fiscal/realised-gains-csv";
import { asLocale } from "@/core/types";
import { downloadBlob } from "@/lib/download";
import { useFormat } from "@/lib/format";
import type { Position, PositionLot } from "@/lib/portfolio";

type Props = {
  positions: Position[];
  /** Todas las operaciones del usuario (`GET /api/positions/lots`). */
  lots: PositionLot[];
};

/** Color del importe según su signo, con los tokens del tema. */
function signColor(value: number): string {
  return value > 0 ? "text-success" : value < 0 ? "text-danger" : "text-foreground";
}

/**
 * Informe anual de ganancias y pérdidas REALIZADAS: las ventas registradas en la cartera,
 * emparejadas por FIFO y compensadas dentro de cada ejercicio.
 *
 * El cálculo es `buildRealisedGainsReport` (core puro y testeado); aquí solo se elige el
 * ejercicio, se pinta y se exporta. Todo sale de los datos que ya se han cargado: no hay un
 * segundo cálculo en el servidor que pudiera dar otra cifra.
 */
export default function RealisedGainsReport({ positions, lots }: Props) {
  const t = useTranslations("portfolio.realisedGains");
  const locale = asLocale(useLocale());
  const { formatCurrency, formatPercent } = useFormat();

  const report = useMemo(() => {
    const byPosition = new Map<string, PositionLot[]>();
    for (const lot of lots) {
      const list = byPosition.get(lot.positionId) ?? [];
      list.push(lot);
      byPosition.set(lot.positionId, list);
    }
    return buildRealisedGainsReport(
      positions.map((p) => ({
        id: p.id,
        ticker: p.ticker,
        name: p.name,
        currency: p.currency,
        lots: byPosition.get(p.id) ?? [],
      })),
    );
  }, [positions, lots]);

  const [selected, setSelected] = useState<string>(() => String(report.years[0]?.year ?? ""));
  const [failed, setFailed] = useState(false);
  const year = report.years.find((y) => String(y.year) === selected) ?? report.years[0];

  if (!year) {
    return <Notice variant="info">{t("empty")}</Notice>;
  }

  const foreign = year.groups.filter((g) => g.currency !== TAX_CURRENCY).map((g) => g.currency);

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
            value={String(year.year)}
            onChange={setSelected}
            options={report.years.map((y) => ({ value: String(y.year), label: String(y.year) }))}
          />
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={handleDownload}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-surface-2"
          >
            {t("download", { year: year.year })}
          </button>
          {failed && <p className="text-xs text-warning">{t("downloadError")}</p>}
        </div>
      </div>

      {year.groups.map((group) => (
        <CurrencyGroup key={group.currency} group={group} />
      ))}

      {year.tax ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold text-foreground">{t("taxTitle", { year: year.year })}</h2>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <dt className="text-sm text-muted">{t("taxBase")}</dt>
              <dd className="text-lg font-semibold tabular-nums text-foreground">
                {formatCurrency(year.tax.base, TAX_CURRENCY)}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-sm text-muted">{t("tax")}</dt>
              <dd className="text-lg font-semibold tabular-nums text-foreground">
                {formatCurrency(year.tax.tax, TAX_CURRENCY)}
                {year.tax.effectiveRate !== null && (
                  <span className="ml-1.5 text-sm font-medium text-muted">
                    ({formatPercent(year.tax.effectiveRate)})
                  </span>
                )}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-sm text-muted">{t("marginal")}</dt>
              <dd className="text-lg font-semibold tabular-nums text-foreground">
                {formatPercent(year.tax.marginal)}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted">{t("taxScale", { scaleYear: FISCAL_YEAR_LABEL })}</p>
        </section>
      ) : (
        <Notice variant="info">{t("noEurSales")}</Notice>
      )}

      {foreign.length > 0 && (
        <Notice variant="warning">{t("foreignCurrency", { currencies: foreign.join(", ") })}</Notice>
      )}

      <Notice variant="info">{t("scope")}</Notice>
    </div>
  );
}

/** Ventas de un ejercicio en una divisa: resumen compensado y desglose por posición. */
function CurrencyGroup({ group }: { group: RealisedGainsCurrencyGroup }) {
  const t = useTranslations("portfolio.realisedGains");
  const { formatCurrency, formatQuantity } = useFormat();
  const { currency } = group;
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold text-foreground">{t("groupTitle", { currency })}</h2>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted">{t("gains")}</dt>
          <dd className="text-lg font-semibold tabular-nums text-success">
            {formatCurrency(group.gains, currency)}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted">{t("losses")}</dt>
          <dd className="text-lg font-semibold tabular-nums text-danger">
            {formatCurrency(group.losses, currency)}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted">{t("net")}</dt>
          <dd className={`text-lg font-semibold tabular-nums ${signColor(group.net)}`}>
            {group.net > 0 ? "+" : ""}
            {formatCurrency(group.net, currency)}
          </dd>
        </div>
      </dl>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <caption className="px-3 pt-3 text-left text-xs text-muted">
            {t("tableCaption", { currency })}
          </caption>
          <thead>
            <tr className="border-b border-border text-muted">
              <th scope="col" className="px-3 py-2 font-medium">{t("position")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("sales")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("quantity")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("transferValue")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("acquisitionValue")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("gain")}</th>
            </tr>
          </thead>
          <tbody>
            {group.rows.map((row) => (
              <tr key={row.positionId} className="border-b border-border last:border-0">
                <th scope="row" className="px-3 py-2 font-normal">
                  <span className="font-medium text-foreground">{row.ticker}</span>
                  {row.name && <span className="block text-xs text-muted">{row.name}</span>}
                </th>
                <td className="px-3 py-2 text-right tabular-nums text-foreground">{row.sales}</td>
                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                  {formatQuantity(row.quantity)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                  {formatCurrency(row.transferValue, currency)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                  {formatCurrency(row.acquisitionValue, currency)}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${signColor(row.gain)}`}>
                  {row.gain > 0 ? "+" : ""}
                  {formatCurrency(row.gain, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
