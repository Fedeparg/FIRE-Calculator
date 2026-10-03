"use client";

import { useTranslations } from "next-intl";

import type { ImportResult } from "@sextante/core/imports/types";
import { Link } from "@/i18n/navigation";
import { useFormat } from "@/shared/format/use-format";
import Notice from "@/shared/ui/Notice";
import ImportNotices from "./ImportNotices";

/** Result of a confirmed import: which positions were created, topped up or failed. */
export default function ImportResultView({ result }: { result: ImportResult }) {
  const t = useTranslations("portfolio.import.result");
  const { formatQuantity } = useFormat();
  return (
    <section
      aria-labelledby="import-result-title"
      className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6"
    >
      <h2 id="import-result-title" className="text-lg font-semibold text-foreground">
        {t("title")}
      </h2>
      <p className="text-sm text-foreground">
        {t("summary", { count: result.totals.lotsCreated, duplicates: result.totals.duplicates })}
      </p>
      {result.income.created + result.income.duplicates > 0 && (
        <p className="text-sm text-foreground">
          {t("incomeSummary", { count: result.income.created, duplicates: result.income.duplicates })}
        </p>
      )}
      {result.totals.failedPositions > 0 && (
        <Notice>{t("failedNote", { count: result.totals.failedPositions })}</Notice>
      )}

      <ul className="divide-y divide-border rounded-lg border border-border text-sm">
        {result.positions.map((p) => (
          <li key={p.isin} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
            <span>
              <span className="block text-foreground">{p.name || p.isin}</span>
              <span className="block text-xs text-muted">{p.isin}</span>
              {p.failure && <span className="block text-xs text-warning">{t(`failure.${p.failure}`)}</span>}
            </span>
            <span className="text-right text-muted">
              {t(`status.${p.status}`)}
              {p.quantity !== null && ` · ${formatQuantity(p.quantity)}`}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-sm text-muted">{t("pricesNote")}</p>
      <ImportNotices plan={result} />

      <div>
        {/* To Positions, not to Summary: that is where the freshly imported ones show up while fetching prices. */}
        <Link
          href="/portfolio/posiciones"
          className="inline-block rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg transition hover:opacity-90"
        >
          {t("viewPortfolio")}
        </Link>
      </div>
    </section>
  );
}
