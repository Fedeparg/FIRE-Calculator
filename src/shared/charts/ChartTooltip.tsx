"use client";

import { useFormat } from "@/shared/format/use-format";

type Entry = {
  name?: string;
  /** Un valor, o un par [mínimo, máximo] si la serie es una banda. */
  value?: number | string | readonly (number | string)[];
  color?: string;
  dataKey?: string | number;
};

type Props = {
  active?: boolean;
  payload?: Entry[];
  label?: string | number;
  labelPrefix: string;
  /** Claves cuyas magnitudes se suman para mostrar un "total". */
  totalKeys?: string[];
  totalLabel?: string;
  /**
   * Divisa de los importes. Si se omite se formatea en euros sin decimales, que es lo que
   * necesitan las calculadoras; la cartera la pasa para poder mostrar la divisa elegida.
   */
  currency?: string;
  /** Formato del valor del eje X (p. ej. una fecha ISO). Por defecto se muestra tal cual. */
  labelFormat?: (value: string | number) => string;
};

/** Tooltip común: cada serie con su color + un total opcional (aportado + intereses). */
export default function ChartTooltip({
  active,
  payload,
  label,
  labelPrefix,
  totalKeys,
  totalLabel,
  currency,
  labelFormat,
}: Props) {
  const { formatCurrency, formatEUR } = useFormat();
  // Sin `currency` el formato es EXACTAMENTE el de siempre (euros, sin decimales): las
  // calculadoras que ya usaban este tooltip no cambian ni un dígito.
  const formatValue = currency ? (n: number) => formatCurrency(n, currency) : formatEUR;
  if (!active || !payload?.length) return null;

  const total =
    totalKeys && totalKeys.length
      ? payload
          .filter((e) => totalKeys.includes(String(e.dataKey)))
          .reduce((sum, e) => sum + (Array.isArray(e.value) ? 0 : Number(e.value ?? 0)), 0)
      : null;

  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-md">
      <div className="mb-1 font-medium text-foreground">
        {labelPrefix} {label !== undefined && labelFormat ? labelFormat(label) : label}
      </div>
      <ul className="space-y-0.5">
        {payload.map((e, i) => (
          <li key={i} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted">
              <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: e.color }} />
              {e.name}
            </span>
            <span className="font-medium text-foreground">
              {Array.isArray(e.value)
                ? e.value.map((v) => formatValue(Number(v))).join(" – ")
                : formatValue(Number(e.value ?? 0))}
            </span>
          </li>
        ))}
        {total !== null && totalLabel && (
          <li className="mt-1 flex items-center justify-between gap-4 border-t border-border pt-1">
            <span className="text-muted">{totalLabel}</span>
            <span className="font-semibold text-foreground">{formatValue(total)}</span>
          </li>
        )}
      </ul>
    </div>
  );
}
