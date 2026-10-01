"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { convertCurrency } from "@sextante/core/fx";
import { formatIsoDate } from "@/core/format";
import { isStalePrice, latestPriceDate } from "@/core/portfolio-prices";
import { dailyGain, valuePosition, type PositionValuation } from "@/core/portfolio-positions";
import {
  DEFAULT_SORT_DIR,
  DEFAULT_SORT_KEY,
  sortPositions,
  type SortableRow,
  type SortDir,
  type SortKey,
} from "@/core/portfolio-sort";
import { useFormat } from "@/lib/format";
import type { PriceInfo, Position } from "@/lib/portfolio";
import ToggleGroup from "../ui/ToggleGroup";

type Props = {
  positions: Position[];
  /** Último precio conocido por ticker (desde nuestra DB). Vacío mientras carga o sin datos. */
  prices: Record<string, PriceInfo>;
  /** USD por unidad de cada divisa. */
  rates: Record<string, number>;
  /** Divisa del total: el peso de cada fila se calcula en ella. */
  display: string;
  /** Valor de mercado total de la cartera en `display` (denominador del peso). */
  total: number;
  /** Posición con el panel abierto, o null. */
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Ids de las posiciones cuyo precio aún se está buscando (ver `isPricePending`). */
  pendingIds: ReadonlySet<string>;
  /** Id del panel de detalle, para `aria-controls`. */
  panelId: string;
};

/** Qué ganancia enseña la columna: la de hoy (cierre anterior) o la total (frente a lo invertido). */
type GainMode = "today" | "total";

/** Las dos opciones del conmutador, en el orden en que se ofrecen. */
const GAIN_MODES: readonly GainMode[] = ["today", "total"];

/** Fila enriquecida: lo que se pinta y lo que se compara para ordenar. */
type Row = PositionValuation & {
  position: Position;
  price: PriceInfo | undefined;
  /** Peso sobre el total, en % (0–100), o null si la fila no se puede valorar. */
  weight: number | null;
  stale: boolean;
  pending: boolean;
  /** Ganancia según el modo activo (importe en la divisa de la posición y %), o null sin dato. */
  gain: { abs: number; pct: number | null } | null;
  sortable: SortableRow;
};

/** Criterios de orden del selector de móvil, en el orden en que se ofrecen. */
const SORT_OPTIONS: readonly SortKey[] = ["invested", "name", "marketValue", "pnl"];

/** Divisa base para comparar importes entre posiciones (las tasas son USD por unidad). */
const BASE_CURRENCY = "USD";

/** Columnas de la lista en escritorio: activo, peso, valor y ganancia. */
const COLUMNS = "md:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.2fr)]";

/**
 * Convierte un importe a la base (USD) solo para ORDENAR importes de posiciones en divisas
 * distintas de forma justa. `null` si falta la tasa (esa fila va al final). No se muestra.
 */
function toBase(amount: number | null, currency: string, rates: Record<string, number>): number | null {
  if (amount === null) return null;
  if (currency === BASE_CURRENCY) return amount;
  const rate = rates[currency];
  return Number.isFinite(rate) && rate ? amount * rate : null;
}

/** Clase de color de una ganancia o pérdida. */
function pnlClass(value: number | null): string {
  if (value === null || value === 0) return "text-muted";
  return value > 0 ? "text-success" : "text-danger";
}

/**
 * Lista de posiciones: activo, peso, valor actual y ganancia. Lo demás (cantidad, precio medio,
 * invertido, operaciones) vive en el panel de detalle, que se abre pulsando la fila: así la
 * lista responde a lo que se mira a diario y cabe en un móvil sin scroll horizontal.
 *
 * Es una lista de botones y no una `<table>`: cada fila es UNA acción (abrir el detalle), y en
 * móvil la misma fila se apila como tarjeta sin duplicar marcado. Los importes van en la divisa
 * de cada posición (convertidos si el precio cotiza en otra); el peso, en la divisa del total.
 *
 * Ordenación: por defecto, por lo invertido de mayor a menor, que es el único dato que existe
 * antes de que lleguen los precios (así la lista no se reordena sola al cargar). Las columnas
 * se ordenan pulsando su cabecera; en móvil, con el selector.
 */
