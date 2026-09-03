"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslations } from "next-intl";
import { useFormat } from "@/lib/format";
import ChartDataTable, { type ChartTableColumn } from "./ChartDataTable";
import ChartTooltip from "./ChartTooltip";

export type SeriesDef = { key: string; name: string; color: string };

/**
 * Una fila de datos. El eje X admite texto (una fecha ISO) además de número; las series
 * siempre son numéricas, pero la firma de índice no puede distinguirlas.
 */
type DataRow = Record<string, number | string>;

type Props = {
  title: string;
  data: DataRow[];
  xKey: string;
  /** Series apiladas (p.ej. aportado + intereses). */
  stack: SeriesDef[];
  /** Líneas superpuestas opcionales (p.ej. objetivo FIRE). */
  lines?: SeriesDef[];
  valueKey: string;
  contributedKey?: string;
  interestKey?: string;
  labels: {
    axisX: string;
    /** Etiqueta del total del tooltip. Innecesaria con `showTotal: false`. */
    total?: string;
    /** Etiquetas del resumen de selección. Innecesarias con `selectable: false`. */
    selectionTitle?: string;
    growth?: string;
    contributed?: string;
    interest?: string;
  };
  height?: number;
  /**
   * Divisa de los importes. Si se omite, se formatea en euros exactamente como siempre
   * (`formatEUR` / `formatCompactEUR`): las calculadoras no cambian. La cartera la pasa para
   * pintar la serie en la divisa que el usuario haya elegido.
   */
  currency?: string;
  /**
   * Formato del valor del eje X (ticks, tooltip y tabla accesible). Por defecto se formatea
   * como número entero, que es lo que necesita un eje de años.
   */
  xFormat?: (value: string | number) => string;
  /**
   * Selección por arrastre para ver el crecimiento de un tramo. Solo tiene sentido con un eje
   * X numérico y continuo (años); con fechas se desactiva.
   */
  selectable?: boolean;
  /** Fila de "total" en el tooltip. Sobra cuando hay una sola serie apilada. */
  showTotal?: boolean;
  /**
   * Separación mínima entre etiquetas del eje X, en píxeles. El valor por defecto es el
   * propio de Recharts; una serie diaria necesita bastante más para no solaparse.
   */
  xMinTickGap?: number;
  /**
   * Estrategia de etiquetas del eje X. El valor por defecto es el de Recharts;
   * `preserveStartEnd` garantiza los extremos cuando se ocultan etiquetas intermedias.
   */
  xInterval?: "preserveEnd" | "preserveStartEnd";
};

type Selection = { start: number; end: number } | null;
type RechartsState = { activeLabel?: string | number } | null;

const toNum = (v: string | number | undefined) => (v === undefined ? 0 : Number(v));

