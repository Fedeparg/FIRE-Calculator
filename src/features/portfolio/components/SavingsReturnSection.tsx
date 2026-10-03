"use client";

import { useTranslations } from "next-intl";

import { FISCAL_YEAR_LABEL } from "@sextante/core/fiscal/brackets";
import { TAX_CURRENCY } from "@sextante/core/fiscal/fx-reference";
import type { SavingsReturn } from "@sextante/core/fiscal/savings-return";
import type { TaxBoxes } from "@sextante/core/fiscal/tax-boxes";
import CopyValue from "@/shared/ui/CopyValue";
import { useFormat } from "@/shared/format/use-format";
import Notice from "@/shared/ui/Notice";

/**
 * Por debajo de 5 céntimos, un exceso de retención es ruido de redondeo: el bróker redondea cada
 * dividendo a céntimos y la suma de esos restos no es dinero que reclamar.
 */
const MIN_EXCESS = 0.05;

/**
 * La base del ahorro del ejercicio de principio a fin: saldos, compensación, cuota, deducción por
 * doble imposición internacional y retenciones españolas. El cálculo es `buildSavingsReturn`.
 */
export default function SavingsReturnSection({ result, boxes }: { result: SavingsReturn; boxes: TaxBoxes | null }) {
  const t = useTranslations("portfolio.savingsReturn");
  const { formatCurrency, formatPercent } = useFormat();
  const eur = (value: number) => formatCurrency(value, TAX_CURRENCY);
  const compensated = result.savingsBase.totalCompensated;
  const excess = result.doubleTaxation.warnings.filter(
    (w) => w.code === "excess_withholding" && w.amount >= MIN_EXCESS,
  );
  const noTreaty = result.doubleTaxation.warnings.filter((w) => w.code === "no_treaty_rate");

  const rows: { label: string; value: string; strong?: boolean; box?: string; copy?: number }[] = [
    { label: t("gainsBalance"), value: eur(result.gainsBalance) },
    { label: t("capitalIncome"), value: eur(result.capitalIncomeBalance) },
    ...(compensated > 0 ? [{ label: t("compensated"), value: eur(-compensated) }] : []),
    { label: t("base"), value: eur(result.savingsBase.base), strong: true },
    {
      label: t("tax"),
      value:
        result.tax.averageRatePct === null
          ? eur(result.tax.tax)
          : `${eur(result.tax.tax)} (${formatPercent(result.tax.averageRatePct)})`,
    },
    ...(result.doubleTaxation.deduction > 0
      ? [
          {
            label: t("doubleTaxation"),
            value: eur(-result.doubleTaxation.deduction),
            box: boxes?.doubleTaxation,
            copy: result.doubleTaxation.deduction,
          },
        ]
      : []),
    { label: t("netTax"), value: eur(result.netTax), strong: true },
    ...(result.withholdingSpain > 0 ? [{ label: t("withholdingSpain"), value: eur(-result.withholdingSpain) }] : []),
    { label: t(result.result >= 0 ? "resultPay" : "resultRefund"), value: eur(Math.abs(result.result)), strong: true },
  ];

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">{t("title", { year: result.year })}</h2>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </div>

      <dl className="flex flex-col">
        {rows.map((row) => (
          <div
            key={row.label}
            className={`flex items-baseline justify-between gap-4 border-b border-border py-2 text-sm last:border-0 ${
              row.strong ? "font-semibold text-foreground" : "text-muted"
            }`}
          >
            <dt>
              {row.label}
              {row.box && <span className="ml-2 text-xs font-normal">{t("box", { box: row.box })}</span>}
            </dt>
            <dd className="tabular-nums text-foreground">
              {row.value}
              {row.copy !== undefined && <CopyValue value={row.copy.toFixed(2).replace(".", ",")} label={row.label} />}
            </dd>
          </div>
        ))}
      </dl>

      {result.savingsBase.pending.length > 0 && (
        <p className="text-sm text-muted">
          {t("pendingAfter", { amount: eur(result.savingsBase.pending.reduce((sum, p) => sum + p.amount, 0)) })}
        </p>
      )}
      {result.incomplete && <Notice variant="warning">{t("incomplete")}</Notice>}
      {excess.map((w) => (
        <Notice key={`excess-${w.country}`} variant="info">
          {t("excessWithholding", { country: w.country, amount: eur(w.amount) })}
        </Notice>
      ))}
      {noTreaty.map((w) => (
        <Notice key={`treaty-${w.country}`} variant="warning">
          {t("noTreatyRate", { country: w.country, amount: eur(w.amount) })}
        </Notice>
      ))}
      <p className="text-xs text-muted">{t("note", { scaleYear: FISCAL_YEAR_LABEL })}</p>
    </section>
  );
}
