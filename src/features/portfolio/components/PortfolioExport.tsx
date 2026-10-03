"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { buildPortfolioCsv } from "@/features/portfolio/model/portfolio-csv";
import { UTF8_BOM } from "@/shared/format/csv";
import { asLocale } from "@/i18n/types";
import { downloadBlob } from "@/shared/format/download";
import type { PriceInfo, Position } from "@sextante/core/portfolio/types";

type Props = {
  positions: Position[];
  /** Last known price per ticker (from our DB). */
  prices: Record<string, PriceInfo>;
  /** USD per unit of each currency (USD = 1). */
  rates: Record<string, number>;
  /** Chosen currency: the valuation column uses it. */
  display: string;
};

/** Name of the downloaded file. Fixed: it identifies the source without exposing anything about the user. */
const FILE_NAME = "sextante-cartera.csv";

/**
 * Portfolio download as CSV. It is generated ENTIRELY on the client from the data already on
 * screen (positions, prices and rates): there is no new endpoint nor a second API read that could
 * return something different from what is being viewed.
 *
 * The text is built by `buildPortfolioCsv` (pure, tested core), which picks the dialect from the
 * locale so Excel opens it correctly. This component only translates the headers and triggers
 * the download (`downloadBlob`).
 */
export default function PortfolioExport({ positions, prices, rates, display }: Props) {
  const t = useTranslations("portfolio.export");
  const locale = asLocale(useLocale());
  const [failed, setFailed] = useState(false);

  function handleDownload() {
    setFailed(false);
    try {
      const csv = buildPortfolioCsv({
        positions,
        prices,
        rates,
        display,
        locale,
        // Headers are translated here: the core does not translate (same rule as elsewhere).
        headers: {
          ticker: t("headers.ticker"),
          name: t("headers.name"),
          quantity: t("headers.quantity"),
          avgPrice: t("headers.avgPrice"),
          currency: t("headers.currency"),
          broker: t("headers.broker"),
          lastPrice: t("headers.lastPrice"),
          priceCurrency: t("headers.priceCurrency"),
          priceDate: t("headers.priceDate"),
          marketValue: t("headers.marketValue", { currency: display }),
        },
      });
      // The BOM goes before the content: without it, Excel reads the file in its local code
      // page and mangles the accents.
      downloadBlob(new Blob([UTF8_BOM, csv], { type: "text/csv;charset=utf-8" }), FILE_NAME);
    } catch {
      // A failure here can only come from the browser (memory, blocked downloads): we warn
      // instead of leaving a button that seemingly does nothing.
      setFailed(true);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {failed && (
        <p role="alert" className="text-sm text-warning">
          {t("error")}
        </p>
      )}
      <button
        type="button"
        onClick={handleDownload}
        className="h-11 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-foreground transition hover:bg-surface-2"
      >
        {t("button")}
      </button>
    </div>
  );
}
