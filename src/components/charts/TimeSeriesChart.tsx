"use client";

import { useMemo, useState } from "react";
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

export type SeriesDef = {
  key: string;
  name: string;
  color: string;
  /** Solo para `lines`: trazo discontinuo (por defecto) o continuo. */
  dashed?: boolean;
};

/**
 * Banda entre dos series (p. ej. los percentiles 10 y 90 de una simulación). Se pinta como un
 * área rellena entre `lowKey` y `highKey`, sin apilar sobre el resto.
 */
export type BandDef = { lowKey: string; highKey: string; name: string; color: string };

/**
 * Una fila de datos. El eje X admite texto (una fecha ISO) además de número; las series
 * siempre son numéricas, pero la firma de índice no puede distinguirlas. `boolean` se admite
 * además para columnas extra de la tabla accesible (p.ej. "estimado") que no se pintan en el
 * propio gráfico.
 */
export type DataRow = Record<string, number | string | boolean>;

type Props = {
  title: string;
  data: DataRow[];
  xKey: string;
  /** Series apiladas (p.ej. aportado + intereses). */
  stack: SeriesDef[];
  /** Líneas superpuestas opcionales (p.ej. objetivo FIRE). */
  lines?: SeriesDef[];
  /** Bandas opcionales entre dos series (p.ej. un abanico de percentiles). */
  bands?: BandDef[];
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
  /**
   * Tramos del eje X que se sombrean de forma permanente (a diferencia de la selección por
   * arrastre, que es interactiva). Genérico a propósito — el componente no sabe qué
   * significa un tramo, solo lo pinta — para que cualquier calculadora lo reutilice; hoy lo
   * usa la cartera para marcar los puntos `estimated` del histórico.
   */
  shadedRanges?: { from: string | number; to: string | number; label?: string }[];
  /**
   * Columnas extra de la tabla accesible, además del eje X y las series (`stack`/`lines`).
   * Igual que `shadedRanges`, mantiene el componente ajeno al significado del dato.
   */
  extraColumns?: ChartTableColumn<DataRow>[];
  /**
   * Dominio del eje de valores. `"zero"` (por defecto) es el de siempre: arranca en 0, que es
   * lo correcto para una proyección que crece desde cero. `"fit"` ajusta el eje al rango real
   * de los datos (con un 1% de margen arriba y abajo) en vez de forzar el 0 como suelo; lo
   * necesita la cartera, donde un valor base alto con poca variación se ve plana pegada a 0.
   */
  yDomain?: "zero" | "fit";
  /**
   * Oculta el título a la vista (sigue en el DOM para lectores de pantalla y da nombre a la
   * tabla accesible). Para cuando el bloque que lo contiene ya lo dice.
   */
  hideTitle?: boolean;
  /** Dibuja la leyenda de Recharts. Se apaga cuando quien llama pinta una propia, más explicada. */
  showLegend?: boolean;
};

/** Margen del dominio "fit", como fracción del valor más alto/bajo del gráfico. */
const FIT_DOMAIN_PADDING_RATIO = 0.01;

type Selection = { start: number; end: number } | null;
type RechartsState = { activeLabel?: string | number } | null;

const toNum = (v: string | number | boolean | undefined) => (v === undefined ? 0 : Number(v));

