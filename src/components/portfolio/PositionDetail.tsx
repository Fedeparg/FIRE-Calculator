"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import Notice from "@/components/ui/Notice";
import { formatIsoDate } from "@/core/format";
import { lotErrorKey, type LotErrorKey } from "@/core/portfolio-lots";
import { useFormat } from "@/lib/format";
import type { PositionLot, PriceInfo, Position } from "@/lib/portfolio";
import PositionLotForm, { type LotPayload } from "./PositionLotForm";
import SaleSimulator from "./SaleSimulator";

type Props = {
  position: Position;
  /** Último precio conocido del instrumento (para prellenar la simulación de venta). */
  price: PriceInfo | undefined;
  rates: Record<string, number>;
  onClose: () => void;
  /**
   * Se llama tras CADA mutación de lotes. Es obligatorio: el backend reescribe
   * `quantity` y `avgPrice` de la posición en la misma transacción, así que sin esto la tabla
   * y el total seguirían mostrando la foto anterior.
   */
  onMutated: () => void;
};

/** Estado de la carga del histórico. */
type LoadState = "loading" | "ready" | "error";

/**
 * Trae el histórico de lotes de una posición. Vive fuera del componente porque es una llamada
 * a la API, no estado de React: así la usan tanto el efecto de carga inicial como el recargado
 * posterior a cada mutación, sin duplicar la ruta ni el manejo del error.
 */
async function fetchLots(positionId: string): Promise<PositionLot[]> {
  const res = await fetch(`/api/positions/${positionId}/lots`, { cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as PositionLot[];
}

/**
 * Panel de una posición: su histórico de operaciones (lotes) y la simulación fiscal de una
 * venta.
 *
 * LA IDEA QUE DEBE QUEDAR CLARA EN PANTALLA: la posición es la FOTO (cuánto tengo y a qué
 * precio medio) y los lotes son la PELÍCULA (cada compra y cada venta). Al tocar un lote, el
 * servidor reagrega el histórico y reescribe la cantidad y el precio medio de la posición en
 * la misma transacción; por eso aquí no se toca nunca la posición a mano y tras cada mutación
 * se pide al padre que resincronice.
 */
export default function PositionDetail({ position, price, rates, onClose, onMutated }: Props) {
  const t = useTranslations("portfolio.lots");
  const { formatCurrency, formatQuantity } = useFormat();

  const [lots, setLots] = useState<PositionLot[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [editing, setEditing] = useState<PositionLot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<LotErrorKey | null>(null);

  const positionId = position.id;

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
   * Envía una mutación y unifica el tratamiento del fallo. Solo viaja el `code` del cuerpo:
   * el `message` del backend está en castellano y romper la traducción en inglés por mostrarlo
   * sería peor que un mensaje algo más genérico pero traducido.
   */
  async function mutate(request: () => Promise<Response>): Promise<boolean> {
    setSubmitting(true);
    setErrorKey(null);
    try {
      const res = await request();
      if (res.ok) {
        // La posición ha cambiado en el servidor (cantidad y precio medio reagregados).
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

  async function handleSubmit(payload: LotPayload) {
    const target = editing
      ? `/api/positions/${positionId}/lots/${editing.id}`
      : `/api/positions/${positionId}/lots`;
    const ok = await mutate(() =>
      fetch(target, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
    if (ok) setEditing(null);
  }

  async function handleDelete(lotId: string) {
    const ok = await mutate(() =>
      fetch(`/api/positions/${positionId}/lots/${lotId}`, { method: "DELETE" }),
    );
    setConfirmingId(null);
    if (ok && editing?.id === lotId) setEditing(null);
  }

  return (
    <section
      aria-labelledby="position-detail-title"
      className="flex flex-col gap-4 rounded-2xl border border-brand/40 bg-surface p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="position-detail-title" className="text-lg font-semibold text-foreground">
            {t("title", { ticker: position.ticker })}
          </h2>
          <p className="text-sm text-muted">
            {t("snapshot", {
              quantity: formatQuantity(position.quantity),
              avgPrice: formatCurrency(position.avgPrice, position.currency),
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-surface-2"
        >
          {t("close")}
        </button>
      </div>

      <Notice variant="info">{t("explainer")}</Notice>

      {loadState === "loading" && <p className="text-sm text-muted">{t("loading")}</p>}
      {loadState === "error" && <p className="text-sm text-warning">{t("loadError")}</p>}

      {loadState === "ready" && (
        <>
          {lots.length === 0 ? (
            <p className="text-sm text-muted">{t("empty")}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[44rem] text-left text-sm">
                <caption className="px-4 pt-3 text-left text-xs text-muted">
                  {t("tableCaption", { ticker: position.ticker })}
                </caption>
                <thead>
                  <tr className="border-b border-border text-muted">
                    <th scope="col" className="px-4 py-2 font-medium">
                      {t("tradedAt")}
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      {t("kind")}
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      {t("quantity")}
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      {t("priceShort")}
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      {t("feesShort")}
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      {t("note")}
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      <span className="sr-only">{t("actions")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lots.map((lot) => (
                    <tr
                      key={lot.id}
                      className={`border-b border-border last:border-0 ${
                        editing?.id === lot.id ? "bg-surface-2" : ""
                      }`}
                    >
                      <th scope="row" className="px-4 py-2 font-normal text-muted">
                        {formatIsoDate(lot.tradedAt)}
                      </th>
                      <td className="px-4 py-2">
                        <span
                          className={
                            lot.kind === "buy"
                              ? "font-medium text-success"
                              : "font-medium text-danger"
                          }
                        >
                          {lot.kind === "buy" ? t("kindBuy") : t("kindSell")}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-foreground">
                        {formatQuantity(lot.quantity)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-foreground">
                        {formatCurrency(lot.price, position.currency)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted">
                        {lot.fees > 0 ? formatCurrency(lot.fees, position.currency) : "—"}
                      </td>
                      <td className="px-4 py-2 text-muted">
                        <div className="max-w-[12rem] truncate" title={lot.note ?? undefined}>
                          {lot.note ?? "—"}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {confirmingId === lot.id ? (
                          <span className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleDelete(lot.id)}
                              disabled={submitting}
                              className="rounded-md bg-warning px-2.5 py-1 text-xs font-medium text-brand-fg transition hover:opacity-90 disabled:opacity-50"
                            >
                              {t("confirmDelete")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmingId(null)}
                              disabled={submitting}
                              className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-50"
                            >
                              {t("cancel")}
                            </button>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setEditing(lot)}
                              className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-foreground"
                            >
                              {t("edit")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmingId(lot.id)}
                              className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-foreground"
                            >
                              {t("delete")}
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {errorKey && (
            <p role="alert" className="text-sm text-warning">
              {t(errorKey)}
            </p>
          )}

          {/* El `key` fuerza un remount al cambiar de lote editado (o volver al alta), así el
              formulario parte siempre del estado inicial correcto. */}
          <PositionLotForm
            key={editing?.id ?? "add"}
            editing={editing}
            currency={position.currency}
            submitting={submitting}
            onSubmit={handleSubmit}
            onCancelEdit={() => setEditing(null)}
          />

          <SaleSimulator position={position} lots={lots} price={price} rates={rates} />
        </>
      )}
    </section>
  );
}