export default function PositionList({
  positions,
  prices,
  rates,
  display,
  total,
  selectedId,
  onSelect,
  pendingIds,
  panelId,
}: Props) {
  const t = useTranslations("portfolio.list");
  const { formatCurrency, formatPercent } = useFormat();
  const [sortKey, setSortKey] = useState<SortKey>(DEFAULT_SORT_KEY);
  const [sortDir, setSortDir] = useState<SortDir>(DEFAULT_SORT_DIR);
  const [gainMode, setGainMode] = useState<GainMode>("total");

  // Primer clic en una columna: de mayor a menor. Clics siguientes: alterna el sentido.
  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  // Referencia de frescura: la fecha del precio más reciente de la cartera.
  const latestDate = useMemo(() => latestPriceDate(prices), [prices]);

  const rows: Row[] = useMemo(
    () =>
      positions.map((position) => {
        const price = prices[position.ticker];
        const valuation = valuePosition(position, price, rates);
        const inDisplay =
          valuation.marketValue === null
            ? null
            : convertCurrency(valuation.marketValue, position.currency, display, rates);
        // Ordenar por la columna de ganancia usa SIEMPRE lo que se ve: el importe del modo activo.
        const gain =
          gainMode === "today"
            ? dailyGain(position, price, rates)
            : valuation.pnlAbs === null
              ? null
              : { abs: valuation.pnlAbs, pct: valuation.pnlPct };
        return {
          ...valuation,
          gain,
          position,
          price,
          weight: inDisplay !== null && total > 0 ? (inDisplay / total) * 100 : null,
          stale: isStalePrice(price, latestDate),
          pending: pendingIds.has(position.id),
          sortable: {
            ticker: position.ticker,
            name: position.name ?? position.ticker,
            broker: position.broker,
            quantity: position.quantity,
            avgPrice: toBase(position.avgPrice, position.currency, rates),
            invested: toBase(valuation.invested, position.currency, rates),
            marketValue: toBase(valuation.marketValue, position.currency, rates),
            pnl: toBase(gain?.abs ?? null, position.currency, rates),
          },
        };
      }),
    [positions, prices, rates, display, total, latestDate, pendingIds, gainMode],
  );

  const sortedRows = useMemo(() => sortPositions(rows, sortKey, sortDir), [rows, sortKey, sortDir]);
  const headerProps = { activeKey: sortKey, dir: sortDir, onSort: handleSort };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2 md:px-5">
        <ToggleGroup
          label={t("gainModeLabel")}
          value={gainMode}
          options={GAIN_MODES.map((mode) => ({ value: mode, label: t(`gainMode.${mode}`) }))}
          onChange={setGainMode}
        />
        {/* Móvil: no hay cabeceras de columna, así que se ordena con un selector. */}
        <div className="flex items-center gap-2 md:hidden">
          <label htmlFor="positions-sort" className="text-xs text-muted">
            {t("sortLabel")}
          </label>
          <select
            id="positions-sort"
            value={sortKey}
            onChange={(e) => {
              const key = e.target.value as SortKey;
              setSortKey(key);
              setSortDir(key === "name" ? "asc" : "desc");
            }}
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
          >
            {SORT_OPTIONS.map((key) => (
              <option key={key} value={key}>
                {t(`sort.${key}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        className={`hidden gap-3 border-b border-border bg-surface-2 px-5 py-2.5 text-xs font-semibold text-muted md:grid ${COLUMNS}`}
      >
        <SortHeader column="name" label={t("asset")} align="left" {...headerProps} />
        <span>{t("weight")}</span>
        <SortHeader column="marketValue" label={t("marketValue")} align="right" {...headerProps} />
        <SortHeader
          column="pnl"
          label={t(gainMode === "today" ? "gainToday" : "gain")}
          align="right"
          {...headerProps}
        />
      </div>

      <ul>
        {sortedRows.map((row) => {
          const p = row.position;
          const selected = selectedId === p.id;
          return (
            <li key={p.id} className="border-b border-border last:border-0">
              <button
                type="button"
                onClick={() => onSelect(p.id)}
                aria-pressed={selected}
                aria-controls={panelId}
                className={`flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left transition md:grid md:px-5 ${COLUMNS} ${
                  selected ? "bg-brand-soft" : "hover:bg-surface-2"
                }`}
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-semibold text-foreground">{p.name ?? p.ticker}</span>
                  <span className="truncate text-xs text-muted">
                    {/* En móvil no hay columna de peso: va aquí, delante del símbolo. */}
                    {row.weight !== null && (
                      <span className="md:hidden">{formatPercent(Math.round(row.weight))} · </span>
                    )}
                    {[p.ticker, p.broker].filter(Boolean).join(" · ")}
                  </span>
                </span>

                <span className="hidden items-center gap-2 text-sm text-foreground md:flex">
                  {row.weight !== null ? (
                    <>
                      <span aria-hidden="true" className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-2">
                        <span
                          className="block h-full rounded-full bg-brand"
                          style={{ width: `${Math.min(100, row.weight)}%` }}
                        />
                      </span>
                      {formatPercent(Math.round(row.weight))}
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </span>

                {row.marketValue !== null ? (
                  <>
                    <span className="hidden items-center justify-end gap-1 text-sm tabular-nums text-foreground md:flex">
                      {formatCurrency(row.marketValue, p.currency)}
                      {row.stale && (
                        <StaleBadge
                          label={t("stalePrice", {
                            date: formatIsoDate(row.price!.date),
                            latest: formatIsoDate(latestDate!),
                          })}
                        />
                      )}
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5 tabular-nums">
                      {/* En móvil el valor encabeza esta columna; en escritorio tiene la suya. */}
                      <span className="text-sm text-foreground md:hidden">
                        {formatCurrency(row.marketValue, p.currency)}
                      </span>
                      {row.gain !== null ? (
                        <>
                          <span className={`hidden text-sm md:inline ${pnlClass(row.gain.abs)}`}>
                            {row.gain.abs > 0 ? "+" : ""}
                            {formatCurrency(row.gain.abs, p.currency)}
                          </span>
                          {row.gain.pct !== null && (
                            <span className={`text-xs ${pnlClass(row.gain.pct)}`}>
                              {row.gain.pct > 0 ? "+" : ""}
                              {formatPercent(Math.round(row.gain.pct * 10) / 10)}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </span>
                  </>
                ) : (
                  <span className="flex shrink-0 justify-end md:col-span-2">
                    {row.pending ? (
                      <PendingPrice label={t("pricePending")} hint={t("pricePendingHint")} />
                    ) : (
                      <span className="text-xs text-muted">{p.isDerivative ? t("notTracked") : t("noPriceShort")}</span>
                    )}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Marca de precio rezagado: la fila se valora con un precio anterior al del último refresco
 * (típicamente un fondo con valor liquidativo diferido junto a activos cotizados al día). La
 * explicación va en un `sr-only`: un `title` no llega a teclado ni a lector de pantalla.
 */
function StaleBadge({ label }: { label: string }) {
  return (
    <>
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 shrink-0 fill-current text-warning">
        <path
          fillRule="evenodd"
          d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 2a6 6 0 110 12 6 6 0 010-12zm-.75 2.5a.75.75 0 011.5 0v3.19l2.03 2.03a.75.75 0 11-1.06 1.06l-2.25-2.25a.75.75 0 01-.22-.53V6.5z"
          clipRule="evenodd"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </>
  );
}

/**
 * Estado "buscando precio": un punto que pulsa (solo si el usuario no pide menos movimiento)
 * más texto visible. `role="status"` lo anuncia una vez; la explicación larga va en `sr-only`.
 */
function PendingPrice({ label, hint }: { label: string; hint: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-xs text-muted" title={hint}>
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-brand motion-safe:animate-pulse" />
      {label}
      <span className="sr-only">{hint}</span>
    </span>
  );
}

/**
 * Cabecera de columna ordenable. No es un `<th>` (la lista no es una tabla), así que el estado
 * de la ordenación no va en `aria-sort`: va en el nombre accesible del botón.
 */
function SortHeader({
  column,
  label,
  align,
  activeKey,
  dir,
  onSort,
}: {
  column: SortKey;
  label: string;
  align: "left" | "right";
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const t = useTranslations("portfolio.list");
  const active = activeKey === column;
  const accessibleName = active
    ? t(dir === "asc" ? "sortedAsc" : "sortedDesc", { field: label })
    : t("sortBy", { field: label });
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      aria-label={accessibleName}
      className={`inline-flex items-center gap-1 transition hover:text-foreground ${
        align === "right" ? "justify-self-end" : "justify-self-start"
      } ${active ? "text-foreground" : ""}`}
    >
      {label}
      <span aria-hidden="true">{active ? (dir === "asc" ? "↑" : "↓") : ""}</span>
    </button>
  );
}
