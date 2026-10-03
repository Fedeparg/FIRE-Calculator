"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { SUPPORTED_CURRENCIES, type SupportedCurrency } from "@sextante/core/contracts";
import { trackEvent } from "@/shared/analytics/track";
import { formatDecimalInput } from "@/shared/format/number-input";
import { validatePositionForm } from "@/features/portfolio/model/form-validation";
import { useFormat } from "@/shared/format/use-format";
import { Link } from "@/i18n/navigation";
import { type Position } from "@sextante/core/portfolio/types";
import {
  combinePosition,
  positionConflict,
  positionErrorKey,
  savePosition,
  type PositionErrorKey,
} from "@/features/portfolio/api";
import { useApiMutation } from "@/shared/api/use-api-mutation";
import { useApiErrorText } from "@/shared/api/use-api-error-text";
import PositionFormFields, { type PositionFormValues } from "./PositionFormFields";
import Button from "@/shared/ui/Button";

/** Title id: names the panel that contains the form. */
export const POSITION_FORM_TITLE_ID = "position-form-title";

/**
 * What prevents saving, as ONE union instead of five booleans that could contradict each other:
 * - `duplicate`: on create, that symbol+broker already exists (merging is offered);
 * - `brokerRequired`: the symbol already exists and the broker is missing to tell them apart;
 * - `brokerEmptied`: when editing, an attempt to clear a broker the position already had;
 * - `error`: any other failure, with its message.
 */
type Problem =
  | { kind: "duplicate"; existing: Position }
  | { kind: "brokerRequired" }
  | { kind: "brokerEmptied" }
  | { kind: "error"; key: PositionErrorKey };

/** Problem left by an API failure when saving or merging. */
function problemFromError(error: unknown, isEditing: boolean): Problem {
  // 409: BROKER_REQUIRED and DUPLICATE (create only) have their own reaction; HAS_SALES and the
  // remaining failures surface as a message (session, data, server…).
  const conflict = positionConflict(error);
  if (conflict?.kind === "brokerRequired") return { kind: "brokerRequired" };
  if (conflict?.kind === "duplicate" && !isEditing) return { kind: "duplicate", existing: conflict.existing };
  return { kind: "error", key: positionErrorKey(error) };
}

type Props = {
  /** If a position is given, the form is in edit mode; otherwise, in create mode. */
  editing?: Position | null;
  /** Successful create (201). */
  onCreated: (position: Position) => void;
  /** Successful edit or merge: replaces the existing position in the list. */
  onSaved: (position: Position) => void;
  /** Cancels editing and goes back to create mode. */
  onCancelEdit: () => void;
};

function toCurrency(value: string | undefined): SupportedCurrency {
  return SUPPORTED_CURRENCIES.includes(value as SupportedCurrency) ? (value as SupportedCurrency) : "EUR";
}

/**
 * Position form, reused for create and edit. On create, if the symbol already exists with the
 * same broker, the API responds 409 and we show a warning offering to merge (weighted average)
 * without losing what was typed. The parent's `key` forces a remount when the edited position
 * changes, so the initial state always starts from `editing`.
 */
