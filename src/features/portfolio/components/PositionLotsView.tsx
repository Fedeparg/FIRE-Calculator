"use client";

import { useTranslations } from "next-intl";

import type { LotPayload, PositionLot } from "@sextante/core/portfolio/types";
import type { usePositionLots } from "@/features/portfolio/use-position-lots";
import { useEditableCollection } from "@/shared/ui/use-editable-collection";
import { useApiErrorText } from "@/shared/api/use-api-error-text";
import LotList from "./LotList";
import PositionLotForm from "./PositionLotForm";

type Props = {
  ticker: string;
  /** A lot's amounts are always in its position's currency. */
  currency: string;
  /** Lots and mutations from `usePositionLots` (the detail loads them: the sale and the delete use them too). */
  lots: ReturnType<typeof usePositionLots>;
};

/** The detail's "Trades" view: the lot history and the create/edit form. */
export default function PositionLotsView({ ticker, currency, lots }: Props) {
  const t = useTranslations("portfolio.lots");
  const errorText = useApiErrorText(t);
  const rows = useEditableCollection<PositionLot, LotPayload>({ save: lots.save, remove: lots.remove });

  return (
    <div className="flex flex-col gap-4">
      <LotList
        lots={lots.lots}
        ticker={ticker}
        currency={currency}
        editingId={rows.editing?.id ?? null}
        confirmingId={rows.confirmingId}
        submitting={lots.submitting}
        onEdit={rows.startEdit}
        onAskDelete={rows.askDelete}
        onCancelDelete={rows.cancelDelete}
        onConfirmDelete={(lotId) => void rows.confirmDelete(lotId)}
      />

      {lots.errorKey && (
        <p role="alert" className="text-sm text-warning">
          {errorText(lots.errorKey)}
        </p>
      )}

      {/* The `key` forces a remount when switching the edited lot (or going back to create). */}
      <PositionLotForm
        key={rows.editing?.id ?? "add"}
        editing={rows.editing}
        currency={currency}
        submitting={lots.submitting}
        onSubmit={(payload) => void rows.submit(payload)}
        onCancelEdit={rows.cancelEdit}
      />
    </div>
  );
}
