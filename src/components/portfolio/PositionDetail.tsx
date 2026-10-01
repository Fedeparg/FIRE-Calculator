"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { formatIsoDate } from "@/core/format";
import { lotErrorKey, type LotErrorKey } from "@/core/portfolio-lots";
import { dailyGain, valuePosition } from "@/core/portfolio-positions";
import { useFormat } from "@/lib/format";
import type { PositionLot, PriceInfo, Position } from "@/lib/portfolio";
import DerivativesNotice from "./DerivativesNotice";
import PositionLotForm, { type LotPayload } from "./PositionLotForm";
import SaleSimulator from "./SaleSimulator";

/** Id del título: da nombre al panel que contiene el detalle. */
export const POSITION_DETAIL_TITLE_ID = "position-detail-title";

type Props = {
  position: Position;
  /** Último precio conocido del instrumento. */
  price: PriceInfo | undefined;
  rates: Record<string, number>;
  /** El precio aún se está buscando (alta reciente). */
  pricePending: boolean;
  /**
   * Se llama tras CADA mutación de lotes. Es obligatorio: el backend reescribe `quantity` y
   * `avgPrice` de la posición en la misma transacción, así que sin esto la lista y el total
   * seguirían mostrando la foto anterior.
   */
  onMutated: () => void;
  /** Abrir el formulario de edición de la posición. */
  onEdit: () => void;
  /** La posición se ha borrado. */
  onDeleted: (id: string) => void;
};

/** Estado de la carga del histórico. */
type LoadState = "loading" | "ready" | "error";

/** Las dos vistas del detalle. */
type View = "lots" | "sale";

/**
 * Trae el histórico de lotes de una posición. Vive fuera del componente porque es una llamada
 * a la API, no estado de React: la usan la carga inicial y el recargado tras cada mutación.
 */
