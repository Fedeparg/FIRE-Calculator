"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import BreakdownDonut from "@/components/charts/BreakdownDonut";
import { paletteColor } from "@/components/charts/palette";
import {
  BREAKDOWN_GROUPS,
  buildBreakdown,
  type BreakdownGroupBy,
} from "@sextante/core/portfolio-breakdown";
import type { PriceInfo, Position } from "@/lib/portfolio";

type Props = {
  positions: Position[];
  prices: Record<string, PriceInfo>;
  /** Tasas FX (USD por unidad de divisa) para llevar cada valor a la divisa elegida. */
  rates: Record<string, number>;
  /** Divisa elegida en el resumen. */
  display: string;
};

/**
 * Composición de la cartera por activo, bróker o divisa.
 *
 * Reparte el VALOR DE MERCADO (no el coste): lo que responde es a qué está expuesta hoy la
 * cartera. Las posiciones sin precio o con una divisa no convertible se excluyen del reparto y
 * se dicen aparte, en lugar de repartir un total incompleto como si fuera el bueno — el mismo
 * criterio que el resumen y la tabla.
 */
export default function PortfolioBreakdown({ positions, prices, rates, display }: Props) {
  const t = useTranslations("portfolio.breakdown");
  const [groupBy, setGroupBy] = useState<BreakdownGroupBy>("asset");

  const unknownBrokerLabel = t("noBroker");
  const breakdown = useMemo(
    () =>
      buildBreakdown({ positions, prices, rates, display, groupBy, unknownBrokerLabel }),
    [positions, prices, rates, display, groupBy, unknownBrokerLabel],
  );

  const slices = useMemo(
    () =>
      breakdown.slices.map((slice, index) => ({
        name: slice.label,
        value: slice.value,
        color: paletteColor(index),
      })),
    [breakdown.slices],
  );

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
        <div
          className="inline-flex rounded-lg border border-border p-0.5"
          role="group"
          aria-label={t("groupByLabel")}
        >
          {BREAKDOWN_GROUPS.map((group) => (
            <button
              key={group}
              type="button"
              onClick={() => setGroupBy(group)}
              aria-pressed={groupBy === group}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                groupBy === group ? "bg-brand text-brand-fg" : "text-muted hover:text-foreground"
              }`}
            >
              {t(`group.${group}`)}
            </button>
          ))}
        </div>
      </div>

      {slices.length === 0 ? (
        <p className="text-sm text-muted">{t("noData")}</p>
      ) : (
        <>
          <BreakdownDonut
            title={t(`chartTitle.${groupBy}`)}
            centerLabel={t("center")}
            data={slices}
            currency={display}
          />
          {breakdown.excluded > 0 && (
            <p className="text-xs text-muted">
              {t("excluded", { count: breakdown.excluded, total: positions.length })}
            </p>
          )}
        </>
      )}
    </section>
  );
}
