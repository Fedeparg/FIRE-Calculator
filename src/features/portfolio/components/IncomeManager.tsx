"use client";

import { useTranslations } from "next-intl";

import type { IncomeEvent, IncomePayload } from "@sextante/core/fiscal/income";
import type { ApiErrorKey } from "@/shared/api/client";
import { useApiErrorText } from "@/shared/api/use-api-error-text";
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

/** Income list with its create/edit form; shared by the position panel and the tax tab. */
export default function IncomeManager({ income, defaults, submitting, errorKey, save, remove }: Props) {
  const t = useTranslations("portfolio.income");
  const errorText = useApiErrorText(t);
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
          {errorText(errorKey)}
        </p>
      )}
      {/* The `key` forces a remount when switching the edited entry (or going back to create). */}
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
