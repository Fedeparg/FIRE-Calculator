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
import { formatCompactEUR, formatEUR } from "@/core/format";
import ChartTooltip from "./ChartTooltip";

export type SeriesDef = { key: string; name: string; color: string };

type DataRow = Record<string, number>;

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
    total: string;
    selectionTitle: string;
    growth: string;
    contributed: string;
    interest: string;
  };
  height?: number;
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
}: Props) {
  const [selection, setSelection] = useState<Selection>(null);
  const [dragging, setDragging] = useState(false);

  const totalKeys = stack.map((s) => s.key);

  function pointAt(x: number): DataRow | undefined {
    return data.find((d) => d[xKey] === x);
  }

  const summary = (() => {
    if (!selection) return null;
    const a = Math.min(selection.start, selection.end);
    const b = Math.max(selection.start, selection.end);
    const pa = pointAt(a);
    const pb = pointAt(b);
    if (!pa || !pb || a === b) return null;
    return {
      from: a,
      to: b,
      growth: pb[valueKey] - pa[valueKey],
      contributed: contributedKey ? pb[contributedKey] - pa[contributedKey] : null,
      interest: interestKey ? pb[interestKey] - pa[interestKey] : null,
    };
  })();

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
              {labels.growth}: {formatEUR(summary.growth)}
            </span>
            {summary.interest !== null && (
              <span className="font-medium" style={{ color: "var(--accent)" }}>
                {labels.interest}: {formatEUR(summary.interest)}
              </span>
            )}
          </div>
        )}
      </div>

      <div style={{ width: "100%", height }} className="select-none">
        <ResponsiveContainer>
          <AreaChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
            onMouseDown={(s: RechartsState) => {
              if (s?.activeLabel === undefined) return;
              const x = toNum(s.activeLabel);
              setDragging(true);
              setSelection({ start: x, end: x });
            }}
            onMouseMove={(s: RechartsState) => {
              if (!dragging || s?.activeLabel === undefined) return;
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
            <XAxis dataKey={xKey} tick={{ fontSize: 12, fill: "var(--muted)" }} />
            <YAxis
              tick={{ fontSize: 12, fill: "var(--muted)" }}
              tickFormatter={formatCompactEUR}
              width={70}
            />
            <Tooltip
              content={
                <ChartTooltip
                  labelPrefix={labels.axisX}
                  totalKeys={totalKeys}
                  totalLabel={labels.total}
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
    </div>
  );
}
