"use client";

import { useEffect, useRef } from "react";

import Button from "@/shared/ui/Button";

/** Action texts. The `*Label` ones are the accessible name, including the row's item. */
export type RowActionsLabels = {
  edit: string;
  delete: string;
  confirm: string;
  cancel: string;
  /** e.g. "Edit Purchase · 01/03/2025": the screen reader knows WHICH row is being edited. */
  editLabel: string;
  deleteLabel: string;
  confirmLabel: string;
};

type Props = {
  labels: RowActionsLabels;
  /** The row is asking for delete confirmation. */
  confirming: boolean;
  /** A mutation is in flight: the confirmation buttons are disabled. */
  busy: boolean;
  onEdit: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
};

const linkButton = "rounded-md px-2 py-1.5 font-medium hover:bg-surface-2 hover:text-foreground";

/**
 * Edit and delete (with confirmation) for a list row.
 *
 * Accessibility: each button carries its row's name (without it, a list of lots would read
 * "Edit, Edit, Edit"). On a delete request, focus moves to the confirm button; on cancel, it
 * returns to the delete button. Otherwise focus would fall to `<body>`, because the clicked
 * button leaves the DOM when the mode changes, and keyboard users would lose their place.
 */
export default function RowActions({
  labels,
  confirming,
  busy,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  // Focus is only returned after CANCEL (not when the row mounts or after a failed delete).
  const returnFocus = useRef(false);

  // An effect rather than handler code: the target button does not exist yet at click time, only
  // after the render that switches mode.
  useEffect(() => {
    if (confirming) {
      confirmRef.current?.focus();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      deleteRef.current?.focus();
    }
  }, [confirming]);

  if (confirming) {
    return (
      <span className="flex shrink-0 gap-2">
        <Button
          ref={confirmRef}
          variant="warning"
          size="xs"
          onClick={onConfirmDelete}
          disabled={busy}
          aria-label={labels.confirmLabel}
        >
          {labels.confirm}
        </Button>
        <Button
          variant="secondary"
          size="xs"
          onClick={() => {
            returnFocus.current = true;
            onCancelDelete();
          }}
          disabled={busy}
        >
          {labels.cancel}
        </Button>
      </span>
    );
  }

  return (
    <span className="flex shrink-0 gap-1">
      <button type="button" onClick={onEdit} aria-label={labels.editLabel} className={linkButton}>
        {labels.edit}
      </button>
      <button
        type="button"
        ref={deleteRef}
        onClick={onAskDelete}
        aria-label={labels.deleteLabel}
        className={linkButton}
      >
        {labels.delete}
      </button>
    </span>
  );
}
