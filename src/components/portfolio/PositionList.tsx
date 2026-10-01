"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { convertCurrency } from "@sextante/core/fx";
import { formatIsoDate } from "@/core/format";
import { useFormat } from "@/lib/format";
import { isStalePrice, latestPriceDate } from "@/core/portfolio-prices";
import {
  DEFAULT_SORT_DIR,
  DEFAULT_SORT_KEY,
  sortPositions,
  type SortableRow,
  type SortDir,
  type SortKey,
} from "@/core/portfolio-sort";
import type { PositionLot, PriceInfo, Position } from "@/lib/portfolio";

type Props = {
  positions: Position[];
  /** Último precio conocido por ticker (desde nuestra DB). Vacío mientras carga o sin datos. */
  prices: Record<string, PriceInfo>;
  /** Tasas FX (USD por unidad de cada divisa) para convertir el valor a la divisa de la fila. */
  rates: Record<string, number>;
  /** Id de la posición que se está editando (resaltada), o null. */
  editingId: string | null;
  /** Id de la posición cuyo panel de lotes está abierto, o null. */
  detailId: string | null;
  onEdit: (position: Position) => void;
  /** Abre (o cierra, si ya lo estaba) el panel de lotes de una posición. */
  onToggleDetail: (id: string) => void;
  onDeleted: (id: string) => void;
  /** Ids de las posiciones cuyo precio aún se está buscando (ver `isPricePending`). */
  pendingIds: ReadonlySet<string>;
};

/** Cómo se muestra el P&L: porcentaje o importe en la divisa de la posición. */
type PnlMode = "pct" | "abs";

/** Fila enriquecida: datos ya calculados para pintar + valores comparables para ordenar. */
type Row = {
  position: Position;
  invested: number;
  price: PriceInfo | undefined;
  marketValue: number | null;
  pnlAbs: number | null;
  pnlPct: number | null;
  /** El precio de esta fila es anterior al del último refresco de la cartera. */
  stale: boolean;
  missingReason: string;
  /** Sin precio todavía, pero el servidor lo está buscando: se muestra "Buscando precio…". */
  pending: boolean;
  sortable: SortableRow;
};

/** Divisa base para comparar importes entre posiciones (las tasas son USD por unidad). */
const BASE_CURRENCY = "USD";

/**
 * Convierte un importe de su divisa a la base (USD) solo para poder ORDENAR importes de
 * posiciones en divisas distintas de forma justa. `null` si falta la tasa de origen (esa fila
 * se ordena al final). No se usa para mostrar: en la tabla cada importe va en su propia divisa.
 */
function toBase(amount: number | null, currency: string, rates: Record<string, number>): number | null {
  if (amount === null) return null;
  if (currency === BASE_CURRENCY) return amount;
  const rate = rates[currency];
  return Number.isFinite(rate) && rate ? amount * rate : null;
}

/**
 * Tabla de posiciones con ordenación por cualquier columna, editar y borrado inline
 * (confirmación sin modal). Enriquece cada fila con el último precio de mercado (desde nuestra
 * DB) para mostrar valor actual y P&L.
 *
 * Regla de divisa: el valor de mercado se CONVIERTE a la divisa de la posición con las tasas
 * FX diarias (el precio puede venir en otra divisa, p. ej. un activo en USD comprado en EUR).
 * El P&L = valor − invertido, ambos ya en la divisa de la posición. Solo se marca "—" si no
 * hay precio o si falta la tasa de cambio necesaria.
 *
 * Ordenación: el primer clic en una columna ordena de mayor a menor; el siguiente invierte el
 * sentido. Por defecto, por lo invertido descendente. Los valores no calculables ("—") van
 * siempre al final. Los importes se comparan convertidos a una divisa base común (USD).
 */