export default function TimeSeriesChart({
  title,
  data,
  xKey,
  stack,
  lines = [],
  valueKey,
  contributedKey,
  interestKey,
  labels,
  height = 300,
  currency,
  xFormat,
  selectable = true,
  showTotal = true,
  xMinTickGap = 5,
  xInterval = "preserveEnd",
}: Props) {
  const { formatCompactCurrency, formatCompactEUR, formatCurrency, formatEUR, formatNumber } =
    useFormat();
  // Sin `currency` el formato es EXACTAMENTE el de antes; con divisa se delega en `Intl`.
  const formatValue = currency ? (n: number) => formatCurrency(n, currency) : formatEUR;
  const formatAxisValue = currency
    ? (n: number) => formatCompactCurrency(n, currency)
    : formatCompactEUR;
  const formatX = xFormat ?? ((value: string | number) => formatNumber(Number(value)));
  // Las cadenas de accesibilidad son genéricas de cualquier gráfica, así que se
  // leen del namespace compartido `chart` en lugar de propagarlas por `labels`
  // desde cada una de las calculadoras que la usan.
  const tc = useTranslations("chart");
  const [selection, setSelection] = useState<Selection>(null);
  const [dragging, setDragging] = useState(false);

  const totalKeys = stack.map((s) => s.key);

  function pointAt(x: number): DataRow | undefined {
    return data.find((d) => d[xKey] === x);
  }

  const summary = (() => {
    if (!selectable || !selection) return null;
    const a = Math.min(selection.start, selection.end);
    const b = Math.max(selection.start, selection.end);
    const pa = pointAt(a);
    const pb = pointAt(b);
    if (!pa || !pb || a === b) return null;
    return {
      from: a,
      to: b,
      growth: toNum(pb[valueKey]) - toNum(pa[valueKey]),
      contributed: contributedKey ? toNum(pb[contributedKey]) - toNum(pa[contributedKey]) : null,
      interest: interestKey ? toNum(pb[interestKey]) - toNum(pa[interestKey]) : null,
    };
  })();

  const tableColumns: ChartTableColumn<DataRow>[] = [
    { label: labels.axisX, value: (row) => formatX(row[xKey]) },
    ...[...stack, ...lines].map((series) => ({
      label: series.name,
      value: (row: DataRow) => formatValue(Number(row[series.key])),
    })),
  ];

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex min-h-[20px] items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        {summary && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
            <span className="text-muted">
              {labels.selectionTitle} ({summary.from}–{summary.to})
            </span>
            <span className="font-semibold text-foreground">
              {labels.growth}: {formatValue(summary.growth)}
            </span>
            {summary.interest !== null && (
              <span className="font-medium" style={{ color: "var(--accent)" }}>
                {labels.interest}: {formatValue(summary.interest)}
              </span>
            )}
          </div>
        )}
      </div>

      <div
        style={{ width: "100%", height }}
        className="select-none"
        role="img"
        aria-label={tc("imageLabel", { title })}
      >
        <ResponsiveContainer>
          <AreaChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
            onMouseDown={(s: RechartsState) => {
              if (!selectable || s?.activeLabel === undefined) return;
              const x = toNum(s.activeLabel);
              setDragging(true);
              setSelection({ start: x, end: x });
            }}
            onMouseMove={(s: RechartsState) => {
              if (!selectable || !dragging || s?.activeLabel === undefined) return;
              setSelection((prev) => (prev ? { ...prev, end: toNum(s.activeLabel) } : prev));
            }}
            onMouseUp={() => {
              // Se resetea al soltar el ratón.
              setDragging(false);
              setSelection(null);
            }}
            onMouseLeave={() => {
              setDragging(false);
              setSelection(null);
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey={xKey}
              tick={{ fontSize: 12, fill: "var(--muted)" }}
              // Sin `xFormat` no se pasa formateador: el eje se pinta igual que siempre.
              tickFormatter={xFormat}
              // Con cientos de puntos (una serie diaria) Recharts pintaría una etiqueta por
              // punto: `xMinTickGap` las separa y `preserveStartEnd` garantiza los extremos.
              minTickGap={xMinTickGap}
              interval={xInterval}
            />
            <YAxis
              tick={{ fontSize: 12, fill: "var(--muted)" }}
              tickFormatter={formatAxisValue}
              width={70}
            />
            <Tooltip
              content={
                <ChartTooltip
                  labelPrefix={labels.axisX}
                  totalKeys={showTotal ? totalKeys : []}
                  totalLabel={showTotal ? labels.total : undefined}
                  currency={currency}
                  labelFormat={xFormat}
                />
              }
            />
            <Legend />
            {stack.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stackId="stack"
                stroke={s.color}
                fill={s.color}
                fillOpacity={0.25}
                strokeWidth={2}
              />
            ))}
            {lines.map((l) => (
              <Line
                key={l.key}
                type="monotone"
                dataKey={l.key}
                name={l.name}
                stroke={l.color}
                strokeWidth={1.5}
                strokeDasharray="5 5"
                dot={false}
              />
            ))}
            {selection && (
              <ReferenceArea
                x1={Math.min(selection.start, selection.end)}
                x2={Math.max(selection.start, selection.end)}
                strokeOpacity={0}
                fill="var(--brand)"
                fillOpacity={0.12}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <ChartDataTable title={title} columns={tableColumns} rows={data} />
    </div>
  );
}
