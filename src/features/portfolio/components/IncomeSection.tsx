"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { TAX_CURRENCY } from "@sextante/core/fiscal/fx-reference";
import type { TaxBoxes } from "@sextante/core/fiscal/tax-boxes";
import CopyValue from "@/shared/ui/CopyValue";
import type { IncomeCategoryReport, IncomeEvent, IncomeYear } from "@sextante/core/fiscal/income";
import { useFormat } from "@/shared/format/use-format";
import Notice from "@/shared/ui/Notice";
import { useIncomeMutations } from "../use-income";
import IncomeManager from "./IncomeManager";

/** Importe como se escribe en Renta WEB: coma decimal, sin separador de miles. */
const boxValue = (value: number) => value.toFixed(2).replace(".", ",");

type Props = {
  year: number;
  /** Casillas del ejercicio, o `null` si no están verificadas. */
  boxes: TaxBoxes | null;
  /** Resumen del ejercicio, o `undefined` si no tiene cobros. */
  summary: IncomeYear | undefined;
  /** Cobros del ejercicio, en su divisa. */
  events: readonly IncomeEvent[];
};

/**
 * Rendimientos del capital mobiliario del ejercicio: intereses (con las recompensas del bróker)
 * y dividendos, separando lo que el pagador ya comunicó a la AEAT (sale en el borrador) de lo que
 * hay que añadir a mano. Los datos llegan del servidor; tras cada cambio se refresca la página.
 */
export default function IncomeSection({ year, boxes, summary, events }: Props) {
  const t = useTranslations("portfolio.income");
  const router = useRouter();
  const mutations = useIncomeMutations(() => router.refresh());

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">{t("sectionTitle", { year })}</h2>
        <p className="text-sm text-muted">{t("sectionSubtitle")}</p>
      </div>

      {summary ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CategoryCard
            title={t("categoryInterest")}
            category={summary.interest}
            grossBox={boxes?.interest}
            withholdingBox={boxes?.capitalWithholding}
          />
          <CategoryCard
            title={t("categoryDividend")}
            category={summary.dividend}
            grossBox={boxes?.dividends}
            withholdingBox={boxes?.capitalWithholding}
          />
        </div>
      ) : (
        <p className="text-sm text-muted">{t("noneThisYear")}</p>
      )}

      {summary && summary.unconverted.length > 0 && (
        <Notice variant="warning">
          {t("unconverted", {
            currencies: summary.unconverted.map((u) => u.currency).join(", "),
            count: summary.unconverted.reduce((sum, u) => sum + u.events, 0),
          })}
        </Notice>
      )}
      {summary && summary.originUnknown > 0 && (
        <Notice variant="warning">{t("originUnknown", { count: summary.originUnknown })}</Notice>
      )}
      {summary && summary.originEstimated > 0 && (
        <Notice variant="warning">{t("originEstimated", { count: summary.originEstimated })}</Notice>
      )}

      <details className="group rounded-xl border border-border">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground">
          {t("manageTitle", { count: events.length })}
        </summary>
        <div className="border-t border-border p-4">
          <IncomeManager
            income={events}
            defaults={{ kind: "interest", positionId: null, isin: null, name: null, country: null, currency: "EUR" }}
            submitting={mutations.submitting}
            errorKey={mutations.errorKey}
            save={mutations.save}
            remove={mutations.remove}
          />
        </div>
      </details>
    </section>
  );
}

/** Una agrupación de la declaración con su desglose. */
function CategoryCard({
  title,
  category,
  grossBox,
  withholdingBox,
}: {
  title: string;
  category: IncomeCategoryReport;
  /** Casilla del íntegro y de las retenciones españolas (estas, sumadas entre categorías). */
  grossBox: string | undefined;
  withholdingBox: string | undefined;
}) {
  const t = useTranslations("portfolio.income");
  const { formatCurrency } = useFormat();
  const eur = (value: number) => formatCurrency(value, TAX_CURRENCY);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <h3 className="text-sm font-semibold text-foreground">
        {title}
        {grossBox && <span className="ml-2 text-xs font-normal text-muted">{t("box", { box: grossBox })}</span>}
      </h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted">{t("gross")}</dt>
        <dd className="text-right font-semibold tabular-nums text-foreground">
          {eur(category.total.gross)}
          <CopyValue value={boxValue(category.total.gross)} label={`${title} ${t("gross")}`} />
        </dd>
        <dt className="text-muted">{t("withholdingOrigin")}</dt>
        <dd className="text-right tabular-nums text-foreground">{eur(category.total.withholdingOrigin)}</dd>
        <dt className="text-muted">
          {t("withholdingSpain")}
          {withholdingBox && <span className="block text-xs">{t("box", { box: withholdingBox })}</span>}
        </dt>
        <dd className="text-right tabular-nums text-foreground">{eur(category.total.withholdingSpain)}</dd>
      </dl>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border pt-3 text-xs">
        <dt className="text-muted">{t("reported", { count: category.reported.events })}</dt>
        <dd className="text-right tabular-nums text-foreground">{eur(category.reported.gross)}</dd>
        <dt className="text-muted">{t("pending", { count: category.pending.events })}</dt>
        <dd className="text-right font-semibold tabular-nums text-foreground">{eur(category.pending.gross)}</dd>
      </dl>
    </div>
  );
}