export default function PositionList({
  positions,
  prices,
  rates,
  editingId,
  detailId,
  onEdit,
  onToggleDetail,
  onDeleted,
  pendingIds,
}: Props) {
  const t = useTranslations("portfolio.list");
  const { formatCurrency, formatPercent, formatQuantity } = useFormat();
  // id en confirmación de borrado / id en proceso de borrado.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Posición en confirmación cuyo histórico tiene ventas: borrarla las quita del informe de
  // plusvalías, y eso merece un aviso más fuerte que el "¿seguro?" normal.
  const [withSalesId, setWithSalesId] = useState<string | null>(null);
  // Mientras se comprueba si tiene ventas, el botón de confirmar espera: si no, se podría
  // borrar antes de que llegue el aviso.
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [pnlMode, setPnlMode] = useState<PnlMode>("pct");
  const [sortKey, setSortKey] = useState<SortKey>(DEFAULT_SORT_KEY);
  const [sortDir, setSortDir] = useState<SortDir>(DEFAULT_SORT_DIR);

  /**
   * Pide confirmación y, en paralelo, mira si la posición tiene ventas. Si la consulta falla
   * se confirma igual, sin el aviso extra: no debe bloquear el borrado. El aviso solo se pinta
   * mientras ESA posición sigue en confirmación, así que una respuesta tardía no se cuela en
   * otra fila.
   */
  async function startConfirm(id: string) {
    setConfirmingId(id);
    setWithSalesId(null);
    setCheckingId(id);
    try {
      const res = await fetch(`/api/positions/${id}/lots`, { cache: "no-store" });
      if (!res.ok) return;
      const lots = (await res.json()) as PositionLot[];
      if (lots.some((lot) => lot.kind === "sell")) setWithSalesId(id);
    } catch {
      // Sin red, el borrado sigue siendo posible; solo falta el aviso adicional.
    } finally {
      setCheckingId((current) => (current === id ? null : current));
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/positions/${id}`, { method: "DELETE" });
      if (res.ok) {
        onDeleted(id);
      }
    } finally {
      setDeletingId(null);
      setConfirmingId(null);
    }
  }

  // Primer clic en una columna: de mayor a menor. Clics siguientes: alterna el sentido.
  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  // Referencia de frescura: la fecha del precio más reciente de la cartera. Ver
  // `core/portfolio-prices.ts` — no hay una "fecha de último refresco" que sirva la API.
  const latestDate = useMemo(() => latestPriceDate(prices), [prices]);

  // Decoramos cada posición con sus valores calculados y comparables. El P&L comparable sigue
  // el modo activo (%, o importe base) para que ordenar coincida con lo que se ve.
  const rows: Row[] = useMemo(
    () =>
      positions.map((position) => {
        const invested = position.quantity * position.avgPrice;
        const price = prices[position.ticker];
        const marketValue =
          price !== undefined
            ? convertCurrency(
                position.quantity * price.close,
                price.currency,
                position.currency,
                rates,
              )
            : null;
        const stale = isStalePrice(price, latestDate);
        const pnlAbs = marketValue !== null ? marketValue - invested : null;
        const pnlPct = pnlAbs !== null && invested > 0 ? (pnlAbs / invested) * 100 : null;
        const missingReason =
          price === undefined
            ? t("noPrice")
            : marketValue === null
              ? t("noFxRate", { price: price.currency, position: position.currency })
              : "";

        const sortable: SortableRow = {
          ticker: position.ticker,
          name: position.name,
          broker: position.broker,
          quantity: position.quantity,
          avgPrice: toBase(position.avgPrice, position.currency, rates),
          invested: toBase(invested, position.currency, rates),
          marketValue: toBase(marketValue, position.currency, rates),
          pnl: pnlMode === "pct" ? pnlPct : toBase(pnlAbs, position.currency, rates),
        };

        return {
          position,
          invested,
          price,
          marketValue,
          pnlAbs,
          pnlPct,
          stale,
          missingReason,
          pending: pendingIds.has(position.id),
          sortable,
        };
      }),
    [positions, prices, rates, pnlMode, latestDate, pendingIds, t],
  );

  const sortedRows = useMemo(
    () => sortPositions(rows, sortKey, sortDir),
    [rows, sortKey, sortDir],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end gap-2 text-xs">
        <span className="text-muted">{t("pnlMode")}</span>
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {(["pct", "abs"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setPnlMode(mode)}
              aria-pressed={pnlMode === mode}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                pnlMode === mode
                  ? "bg-brand text-brand-fg"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {mode === "pct" ? t("pnlModePct") : t("pnlModeAbs")}
            </button>
          ))}
        </div>
      </div>

      {/* `relative` NO es decorativo: la cabecera accesible de la columna de acciones es
          un `sr-only`, que se posiciona en absoluto. Sin un ancestro posicionado se
          anclaba al BODY, en la coordenada que le tocaría dentro de una tabla más ancha
          que la pantalla, y estiraba el ancho del documento: la página entera se podía
          arrastrar en horizontal sobre fondo vacío (en móvil, casi el triple de su
          ancho). Anclado aquí, queda dentro del área que ya hace scroll. */}
      <div className="relative overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[52rem] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              <SortHeader
                column="ticker"
                label={t("ticker")}
                title={t("sortBy", { field: t("ticker") })}
                align="left"
                activeKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                column="name"
                label={t("name")}
                title={t("sortBy", { field: t("name") })}
                align="left"
                activeKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                column="quantity"
                label={t("quantity")}
                title={t("sortBy", { field: t("quantity") })}
                align="right"
                activeKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                column="avgPrice"
                label={t("avgPrice")}
                title={t("sortBy", { field: t("avgPrice") })}
                align="right"
                activeKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                column="broker"
                label={t("broker")}
                title={t("sortBy", { field: t("broker") })}
                align="left"
                activeKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                column="invested"
                label={t("invested")}
                title={t("sortBy", { field: t("invested") })}
                align="right"
                activeKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                column="marketValue"
                label={t("marketValue")}
                title={t("sortBy", { field: t("marketValue") })}
                align="right"
                activeKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                column="pnl"
                label={t("pnl")}
                title={t("sortBy", { field: t("pnl") })}
                align="right"
                activeKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <th scope="col" className="px-4 py-3 text-right font-medium">
                <span className="sr-only">{t("actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              const p = row.position;
              const { invested, price, marketValue, pnlAbs, pnlPct, stale, missingReason, pending } = row;

              const isConfirming = confirmingId === p.id;
              const isDeleting = deletingId === p.id;
              const isEditing = editingId === p.id;
              return (
                <tr
                  key={p.id}
                  className={`border-b border-border last:border-0 ${
                    isEditing ? "bg-surface-2" : ""
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-foreground">{p.ticker}</td>
                  <td className="px-4 py-3 text-muted">
                    <div className="max-w-[16rem] truncate" title={p.name ?? undefined}>
                      {p.name ?? "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatQuantity(p.quantity)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatCurrency(p.avgPrice, p.currency)}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    <div className="max-w-[9rem] truncate" title={p.broker ?? undefined}>
                      {p.broker ?? "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatCurrency(invested, p.currency)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {marketValue !== null ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="inline-flex items-center gap-1">
                          {formatCurrency(marketValue, p.currency)}
                          {stale && (
                            <StaleBadge
                              label={t("stalePrice", {
                                date: formatIsoDate(price!.date),
                                latest: formatIsoDate(latestDate!),
                              })}
                            />
                          )}
                        </span>
                        {/* Fecha del precio SIEMPRE visible (no solo en un `title`, que no
                            existe para teclado/lector de pantalla): resuelve la confusión de
                            no saber cuándo se valoró esta fila. */}
                        <span
                          className={`text-xs font-normal normal-case ${
                            stale ? "text-warning" : "text-muted"
                          }`}
                        >
                          {t("priceAsOf", { date: formatIsoDate(price!.date) })}
                        </span>
                      </div>
                    ) : pending ? (
                      <PendingPrice label={t("pricePending")} hint={t("pricePendingHint")} />
                    ) : (
                      <span className="text-muted" title={missingReason}>
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {pnlAbs !== null ? (
                      <span
                        className={
                          pnlAbs > 0 ? "text-success" : pnlAbs < 0 ? "text-danger" : "text-muted"
                        }
                      >
                        {pnlAbs > 0 ? "+" : ""}
                        {pnlMode === "pct"
                          ? formatPercent(pnlPct!, { minDecimals: 2 })
                          : formatCurrency(pnlAbs, p.currency)}
                      </span>
                    ) : (
                      <span className="text-muted" title={missingReason}>
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isConfirming ? (
                      <span className="inline-flex flex-wrap items-center justify-end gap-2">
                        {withSalesId === p.id && (
                          <span role="alert" className="w-full max-w-60 text-left text-xs text-warning">
                            {t("confirmDeleteWithSales")}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id)}
                          disabled={isDeleting || checkingId === p.id}
                          className="rounded-md bg-warning px-2.5 py-1 text-xs font-medium text-brand-fg transition hover:opacity-90 disabled:opacity-50"
                        >
                          {isDeleting ? t("deleting") : t("confirm")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingId(null)}
                          disabled={isDeleting}
                          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-50"
                        >
                          {t("cancel")}
                        </button>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onToggleDetail(p.id)}
                          aria-pressed={detailId === p.id}
                          className={`rounded-md border border-border px-2.5 py-1 text-xs font-medium transition hover:bg-surface-2 hover:text-foreground ${
                            detailId === p.id ? "bg-surface-2 text-foreground" : "text-muted"
                          }`}
                        >
                          {t("lots")}
                        </button>
                        <button
                          type="button"
                          onClick={() => onEdit(p)}
                          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-foreground"
                        >
                          {t("edit")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void startConfirm(p.id)}
                          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-foreground"
                        >
                          {t("delete")}
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Marca de precio rezagado: la fila se valora con un precio anterior al del último refresco
 * (típicamente un fondo con valor liquidativo diferido junto a activos cotizados al día).
 *
 * El icono NO es la única pista ni vive solo en el `title`: los atributos `title` no existen
 * para quien navega con teclado o lector de pantalla, así que la explicación completa va en
 * un texto `sr-only`. El color es redundante, nunca la única señal.
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
 * más texto visible. `role="status"` (aria-live polite) anuncia el cambio una vez, y la
 * explicación larga va en `title` + `sr-only` porque un `title` solo no llega a teclado ni
 * a lector de pantalla. Colores con tokens: válido en claro y oscuro.
 */
function PendingPrice({ label, hint }: { label: string; hint: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-xs text-muted" title={hint}>
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-full bg-brand motion-safe:animate-pulse"
      />
      {label}
      <span className="sr-only">{hint}</span>
    </span>
  );
}

/**
 * Cabecera de columna ordenable: un botón accesible dentro del `<th>`. Marca `aria-sort` en la
 * columna activa e indica el sentido con una flecha (↑/↓); en inactivas muestra "↕" al pasar
 * el ratón. Todo con tokens de color (nada hardcodeado), válido en claro y oscuro.
 */
function SortHeader({
  column,
  label,
  title,
  align,
  activeKey,
  dir,
  onSort,
}: {
  column: SortKey;
  label: string;
  title: string;
  align: "left" | "right";
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = activeKey === column;
  const ariaSort = active ? (dir === "asc" ? "ascending" : "descending") : "none";
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`px-4 py-3 font-medium ${align === "right" ? "text-right" : ""}`}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        title={title}
        className={`group inline-flex items-center gap-1 whitespace-nowrap rounded transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 ${
          active ? "text-foreground" : "hover:text-foreground"
        }`}
      >
        <span>{label}</span>
        <span
          aria-hidden
          className={`text-xs ${
            active
              ? "text-brand"
              : "text-muted opacity-0 transition-opacity group-hover:opacity-60"
          }`}
        >
          {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}
