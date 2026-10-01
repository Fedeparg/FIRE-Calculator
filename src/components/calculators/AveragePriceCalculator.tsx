"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { computeAveragePrice } from "@sextante/core/calculators/promediar-acciones";
import { useFormat } from "@/lib/format";
import NumberField from "../ui/NumberField";
import Stat from "../ui/Stat";

type Row = { id: number; price: number; shares: number; commission: number };

let nextId = 0;
const makeRow = (price: number, shares: number, commission: number): Row => ({
  id: nextId++,
  price,
  shares,
  commission,
});

export default function AveragePriceCalculator() {
  const t = useTranslations("calc.promediar-acciones");
  const { formatEUR, formatEURCents, formatNumber, formatPercent } = useFormat();
  const [rows, setRows] = useState<Row[]>(() => [makeRow(10, 10, 5), makeRow(8, 15, 5)]);
  const [currentPrice, setCurrentPrice] = useState(12);

  const result = useMemo(() => computeAveragePrice({ purchases: rows, currentPrice }), [rows, currentPrice]);

  function updateRow(id: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, makeRow(0, 0, 0)]);
  }
  function removeRow(id: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  }

  return (
    <div className="grid gap-6">
      <div className="rounded-xl border border-border bg-surface p-4">
        <ul className="grid gap-3">
          {rows.map((row, i) => (
            <li key={row.id} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-3">
              {/*
                La etiqueta se escribe siempre (es el nombre accesible del
                campo) y a partir de la segunda fila se oculta visualmente:
                en pantalla la cabecera de la columna ya la muestra una vez.
              */}
              <NumberField
                label={t("price")}
                hideLabel={i > 0}
                value={row.price}
                onChange={(v) => updateRow(row.id, { price: v })}
                step={0.1}
              />
              <NumberField
                label={t("shares")}
                hideLabel={i > 0}
                value={row.shares}
                onChange={(v) => updateRow(row.id, { shares: v })}
                step={1}
              />
              <NumberField
                label={t("commission")}
                hideLabel={i > 0}
                value={row.commission}
                onChange={(v) => updateRow(row.id, { commission: v })}
                step={0.5}
              />
              <button
                type="button"
                aria-label={t("removeRow")}
                onClick={() => removeRow(row.id)}
                disabled={rows.length <= 1}
                className="grid h-10 w-10 place-items-center rounded-lg border border-border text-muted transition-colors hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={addRow}
          className="mt-4 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-brand transition-colors hover:bg-brand-soft"
        >
          + {t("addRow")}
        </button>

        <div className="mt-5 border-t border-border pt-4 sm:max-w-xs">
          <NumberField
            label={t("currentPrice")}
            value={currentPrice}
            onChange={setCurrentPrice}
            step={0.1}
            help={t("help.currentPrice")}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label={t("averagePrice")} value={formatEURCents(result.averagePrice)} highlight />
        <Stat label={t("breakEvenPrice")} value={formatEURCents(result.breakEvenPrice)} />
        <Stat label={t("totalShares")} value={formatNumber(result.totalShares)} />
        <Stat label={t("totalCost")} value={formatEUR(result.totalCost)} />
        <Stat label={t("totalCommission")} value={formatEUR(result.totalCommission)} />
        <Stat label={t("marketValue")} value={result.marketValue === null ? "—" : formatEUR(result.marketValue)} />
        <Stat
          label={t("unrealizedGain")}
          value={result.unrealizedGain === null ? "—" : formatEUR(result.unrealizedGain)}
        />
        <Stat label={t("returnPct")} value={result.returnPct === null ? "—" : formatPercent(result.returnPct)} />
      </div>
    </div>
  );
}
