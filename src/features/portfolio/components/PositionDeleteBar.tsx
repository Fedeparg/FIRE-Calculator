"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { deletePosition } from "@/features/portfolio/api";
import { useApiMutation } from "@/shared/api/use-api-mutation";
import Button from "@/shared/ui/Button";

type Props = {
  positionId: string;
  /**
   * Deleting a position with sales removes them from the capital gains report: it deserves a
   * stronger warning than the usual "are you sure?". `null` = not known yet (lots loading or
   * failed): we warn anyway, which is the safe choice.
   */
  hasSales: boolean | null;
  /** Opens the position's edit form. */
  onEdit: () => void;
  /** The position has been deleted. */
  onDeleted: (id: string) => void;
};

/** Detail footer: edit the position or delete it (with confirmation). */
export default function PositionDeleteBar({ positionId, hasSales, onEdit, onDeleted }: Props) {
  const tDetail = useTranslations("portfolio.detail");
  const tList = useTranslations("portfolio.list");
  const [confirming, setConfirming] = useState(false);
  // Focus (as in `RowActions`): when deletion is requested it moves to "Confirm"; on cancel it
  // goes back to "Delete". The pressed button disappears on mode change and focus would land on `<body>`.
  const confirmRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  useEffect(() => {
    if (confirming) {
      confirmRef.current?.focus();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      deleteRef.current?.focus();
    }
  }, [confirming]);
  const deletion = useApiMutation();
  const deleting = deletion.status === "pending";

  async function handleDelete() {
    const result = await deletion.run(() => deletePosition(positionId));
    if (result.ok) onDeleted(positionId);
  }

  return (
    <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
      {confirming ? (
        <>
          {hasSales !== false && (
            <p role="alert" className="text-xs text-warning">
              {tList("confirmDeleteWithSales")}
            </p>
          )}
          {deletion.status === "error" && (
            <p role="alert" className="text-xs text-warning">
              {tDetail("deleteError")}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              ref={confirmRef}
              variant="warning"
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="flex-1 h-11"
            >
              {deleting ? tList("deleting") : tList("confirm")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                returnFocus.current = true;
                setConfirming(false);
              }}
              disabled={deleting}
              className="flex-1 h-11"
            >
              {tList("cancel")}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex justify-between">
          <Button variant="ghost" onClick={onEdit} className="h-11">
            {tDetail("editPosition")}
          </Button>
          <button
            ref={deleteRef}
            type="button"
            onClick={() => setConfirming(true)}
            className="h-11 rounded-lg px-3 text-sm font-medium text-danger hover:bg-danger-soft"
          >
            {tDetail("deletePosition")}
          </button>
        </div>
      )}
    </div>
  );
}
