"use client";

import { useState } from "react";

type Options<P> = {
  /** Alta (`id === null`) o edición. `true` si la API lo aceptó. */
  save: (id: string | null, payload: P) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
};

/**
 * Estado de una lista editable con un formulario de alta/edición y borrado con confirmación
 * (lotes, cobros). Lo que se repetía en cada panel: qué elemento se edita, cuál pide confirmar
 * su borrado, y qué hacer al terminar (cerrar la edición si se guardó o si se borró el elemento
 * que se estaba editando). Las mutaciones y sus errores los pone quien llama.
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
    /** Guarda el formulario: alta si no se edita nada; si la API lo acepta, vuelve al alta. */
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