async function fetchLots(positionId: string): Promise<PositionLot[]> {
  const res = await fetch(`/api/positions/${positionId}/lots`, { cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as PositionLot[];
}

/**
 * Detalle de una posición, dentro del panel: cuánto vale y cuánto gana, sus datos clave, sus
 * operaciones (lotes) o la simulación fiscal de una venta, y editar o eliminar la posición.
 *
 * LA IDEA QUE DEBE QUEDAR CLARA: la posición es la FOTO (cuánto tengo y a qué precio medio) y
 * los lotes son la PELÍCULA (cada compra y cada venta). Al tocar un lote, el servidor reagrega
 * el histórico y reescribe la cantidad y el precio medio en la misma transacción; por eso aquí
 * no se toca nunca la posición a mano y tras cada mutación se pide al padre que resincronice.
 */
export default function PositionDetail({
  position,
  price,
  rates,
  pricePending,
  onMutated,
  onEdit,
  onDeleted,
}: Props) {
  const t = useTranslations("portfolio.lots");
  const tDetail = useTranslations("portfolio.detail");
  const tList = useTranslations("portfolio.list");
  const { formatCurrency, formatPercent, formatQuantity } = useFormat();

  const [lots, setLots] = useState<PositionLot[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [view, setView] = useState<View>("lots");
  const [editingLot, setEditingLot] = useState<PositionLot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingLotId, setConfirmingLotId] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<LotErrorKey | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  const positionId = position.id;
  const valuation = valuePosition(position, price, rates);
  const today = dailyGain(position, price, rates);
  // Borrar una posición con ventas las quita del informe de plusvalías: merece un aviso más
  // fuerte que el "¿seguro?" normal. Los lotes ya están cargados, no hace falta otra consulta.
  const hasSales = lots.some((lot) => lot.kind === "sell");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchLots(positionId);
        if (cancelled) return;
        setLots(data);
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [positionId]);

  /**
   * Envía una mutación de lotes y unifica el tratamiento del fallo. Solo viaja el `code` del
   * cuerpo: el `message` del backend está en castellano y romper la traducción en inglés por
   * mostrarlo sería peor que un mensaje algo más genérico pero traducido.
   */
  async function mutate(request: () => Promise<Response>): Promise<boolean> {
    setSubmitting(true);
    setErrorKey(null);
    try {
      const res = await request();
      if (res.ok) {
        onMutated();
        // El recargado va en su propio `try`: si fallase, la mutación SÍ se ha guardado y
        // decir "no se pudo completar" sería mentira; lo que hay es una vista desfasada.
        try {
          setLots(await fetchLots(positionId));
        } catch {
          setLoadState("error");
        }
        return true;
      }
      // Un 400 de dominio trae `{ code }`; el del ValidationPipe global, no.
      const body = (await res.json().catch(() => null)) as { code?: string } | null;
      setErrorKey(lotErrorKey(res.status, body?.code));
      return false;
    } catch {
      setErrorKey("errorNetwork");
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitLot(payload: LotPayload) {
    const target = editingLot
      ? `/api/positions/${positionId}/lots/${editingLot.id}`
      : `/api/positions/${positionId}/lots`;
    const ok = await mutate(() =>
      fetch(target, {
        method: editingLot ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
    if (ok) setEditingLot(null);
  }

  async function handleDeleteLot(lotId: string) {
    const ok = await mutate(() =>
      fetch(`/api/positions/${positionId}/lots/${lotId}`, { method: "DELETE" }),
    );
    setConfirmingLotId(null);
    if (ok && editingLot?.id === lotId) setEditingLot(null);
  }

  async function handleDeletePosition() {
    setDeleting(true);
    setDeleteFailed(false);
    try {
      const res = await fetch(`/api/positions/${positionId}`, { method: "DELETE" });
      if (res.ok) onDeleted(positionId);
      else setDeleteFailed(true);
    } catch {
      setDeleteFailed(true);
    } finally {
      setDeleting(false);
    }
  }

  const pnlClass =
    valuation.pnlAbs === null || valuation.pnlAbs === 0
      ? "text-muted"
      : valuation.pnlAbs > 0
        ? "text-success"
        : "text-danger";

  const todayClass = today === null || today.abs === 0 ? "text-muted" : today.abs > 0 ? "text-success" : "text-danger";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1 pr-14 lg:pr-12">
        <h2 id={POSITION_DETAIL_TITLE_ID} className="text-lg font-semibold text-foreground">
          {position.name ?? position.ticker}
        </h2>
        <p className="text-xs text-muted">
          {[position.ticker, position.broker].filter(Boolean).join(" · ")}
        </p>
      </div>

      {position.isDerivative ? (
        <DerivativesNotice />
      ) : valuation.marketValue !== null && valuation.pnlAbs !== null ? (
        <div className="flex flex-col gap-0.5">
          <span className="text-3xl font-semibold tracking-tight text-foreground tabular-nums">
            {formatCurrency(valuation.marketValue, position.currency)}
          </span>
          <span className={`text-sm tabular-nums ${pnlClass}`}>
            {valuation.pnlAbs > 0 ? "+" : ""}
            {formatCurrency(valuation.pnlAbs, position.currency)}
            {valuation.pnlPct !== null && (
              <>
                {" · "}
                {valuation.pnlPct > 0 ? "+" : ""}
                {formatPercent(valuation.pnlPct, { minDecimals: 2 })}
              </>
            )}
          </span>
          {/* La ganancia de hoy, aparte de la total: sin cierre anterior no se enseña. */}
          {today !== null && (
            <span className={`text-xs tabular-nums ${todayClass}`}>
              {tDetail("todayGain")}: {today.abs > 0 ? "+" : ""}
              {formatCurrency(today.abs, position.currency)}
              {" · "}
              {today.pct > 0 ? "+" : ""}
              {formatPercent(today.pct, { minDecimals: 2 })}
            </span>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">{pricePending ? tList("pricePendingHint") : tList("noPrice")}</p>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-surface-2 p-4 text-sm">
        <div>
          <dt className="text-muted">{tList("quantity")}</dt>
          <dd className="font-medium text-foreground tabular-nums">{formatQuantity(position.quantity)}</dd>
        </div>
        <div>
          <dt className="text-muted">{tList("avgPrice")}</dt>
          <dd className="font-medium text-foreground tabular-nums">
            {formatCurrency(position.avgPrice, position.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">{tList("invested")}</dt>
          <dd className="font-medium text-foreground tabular-nums">
            {formatCurrency(valuation.invested, position.currency)}
          </dd>
        </div>
        {price && (
          <div>
            <dt className="text-muted">{tDetail("priceOn", { date: formatIsoDate(price.date) })}</dt>
            <dd className="font-medium text-foreground tabular-nums">{formatCurrency(price.close, price.currency)}</dd>
          </div>
        )}
      </dl>

      {/* Dos vistas del mismo panel: botones de alternancia (`aria-pressed`), no un `tablist`,
          que exigiría además navegación con flechas. */}
      <div role="group" aria-label={tDetail("viewLabel")} className="flex rounded-xl bg-surface-2 p-1">
        {(["lots", "sale"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setView(option)}
            aria-pressed={view === option}
            className={`h-10 flex-1 rounded-lg text-sm transition ${
              view === option
                ? "bg-surface font-semibold text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            {tDetail(option === "lots" ? "viewLots" : "viewSale")}
          </button>
        ))}
      </div>

      {loadState === "loading" && <p className="text-sm text-muted">{t("loading")}</p>}
      {loadState === "error" && <p className="text-sm text-warning">{t("loadError")}</p>}

      {loadState === "ready" && view === "lots" && (
        <div className="flex flex-col gap-4">
          {lots.length === 0 ? (
            <p className="text-sm text-muted">{t("empty")}</p>
          ) : (
            <ul aria-label={t("tableCaption", { ticker: position.ticker })} className="flex flex-col">
              {lots.map((lot) => (
                <li
                  key={lot.id}
                  className={`flex flex-col gap-1.5 border-b border-border py-3 last:border-0 ${
                    editingLot?.id === lot.id ? "rounded-lg bg-surface-2 px-2" : ""
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span>
                      <span className={`font-medium ${lot.kind === "buy" ? "text-success" : "text-danger"}`}>
                        {lot.kind === "buy" ? t("kindBuy") : t("kindSell")}
                      </span>
                      <span className="text-muted"> · {formatIsoDate(lot.tradedAt)}</span>
                    </span>
                    <span className="text-right tabular-nums text-foreground">
                      {formatQuantity(lot.quantity)} × {formatCurrency(lot.price, position.currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-xs text-muted">
                    <span className="min-w-0 truncate">
                      {[
                        lot.fees > 0 ? `${t("feesShort")}: ${formatCurrency(lot.fees, position.currency)}` : null,
                        lot.note,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {confirmingLotId === lot.id ? (
                      <span className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => void handleDeleteLot(lot.id)}
                          disabled={submitting}
                          className="rounded-md bg-warning px-2.5 py-1.5 font-medium text-brand-fg disabled:opacity-50"
                        >
                          {t("confirmDelete")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingLotId(null)}
                          disabled={submitting}
                          className="rounded-md border border-border px-2.5 py-1.5 font-medium text-foreground disabled:opacity-50"
                        >
                          {t("cancel")}
                        </button>
                      </span>
                    ) : (
                      <span className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingLot(lot)}
                          className="rounded-md px-2 py-1.5 font-medium hover:bg-surface-2 hover:text-foreground"
                        >
                          {t("edit")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingLotId(lot.id)}
                          className="rounded-md px-2 py-1.5 font-medium hover:bg-surface-2 hover:text-foreground"
                        >
                          {t("delete")}
                        </button>
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {errorKey && (
            <p role="alert" className="text-sm text-warning">
              {t(errorKey)}
            </p>
          )}

          {/* El `key` fuerza un remount al cambiar de lote editado (o volver al alta). */}
          <PositionLotForm
            key={editingLot?.id ?? "add"}
            editing={editingLot}
            currency={position.currency}
            submitting={submitting}
            onSubmit={handleSubmitLot}
            onCancelEdit={() => setEditingLot(null)}
          />
        </div>
      )}

      {loadState === "ready" && view === "sale" && (
        <SaleSimulator position={position} lots={lots} price={price} rates={rates} />
      )}

      <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
        {confirmingDelete ? (
          <>
            {hasSales && (
              <p role="alert" className="text-xs text-warning">
                {tList("confirmDeleteWithSales")}
              </p>
            )}
            {deleteFailed && (
              <p role="alert" className="text-xs text-warning">
                {tDetail("deleteError")}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleDeletePosition()}
                disabled={deleting}
                className="h-11 flex-1 rounded-lg bg-warning px-3 text-sm font-medium text-brand-fg disabled:opacity-50"
              >
                {deleting ? tList("deleting") : tList("confirm")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                className="h-11 flex-1 rounded-lg border border-border px-3 text-sm font-medium text-foreground disabled:opacity-50"
              >
                {tList("cancel")}
              </button>
            </div>
          </>
        ) : (
          <div className="flex justify-between">
            <button
              type="button"
              onClick={onEdit}
              className="h-11 rounded-lg px-3 text-sm font-medium text-foreground hover:bg-surface-2"
            >
              {tDetail("editPosition")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="h-11 rounded-lg px-3 text-sm font-medium text-danger hover:bg-danger-soft"
            >
              {tDetail("deletePosition")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
