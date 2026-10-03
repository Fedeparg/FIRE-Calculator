"use client";

import { useState } from "react";

type Options<P> = {
  /** Create (`id === null`) or update. `true` if the API accepted it. */
  save: (id: string | null, payload: P) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
};

/**
 * State of an editable list with a create/edit form and delete-with-confirmation (lots,
 * income). What every panel used to repeat: which item is being edited, which one is awaiting
 * delete confirmation, and what to do afterwards (close the editor on save, or when the item
 * being edited is deleted). The caller supplies the mutations and their errors.
 */
export function useEditableCollection<T extends { id: string }, P>({ save, remove }: Options<P>) {
  const [editing, setEditing] = useState<T | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  return {
    editing,
    confirmingId,
    startEdit: (item: T) => setEditing(item),
    cancelEdit: () => setEditing(null),
    askDelete: (id: string) => setConfirmingId(id),
    cancelDelete: () => setConfirmingId(null),
    /** Submits the form: creates if nothing is being edited; on success, returns to create mode. */
    async submit(payload: P): Promise<void> {
      if (await save(editing?.id ?? null, payload)) setEditing(null);
    },
    async confirmDelete(id: string): Promise<void> {
      const ok = await remove(id);
      setConfirmingId(null);
      if (ok && editing?.id === id) setEditing(null);
    },
  };
}
