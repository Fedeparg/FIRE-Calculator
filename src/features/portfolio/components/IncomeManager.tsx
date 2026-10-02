"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import type { IncomeEvent, IncomePayload } from "@sextante/core/fiscal/income";
import type { ApiErrorKey } from "@/shared/api/client";
import IncomeForm from "./IncomeForm";
import IncomeList from "./IncomeList";

type Props = {
  income: readonly IncomeEvent[];
  defaults: React.ComponentProps<typeof IncomeForm>["defaults"];
  submitting: boolean;
  errorKey: ApiErrorKey | null;
  save: (incomeId: string | null, payload: IncomePayload) => Promise<boolean>;
  remove: (incomeId: string) => Promise<boolean>;
};

/** Lista de cobros con su formulario de alta y edición; lo comparten el panel de la posición y la pestaña fiscal. */
export default function IncomeManager({ income, defaults, submitting, errorKey, save, remove }: Props) {
  const t = useTranslations("portfolio.income");
  const [editing, setEditing] = useState<IncomeEvent | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  async function handleSubmit(payload: IncomePayload) {
    if (await save(editing?.id ?? null, payload)) setEditing(null);
  }

  async function handleDelete(id: string) {
    const ok = await remove(id);
    setConfirmingId(null);
    if (ok && editing?.id === id) setEditing(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <IncomeList
        income={income}
        editingId={editing?.id ?? null}
        confirmingId={confirmingId}
        submitting={submitting}
        onEdit={setEditing}
        onAskDelete={setConfirmingId}
        onCancelDelete={() => setConfirmingId(null)}
        onConfirmDelete={(id) => void handleDelete(id)}
      />
      {errorKey && (
        <p role="alert" className="text-sm text-warning">
          {t(errorKey)}
        </p>
      )}
      {/* El `key` fuerza un remount al cambiar de cobro editado (o volver al alta). */}
      <IncomeForm
        key={editing?.id ?? "add"}
        editing={editing}
        defaults={defaults}
        submitting={submitting}
        onSubmit={(payload) => void handleSubmit(payload)}
        onCancelEdit={() => setEditing(null)}
      />
    </div>
  );
}
