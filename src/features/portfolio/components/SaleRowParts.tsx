"use client";

import { useTranslations } from "next-intl";

import { TAX_CURRENCY } from "@sextante/core/fiscal/fx-reference";
import type { RealisedGainsRow } from "@sextante/core/fiscal/realised-gains";
import CopyValue from "@/shared/ui/CopyValue";

// Pieces of a sale row shared by the table and the card in `SalesBlocks`.

/**
 * Security name first (it is what Renta WEB asks for: the issuer box for shares), with its copy
 * button; below it, the symbol or ISIN and the currency.
 */
export function EntityName({ row, entityBox }: { row: RealisedGainsRow; entityBox: string | undefined }) {
  const t = useTranslations("portfolio.realisedGains");
  const name = row.name ?? row.ticker;
  return (
    <>
      <span className="font-medium text-foreground">{name}</span>
      <CopyValue value={name} label={entityBox ? t("box", { box: entityBox }) : name} />
      <span className="block text-xs text-muted">
        {row.name ? row.ticker : null}
        {row.currency !== TAX_CURRENCY && `${row.name ? " · " : ""}${row.currency}`}
        {entityBox && ` · ${t("box", { box: entityBox })}`}
      </span>
    </>
  );
}

/**
 * Losses that the two-month rule leaves uncomputed (or brings back) for this issuer: Renta WEB
 * separates the amount obtained from the computable one, so they must be seen security by security.
 */
export function WashSaleNote({ row, eur }: { row: RealisedGainsRow; eur: (value: number) => string }) {
  const t = useTranslations("portfolio.realisedGains");
  if (row.deferredLoss >= 0 && row.integratedLoss >= 0) return null;
  return (
    <span className="block text-xs text-warning">
      {row.deferredLoss < 0 && t("rowDeferred", { amount: eur(-row.deferredLoss) })}
      {row.deferredLoss < 0 && row.integratedLoss < 0 && " · "}
      {row.integratedLoss < 0 && t("rowIntegrated", { amount: eur(-row.integratedLoss) })}
    </span>
  );
}
