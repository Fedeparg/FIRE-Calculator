"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import TimeSeriesChart from "@/components/charts/TimeSeriesChart";
import Notice from "@/components/ui/Notice";
import { formatIsoDate } from "@/core/format";
import {
  buildHistorySeries,
  DEFAULT_HISTORY_RANGE,
  HISTORY_RANGES,
  type HistoryRangeKey,
  type PortfolioHistoryDto,
} from "@/core/portfolio-history";
import { useFormat } from "@/lib/format";

type Props = {
  /** Divisa elegida en el resumen: la serie se pide ya reexpresada a ella. */
  display: string;
};

type Status = "loading" | "ready" | "error";

/** Resultado de una petición concreta, etiquetado con la clave que la originó. */
type Result = { key: string; history: PortfolioHistoryDto | null };

/**
 * Evolución diaria de la cartera.
 *
 * La serie NO se calcula aquí: la sirve `GET /api/portfolio/history`, que guarda un punto por
 * día EN EUROS junto con las tasas FX de ese día y lo reexpresa a la divisa pedida usando las
 * tasas de ENTONCES. Por eso cambiar de divisa vuelve a pedir la serie en lugar de convertir
 * el resultado: convertir aquí con las tasas de hoy contaría como ganancia una variación del
 * tipo de cambio que no ocurrió.
 *
 * Cuando todavía no hay dos puntos —una cuenta recién creada no tiene ninguno hasta la captura
 * de esta noche— no se dibuja una gráfica vacía: se explica que la serie se construye a
 * diario, que es información útil, a diferencia de un lienzo en blanco.
 */
export default function PortfolioHistoryChart({ display }: Props) {
  const t = useTranslations("portfolio.history");
  const { formatCurrency, formatPercent } = useFormat();
  const [range, setRange] = useState<HistoryRangeKey>(DEFAULT_HISTORY_RANGE);
  const [result, setResult] = useState<Result | null>(null);

  const days = HISTORY_RANGES.find((r) => r.key === range)?.days ?? 365;
  // Identifica la petición vigente. "Cargando" se DERIVA de comparar esta clave con la del
  // último resultado, en vez de guardarse en un estado que habría que resetear desde el
  // efecto (lo que provocaría un render en cascada).
  const requestKey = `${days}|${display}`;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(
          `/api/portfolio/history?days=${days}&display=${encodeURIComponent(display)}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as PortfolioHistoryDto;
        if (!cancelled) setResult({ key: requestKey, history: data });
      } catch {
        if (!cancelled) setResult({ key: requestKey, history: null });
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [days, display, requestKey]);

  const history = result?.key === requestKey ? result.history : null;
  const status: Status =
    result?.key !== requestKey ? "loading" : history === null ? "error" : "ready";

  const series = useMemo(() => buildHistorySeries(history?.points ?? []), [history]);

  const changeColor =
    series.changeAbs === null || series.changeAbs === 0
      ? "text-foreground"
      : series.changeAbs > 0
        ? "text-success"
        : "text-danger";

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
        <div className="inline-flex rounded-lg border border-border p-0.5" role="group" aria-label={t("rangeLabel")}>
          {HISTORY_RANGES.map(({ key }) => (
            <button
              key={key}
              type="button"
              onClick={() => setRange(key)}
              aria-pressed={range === key}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                range === key ? "bg-brand text-brand-fg" : "text-muted hover:text-foreground"
              }`}
            >
              {t(`range.${key}`)}
            </button>
          ))}
        </div>
      </div>

      {status === "loading" && <p className="text-sm text-muted">{t("loading")}</p>}

      {status === "error" && <p className="text-sm text-warning">{t("error")}</p>}

      {status === "ready" && series.insufficient && (
        <Notice variant="info">
          {series.points.length === 0 ? t("emptyBody") : t("singlePointBody")}
        </Notice>
      )}

      {status === "ready" && !series.insufficient && (
        <>
          {series.changeAbs !== null && series.from && series.to && (
            <p className="text-sm text-muted">
              {t("since", { from: formatIsoDate(series.from), to: formatIsoDate(series.to) })}{" "}
              <span className={`font-semibold tabular-nums ${changeColor}`}>
                {series.changeAbs > 0 ? "+" : ""}
                {formatCurrency(series.changeAbs, display)}
                {series.changePct !== null && (
                  <span className="ml-1 font-medium">
                    ({series.changeAbs > 0 ? "+" : ""}
                    {formatPercent(series.changePct)})
                  </span>
                )}
              </span>
            </p>
          )}

          <TimeSeriesChart
            title={t("chartTitle")}
            data={series.points}
            xKey="date"
            valueKey="marketValue"
            // El valor de mercado va como área (una sola serie: no hay nada que apilar) y el
            // coste como línea de referencia punteada, que es justo lo que es.
            stack={[{ key: "marketValue", name: t("marketValue"), color: "var(--brand)" }]}
            lines={[{ key: "invested", name: t("invested"), color: "var(--accent)" }]}
            labels={{ axisX: t("date") }}
            currency={display}
            xFormat={(value) => formatIsoDate(String(value))}
            // El eje X es una fecha, no una magnitud continua: seleccionar un tramo por
            // arrastre no tendría sentido, y el total del tooltip duplicaría la única serie.
            selectable={false}
            showTotal={false}
            xMinTickGap={48}
            xInterval="preserveStartEnd"
          />

          {series.dropped > 0 && <p className="text-xs text-muted">{t("dropped", { count: series.dropped })}</p>}
          <p className="text-xs text-muted">{t("cadence")}</p>
        </>
      )}
    </section>
  );
}