export default function TimeSeriesChart({
  title,
  data,
  xKey,
  stack,
  lines = [],
  bands = [],
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
  shadedRanges = [],
  extraColumns = [],
  yDomain = "zero",
  hideTitle = false,
  showLegend = true,
}: Props) {
  const { formatCompactCurrency, formatCompactEUR, formatCurrency, formatEUR, formatNumber } =
    useFormat();
  // Sin `currency` el formato es EXACTAMENTE el de antes; con divisa se delega en `Intl`.
  const formatValue = currency ? (n: number) => formatCurrency(n, currency) : formatEUR;
  // Espacios duros: Recharts parte las etiquetas de eje por los espacios normales cuando no
  // caben, y en móvil "600 mil €" acababa en dos líneas.
  const formatAxisValue = (n: number) =>
    (currency ? formatCompactCurrency(n, currency) : formatCompactEUR(n)).replace(/ /g, "\u00a0");
  const formatX = xFormat ?? ((value: string | number) => formatNumber(Number(value)));
  // Las cadenas de accesibilidad son genéricas de cualquier gráfica, así que se
  // leen del namespace compartido `chart` en lugar de propagarlas por `labels`
  // desde cada una de las calculadoras que la usan.
  const tc = useTranslations("chart");
  const [selection, setSelection] = useState<Selection>(null);

  // Recharts calcula el dominio de un `Area` apilado forzando el mínimo a 0 (el baseline del
  // relleno) antes de que un `domain` en forma de función pueda tocarlo, así que un 1% de
  // margen aplicado ahí nunca se nota. Con `yDomain="fit"` se calcula el rango a mano a partir
  // de los propios datos (el total apilado de cada fila y las líneas superpuestas) para poder
  // ajustar el eje al valor real en vez de al que Recharts asume para el relleno.
  const fitYDomain = useMemo<[number, number] | undefined>(() => {
    if (yDomain !== "fit") return undefined;
    let min = Infinity;
    let max = -Infinity;
    for (const row of data) {
      const stackTotal = stack.reduce((sum, s) => sum + toNum(row[s.key]), 0);
      min = Math.min(min, stackTotal);
      max = Math.max(max, stackTotal);
      for (const key of [...lines.map((l) => l.key), ...bands.flatMap((b) => [b.lowKey, b.highKey])]) {
        const v = toNum(row[key]);
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return undefined;
    if (min === max) {
      const pad = Math.abs(max) * FIT_DOMAIN_PADDING_RATIO || 1;
      return [min - pad, max + pad];
    }
    return [
      min - Math.abs(min) * FIT_DOMAIN_PADDING_RATIO,
      max + Math.abs(max) * FIT_DOMAIN_PADDING_RATIO,
    ];
  }, [data, stack, lines, bands, yDomain]);
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
    { label: labels.axisX, value: (row) => formatX(row[xKey] as string | number) },
    ...[...stack, ...lines].map((series) => ({
      label: series.name,
      value: (row: DataRow) => formatValue(Number(row[series.key])),
    })),
    ...bands.map((band) => ({
      label: band.name,
      value: (row: DataRow) =>
        `${formatValue(Number(row[band.lowKey]))} – ${formatValue(Number(row[band.highKey]))}`,
    })),
    ...extraColumns,
  ];

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className={`flex items-center justify-between gap-3 ${hideTitle && !summary ? "" : "mb-3 min-h-[20px]"}`}>
        <h2 className={hideTitle ? "sr-only" : "text-sm font-medium text-foreground"}>{title}</h2>
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
              domain={yDomain === "fit" && fitYDomain ? fitYDomain : [0, "auto"]}
              // Sin esto Recharts extiende el dominio para incluir el baseline (0) que usa
              // internamente para rellenar el área apilada, y el ajuste a 1% no se nota.
              allowDataOverflow={yDomain === "fit"}
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
            {showLegend && <Legend />}
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
            {bands.map((b) => (
              <Area
                key={`${b.lowKey}-${b.highKey}`}
                type="monotone"
                // Recharts pinta un área de rango cuando `dataKey` devuelve [mínimo, máximo].
                dataKey={(row: DataRow) => [toNum(row[b.lowKey]), toNum(row[b.highKey])]}
                name={b.name}
                stroke="none"
                fill={b.color}
                fillOpacity={0.18}
                activeDot={false}
                isAnimationActive={false}
              />
            ))}
            {lines.map((l) => (
              <Line
                key={l.key}
                type="monotone"
                dataKey={l.key}
                name={l.name}
                stroke={l.color}
                strokeWidth={l.dashed === false ? 2 : 1.5}
                strokeDasharray={l.dashed === false ? undefined : "5 5"}
                dot={false}
              />
            ))}
            {shadedRanges.map((range, index) => (
              <ReferenceArea
                key={`shaded-${index}`}
                x1={range.from}
                x2={range.to}
                label={range.label}
                strokeOpacity={0}
                fill="var(--warning)"
                fillOpacity={0.1}
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
