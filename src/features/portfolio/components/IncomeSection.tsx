"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { TAX_CURRENCY } from "@sextante/core/fiscal/fx-reference";
import type { TaxBoxes } from "@sextante/core/fiscal/tax-boxes";
import CopyValue from "@/shared/ui/CopyValue";
import type { IncomeCategoryReport, IncomeEvent, IncomeYear } from "@sextante/core/fiscal/income";
import { useFormat } from "@/shared/format/use-format";
import Notice from "@/shared/ui/Notice";
import { formatTaxBox } from "@sextante/core/money";
import { useIncomeMutations } from "@/features/portfolio/use-income-mutations";
import IncomeManager from "./IncomeManager";

type Props = {
  year: number;
  /** Boxes (casillas) for the tax year, or `null` if they are not verified. */
  boxes: TaxBoxes | null;
  /** Tax-year summary, or `undefined` if it has no income. */
  summary: IncomeYear | undefined;
  /** Income for the tax year, in its currency. */
  events: readonly IncomeEvent[];
};

/**
 * Investment income (rendimientos del capital mobiliario) for the tax year: interest (including
 * broker rewards) and dividends, separating what the payer already reported to the AEAT (it shows
 * up in the draft return) from what must be added by hand. Data comes from the server; the page
 * is refreshed after every change.
 */
export default function IncomeSection({ year, boxes, summary, events }: Props) {
  const t = useTranslations("portfolio.income");
  const router = useRouter();
  // The refresh runs in a transition: while the new server data arrives the form keeps
  // "saving", instead of showing the result with stale data and jumping afterwards.
  const [refreshing, startTransition] = useTransition();
  const mutations = useIncomeMutations(() => startTransition(() => router.refresh()));

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
            submitting={mutations.submitting || refreshing}
            errorKey={mutations.errorKey}
            save={mutations.save}
            remove={mutations.remove}
          />
        </div>
      </details>
    </section>
  );
}

/** A tax-return grouping with its breakdown. */
function CategoryCard({
  title,
  category,
  grossBox,
  withholdingBox,
}: {
  title: string;
  category: IncomeCategoryReport;
  /** Box for the gross amount and for the Spanish withholdings (the latter summed across categories). */
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
          <CopyValue value={formatTaxBox(category.total.gross)} label={`${title} ${t("gross")}`} />
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
