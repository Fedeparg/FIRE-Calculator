"use client";

import { useFormat } from "@/shared/format/use-format";

type Entry = {
  name?: string;
  /** A value, or a [min, max] pair if the series is a band. */
  value?: number | string | readonly (number | string)[];
  color?: string;
  dataKey?: string | number;
};

type Props = {
  active?: boolean;
  payload?: Entry[];
  label?: string | number;
  labelPrefix: string;
  /** Keys whose magnitudes are summed to show a "total". */
  totalKeys?: string[];
  totalLabel?: string;
  /**
   * Currency of the amounts. If omitted, amounts are formatted in euros without decimals, which
   * is what the calculators need; the portfolio passes it to show the chosen currency.
   */
  currency?: string;
  /** Format of the X-axis value (e.g. an ISO date). Shown as is by default. */
  labelFormat?: (value: string | number) => string;
};

/** Shared tooltip: each series with its color + an optional total (contributions + interest). */
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
  // Without `currency` the format is EXACTLY the original one (euros, no decimals): the
  // calculators that already used this tooltip do not change a single digit.
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
