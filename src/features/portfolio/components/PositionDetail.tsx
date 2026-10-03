"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import type { PriceInfo, Position } from "@sextante/core/portfolio/types";
import { positionHasSales } from "@/features/portfolio/model/lots";
import { usePositionIncome } from "@/features/portfolio/use-position-income";
import { usePositionLots } from "@/features/portfolio/use-position-lots";
import ToggleGroup from "@/shared/ui/ToggleGroup";
import PositionDeleteBar from "./PositionDeleteBar";
import PositionDetailSummary from "./PositionDetailSummary";
import PositionIncomeView from "./PositionIncomeView";
import PositionLotsView from "./PositionLotsView";
import SaleSimulator from "./SaleSimulator";

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

/** Las vistas del detalle. */
type View = "lots" | "income" | "sale";

const VIEWS: readonly View[] = ["lots", "income", "sale"];
const VIEW_LABELS = { lots: "viewLots", income: "viewIncome", sale: "viewSale" } as const;

/**
 * Detalle de una posición, dentro del panel: cuánto vale y cuánto gana, sus datos clave, sus
 * operaciones (lotes), sus cobros (dividendos) o la simulación fiscal de una venta, y editar o
 * eliminar la posición.
 *
 * LA IDEA QUE DEBE QUEDAR CLARA: la posición es la FOTO (cuánto tengo y a qué precio medio) y
 * los lotes son la PELÍCULA (cada compra y cada venta). Al tocar un lote, el servidor reagrega
 * el histórico y reescribe la cantidad y el precio medio en la misma transacción; por eso aquí
 * no se toca nunca la posición a mano y tras cada mutación se pide al padre que resincronice.
 */
export default function PositionDetail({ position, price, rates, pricePending, onMutated, onEdit, onDeleted }: Props) {
  const t = useTranslations("portfolio.lots");
  const tDetail = useTranslations("portfolio.detail");

  const lots = usePositionLots(position.id, onMutated);
  const income = usePositionIncome(position.id);
  const [view, setView] = useState<View>("lots");

  // Los lotes ya se cargan aquí: no hace falta otra consulta para saber si hay ventas. Mientras
  // cargan o si fallan vale `null` ("no se sabe"), y el aviso fuerte de borrado se muestra igual.
  const hasSales = positionHasSales(lots.loadState, lots.lots);

  return (
    <div className="flex flex-col gap-5">
      <PositionDetailSummary position={position} price={price} rates={rates} pricePending={pricePending} />

      {/* Tres vistas del mismo panel: botones de alternancia (`aria-pressed`), no un `tablist`,
          que exigiría además navegación con flechas. */}
      <ToggleGroup
        label={tDetail("viewLabel")}
        value={view}
        options={VIEWS.map((option) => ({ value: option, label: tDetail(VIEW_LABELS[option]) }))}
        onChange={setView}
        layout="fill"
      />

      {view !== "income" && lots.loadState === "loading" && <p className="text-sm text-muted">{t("loading")}</p>}
      {view !== "income" && lots.loadState === "error" && <p className="text-sm text-warning">{t("loadError")}</p>}

      {lots.loadState === "ready" && view === "lots" && (
        <PositionLotsView ticker={position.ticker} currency={position.currency} lots={lots} />
      )}
      {view === "income" && <PositionIncomeView position={position} income={income} />}
      {lots.loadState === "ready" && view === "sale" && (
        <SaleSimulator position={position} lots={lots.lots} price={price} rates={rates} />
      )}

      <PositionDeleteBar positionId={position.id} hasSales={hasSales} onEdit={onEdit} onDeleted={onDeleted} />
    </div>
  );
}
