"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { useTranslations } from "next-intl";
import { useFormat } from "@/lib/format";

export type DonutSlice = { name: string; value: number; color: string };

type Props = {
  title: string;
  data: DonutSlice[];
  centerLabel: string;
};

/**
 * Donut de composición (p.ej. aportado vs intereses) con leyenda y porcentajes.
 *
 * Accesibilidad: aquí NO hace falta una tabla oculta como en `TimeSeriesChart`.
 * La leyenda visible ya lista cada porción con su nombre, su importe y su
 * porcentaje, y el centro muestra el total: un lector de pantalla lee todos los
 * datos del gráfico como texto normal. Lo único que sobra es el SVG, que sin
 * `<title>` solo aportaría ruido, así que se marca `role="img"` con una
 * etiqueta corta y sus nodos internos quedan fuera del árbol de accesibilidad.
 * Duplicar esos mismos números en una tabla `sr-only` los haría oír dos veces.
 */
export default function BreakdownDonut({ title, data, centerLabel }: Props) {
  const { formatEUR } = useFormat();
  const tc = useTranslations("chart");
  const total = data.reduce((sum, d) => sum + Math.max(0, d.value), 0);
  const pct = (v: number) => (total > 0 ? Math.round((Math.max(0, v) / total) * 100) : 0);

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-medium text-foreground">{title}</h2>

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
        <div className="relative h-[200px] w-[200px] shrink-0">
          {/*
            `role="img"` envuelve SOLO el SVG: el rótulo central es hermano y
            debe seguir siendo texto legible para el lector de pantalla.
          */}
          <div className="h-full w-full" role="img" aria-label={tc("imageLabel", { title })}>
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
          </div>
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
