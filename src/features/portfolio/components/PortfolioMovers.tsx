"use client";

import { useTranslations } from "next-intl";

import { dailyMovers } from "@sextante/core/portfolio/positions";
import { Link } from "@/i18n/navigation";
import { useFormat } from "@/shared/format/use-format";
import type { PriceInfo, Position } from "@sextante/core/portfolio/types";

type Props = {
  positions: Position[];
  prices: Record<string, PriceInfo>;
};

/** Posiciones que se nombran en la franja. */
const MOVERS = 3;

/**
 * Franja con las posiciones que más se han movido en la última sesión y el enlace a la lista
 * completa. Es la variación del precio respecto al cierre anterior (ver `dailyMovers`).
 */
export default function PortfolioMovers({ positions, prices }: Props) {
  const t = useTranslations("portfolio.movers");
  const { formatPercent } = useFormat();
  const movers = dailyMovers(positions, prices, MOVERS);
  const open = positions.filter((p) => p.quantity > 0 && !p.isDerivative).length;

  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface px-6 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      {movers.length > 0 ? (
        <p className="text-foreground">
          <span className="font-semibold">{t("title")}</span>{" "}
          {movers.map((move, index) => (
            <span key={move.id}>
              {index > 0 && <span className="text-muted"> · </span>}
              {move.name}{" "}
              <span className={move.changePct > 0 ? "text-success" : move.changePct < 0 ? "text-danger" : "text-muted"}>
                {move.changePct > 0 ? "+" : ""}
                {formatPercent(Math.round(move.changePct * 10) / 10)}
              </span>
            </span>
          ))}
        </p>
      ) : (
        <p className="text-muted">{t("none")}</p>
      )}
      <Link href="/portfolio/posiciones" className="shrink-0 font-medium text-brand underline-offset-2 hover:underline">
        {t("seeAll", { count: open })}
      </Link>
    </section>
  );
}
