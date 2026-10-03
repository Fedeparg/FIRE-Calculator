"use client";

import { useTranslations } from "next-intl";

import { TAX_CURRENCY } from "@sextante/core/fiscal/fx-reference";
import type { RealisedGainsRow } from "@sextante/core/fiscal/realised-gains";
import CopyValue from "@/shared/ui/CopyValue";

// Piezas de una fila de venta que comparten la tabla y la tarjeta de `SalesBlocks`.

/**
 * Denominación del valor primero (es lo que pide Renta WEB, casilla de entidad emisora en
 * acciones), con su botón de copiar; debajo, el símbolo o ISIN y la divisa.
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
 * Pérdidas que la regla de los dos meses deja sin computar (o integra) en esta entidad: Renta WEB
 * separa el importe obtenido del computable, así que hay que verlas valor a valor.
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
