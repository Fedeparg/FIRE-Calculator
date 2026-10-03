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
  /** Last known price of the instrument. */
  price: PriceInfo | undefined;
  rates: Record<string, number>;
  /** The price is still being fetched (recently created). */
  pricePending: boolean;
  /**
   * Called after EVERY lot mutation. Required: the backend rewrites the position's `quantity` and
   * `avgPrice` in the same transaction, so without this the list and the total would keep
   * showing the previous snapshot.
   */
  onMutated: () => void;
  /** Opens the position's edit form. */
  onEdit: () => void;
  /** The position has been deleted. */
  onDeleted: (id: string) => void;
};

/** The detail's views. */
type View = "lots" | "income" | "sale";

const VIEWS: readonly View[] = ["lots", "income", "sale"];
const VIEW_LABELS = { lots: "viewLots", income: "viewIncome", sale: "viewSale" } as const;

/**
 * Detail of a position, inside the panel: what it is worth and how much it gains, its key data,
 * its trades (lots), its income (dividends) or the tax simulation of a sale, and editing or
 * deleting the position.
 *
 * THE IDEA THAT MUST STAY CLEAR: the position is the SNAPSHOT (how much I hold and at what
 * average price) and the lots are the FILM (every purchase and every sale). When a lot is touched,
 * the server re-aggregates the history and rewrites the quantity and average price in the same
 * transaction; that is why the position is never touched by hand here, and after every mutation
 * the parent is asked to re-sync.
 */
export default function PositionDetail({ position, price, rates, pricePending, onMutated, onEdit, onDeleted }: Props) {
  const t = useTranslations("portfolio.lots");
  const tDetail = useTranslations("portfolio.detail");

  const lots = usePositionLots(position.id, onMutated);
  const income = usePositionIncome(position.id);
  const [view, setView] = useState<View>("lots");

  // The lots are already loaded here: no extra query is needed to know whether there are sales.
  // While loading or on failure it is `null` ("unknown"), and the strong delete warning shows anyway.
  const hasSales = positionHasSales(lots.loadState, lots.lots);

  return (
    <div className="flex flex-col gap-5">
      <PositionDetailSummary position={position} price={price} rates={rates} pricePending={pricePending} />

      {/* Three views of the same panel: toggle buttons (`aria-pressed`), not a `tablist`, which
          would also require arrow-key navigation. */}
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