export default function PositionForm({ editing, onCreated, onSaved, onCancelEdit }: Props) {
  const t = useTranslations("portfolio.form");
  const errorText = useApiErrorText(t);
  const isEditing = Boolean(editing);
  const { decimalSeparator } = useFormat();

  const [values, setValues] = useState<PositionFormValues>({
    ticker: editing?.ticker ?? "",
    name: editing?.name ?? "",
    // `formatDecimalInput` and not `String(n)`: the latter would give "1e-7", which sanitizing would read as 17.
    quantity: editing ? formatDecimalInput(editing.quantity, decimalSeparator) : "",
    avgPrice: editing ? formatDecimalInput(editing.avgPrice, decimalSeparator) : "",
    broker: editing?.broker ?? "",
    currency: toCurrency(editing?.currency),
    assetClass: editing?.assetClass ?? undefined,
  });
  const { ticker, name, quantity, avgPrice, broker, currency, assetClass } = values;
  // Two mutations: save (create or edit) and merge into the duplicate position. The problem
  // is DERIVED from their errors (not copied into other state), except the local validation one.
  const save = useApiMutation();
  const combine = useApiMutation();
  const [brokerEmptied, setBrokerEmptied] = useState(false);
  const saveProblem = save.status === "error" ? problemFromError(save.error, isEditing) : null;
  const problem: Problem | null = brokerEmptied
    ? { kind: "brokerEmptied" }
    : combine.status === "error"
      ? { kind: "error", key: positionErrorKey(combine.error) }
      : saveProblem;
  // The duplicate warning stays visible while merging (and if merging fails).
  const duplicate = saveProblem?.kind === "duplicate" ? saveProblem.existing : null;
  const submitting = save.status === "pending";
  const combining = combine.status === "pending";

  // The broker is optional when adding; the API only requires it if the symbol already exists.
  const amounts = validatePositionForm({ ticker, quantity, avgPrice });

  function resetForm() {
    setValues({ ticker: "", name: "", quantity: "", avgPrice: "", broker: "", currency: "EUR" });
    setBrokerEmptied(false);
    save.reset();
    combine.reset();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBrokerEmptied(false);
    combine.reset();
    // The button is disabled while the form is invalid (and with no active button there is no
    // implicit submit on Enter): this only narrows the types.
    if (!amounts) return;
    // A broker cannot be cleared from a position that already had one (creating allows a
    // position without a broker; removing it later would make the duplicates model ambiguous).
    if (isEditing && Boolean(editing?.broker) && broker.trim() === "") {
      save.reset();
      setBrokerEmptied(true);
      return;
    }
    const payload = {
      ticker: ticker.trim(),
      name: name.trim() || undefined,
      ...amounts,
      broker: broker.trim() || undefined,
      currency,
      assetClass,
    };
    const result = await save.run(() => savePosition(editing?.id ?? null, payload));
    if (!result.ok) return;
    if (editing) {
      onSaved(result.data);
    } else {
      onCreated(result.data);
      resetForm();
      trackEvent({ name: "position-added" });
    }
  }

  /** Merges the current purchase into the colliding existing position (weighted average). */
  async function handleCombine() {
    if (!duplicate || !amounts) return;
    const result = await combine.run(() => combinePosition(duplicate.id, { ...amounts, currency }));
    if (!result.ok) return;
    onSaved(result.data);
    resetForm();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h2 id={POSITION_FORM_TITLE_ID} className="pr-14 text-lg font-semibold text-foreground lg:pr-12">
        {editing ? t("editTitle", { ticker: editing.ticker }) : t("title")}
      </h2>

      <PositionFormFields
        values={values}
        onChange={(patch) => setValues((prev) => ({ ...prev, ...patch }))}
        brokerRequired={problem?.kind === "brokerRequired"}
        brokerEmptied={problem?.kind === "brokerEmptied"}
      />

      {duplicate && (
        <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
          <p className="text-sm text-foreground">
            {t("duplicate", { ticker: duplicate.ticker, broker: duplicate.broker ?? "" })}
          </p>
          <p className="text-xs text-muted">{t("duplicateHint")}</p>
          <Button size="sm" onClick={handleCombine} disabled={combining} className="self-start">
            {combining ? t("combining") : t("combine")}
          </Button>
        </div>
      )}

      {problem?.kind === "error" && (
        <p className="text-sm text-warning">
          {errorText(problem.key)}
          {problem.key === "errorSession" && (
            <>
              {" "}
              <Link href="/entrar" className="font-medium text-brand underline underline-offset-2">
                {t("errorSessionLink")}
              </Link>
            </>
          )}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button size="lg" type="submit" disabled={submitting || combining || !amounts}>
          {isEditing ? (submitting ? t("saving") : t("save")) : submitting ? t("submitting") : t("submit")}
        </Button>
        {isEditing && (
          <Button variant="secondary" size="lg" onClick={onCancelEdit}>
            {t("cancel")}
          </Button>
        )}
      </div>
    </form>
  );
}
