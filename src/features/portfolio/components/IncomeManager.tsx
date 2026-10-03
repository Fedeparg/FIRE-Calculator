"use client";

import { useTranslations } from "next-intl";

import type { IncomeEvent, IncomePayload } from "@sextante/core/fiscal/income";
import type { ApiErrorKey } from "@/shared/api/client";
import { useEditableCollection } from "@/shared/ui/use-editable-collection";
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
  const rows = useEditableCollection<IncomeEvent, IncomePayload>({ save, remove });

  return (
    <div className="flex flex-col gap-4">
      <IncomeList
        income={income}
        editingId={rows.editing?.id ?? null}
        confirmingId={rows.confirmingId}
        submitting={submitting}
        onEdit={rows.startEdit}
        onAskDelete={rows.askDelete}
        onCancelDelete={rows.cancelDelete}
        onConfirmDelete={(id) => void rows.confirmDelete(id)}
      />
      {errorKey && (
        <p role="alert" className="text-sm text-warning">
          {t(errorKey)}
        </p>
      )}
      {/* El `key` fuerza un remount al cambiar de cobro editado (o volver al alta). */}
      <IncomeForm
        key={rows.editing?.id ?? "add"}
        editing={rows.editing}
        defaults={defaults}
        submitting={submitting}
        onSubmit={(payload) => void rows.submit(payload)}
        onCancelEdit={rows.cancelEdit}
      />
    </div>
  );
}
