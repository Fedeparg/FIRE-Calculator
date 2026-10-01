"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import TimeSeriesChart, { type DataRow } from "@/components/charts/TimeSeriesChart";
import type { ChartTableColumn } from "@/components/charts/ChartDataTable";
import Notice from "@/components/ui/Notice";
import { formatIsoDate } from "@/core/format";
import {
  buildHistorySeries,
  withLivePoint,
  DEFAULT_HISTORY_RANGE,
  HISTORY_RANGES,
  type HistoryRangeKey,
  type PortfolioHistoryDto,
} from "@/core/portfolio-history";
import { useFormat } from "@/lib/format";
import { usePortfolioData } from "./PortfolioDataProvider";

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
        const res = await fetch(`/api/portfolio/history?days=${days}&display=${encodeURIComponent(display)}`, {
          cache: "no-store",
        });
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
  const status: Status = result?.key !== requestKey ? "loading" : history === null ? "error" : "ready";

  // El snapshot de hoy se escribe de noche: la valoración en vivo (la misma del Resumen) cierra
  // la serie en el día de hoy para que la gráfica no se quede en ayer.
  const { agg } = usePortfolioData();
  const series = useMemo(() => {
    const live =
      agg.display === display
        ? {
            date: new Date().toISOString().slice(0, 10),
            marketValue: agg.marketValue,
            invested: agg.invested,
            pnlAbs: agg.pnlAbs,
            pnlPct: agg.pnlPct,
            valuedPositions: agg.valued,
            totalPositions: agg.total,
          }
        : null;
    return buildHistorySeries(withLivePoint(history?.points ?? [], live));
  }, [history, agg, display]);

  const estimatedColumn: ChartTableColumn<DataRow> = {
    label: t("estimatedColumn"),
    value: (row) => (row.estimated ? t("estimatedYes") : t("estimatedNo")),
  };

  // Último valor de la serie: en el móvil sustituye al eje Y como referencia de escala.
  const lastPoint = series.points.at(-1);
  const lastValue = typeof lastPoint?.marketValue === "number" ? lastPoint.marketValue : null;

  const changeColor =
    series.changeAbs === null || series.changeAbs === 0
      ? "text-foreground"
      : series.changeAbs > 0
        ? "text-success"
        : "text-danger";

  return (
    // `min-w-0` + `overflow-hidden`: la caja no puede ser más ancha que su columna, pase lo que
    // pase dentro (en un iPhone real la gráfica llegó a sacarla de la pantalla).
    <section className="flex min-w-0 flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-surface p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">{t("title")}</h2>
        {/* Desplegable nativo: ocupa poco, y en el móvil abre el selector del sistema. */}
        <select
          aria-label={t("rangeLabel")}
          value={range}
          onChange={(event) => {
            const next = HISTORY_RANGES.find(({ key }) => key === event.target.value);
            if (next) setRange(next.key);
          }}
          className="min-h-9 rounded-lg border border-border bg-surface px-2.5 py-1 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
        >
          {HISTORY_RANGES.map(({ key }) => (
            <option key={key} value={key}>
              {t(`range.${key}`)}
            </option>
          ))}
        </select>
      </div>

      {status === "loading" && <p className="text-sm text-muted">{t("loading")}</p>}

      {status === "error" && <p className="text-sm text-warning">{t("error")}</p>}

      {status === "ready" && series.insufficient && (
        <Notice variant="info">{series.points.length === 0 ? t("emptyBody") : t("singlePointBody")}</Notice>
      )}

      {status === "ready" && !series.insufficient && (
        <>
          {/* La variación del periodo, en una sola línea: el importe manda y el rango de fechas
              acompaña. */}
          {lastValue !== null && (
            <p className="text-2xl font-semibold tabular-nums text-foreground">{formatCurrency(lastValue, display)}</p>
          )}
          {series.changeAbs !== null && series.from && series.to && (
            <p className="-mt-3 flex flex-wrap items-baseline gap-x-2 text-sm">
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
              <span className="text-xs text-muted">
                {t("since", { from: formatIsoDate(series.from), to: formatIsoDate(series.to) })}
              </span>
            </p>
          )}

          <TimeSeriesChart
            title={t("chartTitle")}
            // El título del bloque ya dice de qué va esto: el de la gráfica queda solo para
            // lectores de pantalla y para la tabla accesible.
            hideTitle
            // La leyenda propia (abajo) explica cada serie; la de Recharts solo repetiría el nombre.
            showLegend={false}
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
            shadedRanges={series.estimatedRanges.map((range) => ({
              from: range.from,
              to: range.to,
              label: t("estimatedShadeLabel"),
            }))}
            extraColumns={[estimatedColumn]}
            // Un valor base alto con poca variación se aplana pegado al 0: se ajusta el eje
            // al rango real de la cartera en vez de forzar el suelo en cero.
            yDomain="fit"
            // En el móvil, sin eje Y: el valor y la variación van encima, y el tooltip da cada día.
            yAxis="fromSm"
          />

          {series.estimatedRanges.length > 0 && (
            <p className="flex items-center gap-2 text-xs text-muted">
              {/* Misma tinta que la zona sombreada de la gráfica (`--warning` al 10 %). */}
              <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-sm border border-border bg-warning/10" />
              {t("estimatedNotice")}
            </p>
          )}
          <ul className="flex flex-col gap-1 text-xs text-muted">
            <li className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: "var(--brand)" }}
              />
              <span>
                <span className="font-medium text-foreground">{t("marketValue")}</span>: {t("legendMarketValue")}
              </span>
            </li>
            <li className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-0 w-2.5 shrink-0 border-t-2 border-dashed"
                style={{ borderColor: "var(--accent)" }}
              />
              <span>
                <span className="font-medium text-foreground">{t("invested")}</span>: {t("legendInvested")}
              </span>
            </li>
          </ul>

          {series.dropped > 0 && <p className="text-xs text-muted">{t("dropped", { count: series.dropped })}</p>}
          <p className="text-xs text-muted">{t("cadence")}</p>
        </>
      )}
    </section>
  );
}
