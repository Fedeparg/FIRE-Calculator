"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import type { LotPayload, PositionLot, PriceInfo, Position } from "@/lib/portfolio";
import LotList from "./LotList";
import PositionDeleteBar from "./PositionDeleteBar";
import PositionDetailSummary from "./PositionDetailSummary";
import PositionLotForm from "./PositionLotForm";
import SaleSimulator from "./SaleSimulator";
import { usePositionLots } from "./use-position-lots";

export { POSITION_DETAIL_TITLE_ID } from "./PositionDetailSummary";

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

/** Las dos vistas del detalle. */
type View = "lots" | "sale";

/**
 * Detalle de una posición, dentro del panel: cuánto vale y cuánto gana, sus datos clave, sus
 * operaciones (lotes) o la simulación fiscal de una venta, y editar o eliminar la posición.
 *
 * LA IDEA QUE DEBE QUEDAR CLARA: la posición es la FOTO (cuánto tengo y a qué precio medio) y
 * los lotes son la PELÍCULA (cada compra y cada venta). Al tocar un lote, el servidor reagrega
 * el histórico y reescribe la cantidad y el precio medio en la misma transacción; por eso aquí
 * no se toca nunca la posición a mano y tras cada mutación se pide al padre que resincronice.
 */
export default function PositionDetail({ position, price, rates, pricePending, onMutated, onEdit, onDeleted }: Props) {
  const t = useTranslations("portfolio.lots");
  const tDetail = useTranslations("portfolio.detail");

  const { lots, loadState, errorKey, submitting, save, remove } = usePositionLots(position.id, onMutated);
  const [view, setView] = useState<View>("lots");
  const [editingLot, setEditingLot] = useState<PositionLot | null>(null);
  const [confirmingLotId, setConfirmingLotId] = useState<string | null>(null);

  // Los lotes ya están cargados: no hace falta otra consulta para saber si hay ventas.
  const hasSales = lots.some((lot) => lot.kind === "sell");

  async function handleSubmitLot(payload: LotPayload) {
    if (await save(editingLot?.id ?? null, payload)) setEditingLot(null);
  }

  async function handleDeleteLot(lotId: string) {
    const ok = await remove(lotId);
    setConfirmingLotId(null);
    if (ok && editingLot?.id === lotId) setEditingLot(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <PositionDetailSummary position={position} price={price} rates={rates} pricePending={pricePending} />

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
          <LotList
            lots={lots}
            ticker={position.ticker}
            currency={position.currency}
            editingId={editingLot?.id ?? null}
            confirmingId={confirmingLotId}
            submitting={submitting}
            onEdit={setEditingLot}
            onAskDelete={setConfirmingLotId}
            onCancelDelete={() => setConfirmingLotId(null)}
            onConfirmDelete={(lotId) => void handleDeleteLot(lotId)}
          />

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

      <PositionDeleteBar positionId={position.id} hasSales={hasSales} onEdit={onEdit} onDeleted={onDeleted} />
    </div>
  );
}
