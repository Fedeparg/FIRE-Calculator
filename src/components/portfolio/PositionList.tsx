"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { convertCurrency } from "@/core/fx";
import { formatCurrency, formatIsoDate, formatNumber, formatPercent } from "@/core/format";
import type { PriceInfo, Position } from "@/lib/portfolio";

type Props = {
  positions: Position[];
  /** Último precio conocido por ticker (desde nuestra DB). Vacío mientras carga o sin datos. */
  prices: Record<string, PriceInfo>;
  /** Tasas FX (USD por unidad de cada divisa) para convertir el valor a la divisa de la fila. */
  rates: Record<string, number>;
  /** Id de la posición que se está editando (resaltada), o null. */
  editingId: string | null;
  onEdit: (position: Position) => void;
  onDeleted: (id: string) => void;
};

/** Cómo se muestra el P&L: porcentaje o importe en la divisa de la posición. */
type PnlMode = "pct" | "abs";

/**
 * Tabla de posiciones con editar y borrado inline (confirmación sin modal). Enriquece cada
 * fila con el último precio de mercado (desde nuestra DB) para mostrar valor actual y P&L.
 *
 * Regla de divisa: el valor de mercado se CONVIERTE a la divisa de la posición con las tasas
 * FX diarias (el precio puede venir en otra divisa, p. ej. un activo en USD comprado en EUR).
 * El P&L = valor − invertido, ambos ya en la divisa de la posición. Solo se marca "—" si no
 * hay precio o si falta la tasa de cambio necesaria.
 */
export default function PositionList({
  positions,
  prices,
  rates,
  editingId,
  onEdit,
  onDeleted,
}: Props) {
  const t = useTranslations("portfolio.list");
  // id en confirmación de borrado / id en proceso de borrado.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pnlMode, setPnlMode] = useState<PnlMode>("pct");

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/positions/${id}`, { method: "DELETE" });
      if (res.ok) {
        onDeleted(id);
      }
    } finally {
      setDeletingId(null);
      setConfirmingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end gap-2 text-xs">
        <span className="text-muted">{t("pnlMode")}</span>
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {(["pct", "abs"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setPnlMode(mode)}
              aria-pressed={pnlMode === mode}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                pnlMode === mode
                  ? "bg-brand text-brand-fg"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {mode === "pct" ? t("pnlModePct") : t("pnlModeAbs")}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[52rem] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              <th scope="col" className="px-4 py-3 font-medium">
                {t("ticker")}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t("name")}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {t("quantity")}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {t("avgPrice")}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t("broker")}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {t("invested")}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {t("marketValue")}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {t("pnl")}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                <span className="sr-only">{t("actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => {
              const invested = p.quantity * p.avgPrice;
              const price = prices[p.ticker];
              // Valor de mercado convertido a la divisa de la posición (el precio puede venir
              // en otra divisa). `null` si no hay precio o falta la tasa de cambio.
              const marketValue =
                price !== undefined
                  ? convertCurrency(p.quantity * price.close, price.currency, p.currency, rates)
                  : null;
              const pnlAbs = marketValue !== null ? marketValue - invested : null;
              const pnlPct =
                pnlAbs !== null && invested > 0 ? (pnlAbs / invested) * 100 : null;
              // Motivo de un valor no calculable (para el tooltip del "—").
              const missingReason =
                price === undefined
                  ? t("noPrice")
                  : marketValue === null
                    ? t("noFxRate", { price: price.currency, position: p.currency })
                    : "";

              const isConfirming = confirmingId === p.id;
              const isDeleting = deletingId === p.id;
              const isEditing = editingId === p.id;
              return (
                <tr
                  key={p.id}
                  className={`border-b border-border last:border-0 ${
                    isEditing ? "bg-surface-2" : ""
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-foreground">{p.ticker}</td>
                  <td className="px-4 py-3 text-muted">
                    <div className="max-w-[16rem] truncate" title={p.name ?? undefined}>
                      {p.name ?? "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatNumber(p.quantity)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatCurrency(p.avgPrice, p.currency)}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    <div className="max-w-[9rem] truncate" title={p.broker ?? undefined}>
                      {p.broker ?? "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatCurrency(invested, p.currency)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {marketValue !== null ? (
                      <span title={t("priceAsOf", { date: formatIsoDate(price!.date) })}>
                        {formatCurrency(marketValue, p.currency)}
                      </span>
                    ) : (
                      <span className="text-muted" title={missingReason}>
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {pnlAbs !== null ? (
                      <span
                        className={
                          pnlAbs > 0 ? "text-success" : pnlAbs < 0 ? "text-danger" : "text-muted"
                        }
                      >
                        {pnlAbs > 0 ? "+" : ""}
                        {pnlMode === "pct"
                          ? formatPercent(pnlPct!)
                          : formatCurrency(pnlAbs, p.currency)}
                      </span>
                    ) : (
                      <span className="text-muted" title={missingReason}>
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isConfirming ? (
                      <span className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id)}
                          disabled={isDeleting}
                          className="rounded-md bg-warning px-2.5 py-1 text-xs font-medium text-brand-fg transition hover:opacity-90 disabled:opacity-50"
                        >
                          {isDeleting ? t("deleting") : t("confirm")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingId(null)}
                          disabled={isDeleting}
                          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-50"
                        >
                          {t("cancel")}
                        </button>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onEdit(p)}
                          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-foreground"
                        >
                          {t("edit")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingId(p.id)}
                          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-foreground"
                        >
                          {t("delete")}
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
