"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { formatEUR } from "@/core/format";

export type DonutSlice = { name: string; value: number; color: string };

type Props = {
  title: string;
  data: DonutSlice[];
  centerLabel: string;
};

/** Donut de composición (p.ej. aportado vs intereses) con leyenda y porcentajes. */
export default function BreakdownDonut({ title, data, centerLabel }: Props) {
  const total = data.reduce((sum, d) => sum + Math.max(0, d.value), 0);
  const pct = (v: number) => (total > 0 ? Math.round((Math.max(0, v) / total) * 100) : 0);

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-medium text-foreground">{title}</h2>

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
        <div className="relative h-[200px] w-[200px] shrink-0">
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={data.map((d) => ({ ...d, value: Math.max(0, d.value) }))}
                dataKey="value"
                nameKey="name"
                innerRadius={62}
                outerRadius={92}
                paddingAngle={2}
                stroke="none"
                isAnimationActive={false}
              >
                {data.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-xs text-muted">{centerLabel}</span>
            <span className="text-lg font-semibold text-foreground">{formatEUR(total)}</span>
          </div>
        </div>

        <ul className="w-full space-y-2">
          {data.map((d) => (
            <li key={d.name} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 text-muted">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: d.color }}
                />
                {d.name}
              </span>
              <span className="text-foreground">
                <span className="font-medium">{formatEUR(d.value)}</span>
                <span className="ml-1.5 text-muted">{pct(d.value)}%</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
