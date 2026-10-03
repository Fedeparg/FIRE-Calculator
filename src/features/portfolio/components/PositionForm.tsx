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
import PositionFormFields, { type PositionFormValues } from "./PositionFormFields";
import Button from "@/shared/ui/Button";

/** Id del título: da nombre al panel que contiene el formulario. */
export const POSITION_FORM_TITLE_ID = "position-form-title";

/**
 * Lo que impide guardar, como UNA unión en vez de cinco booleanos que podían contradecirse:
 * - `duplicate`: en alta, ya existe ese símbolo+bróker (se ofrece combinar);
 * - `brokerRequired`: el símbolo ya existe y falta el bróker para distinguirlo;
 * - `brokerEmptied`: al editar, se intenta vaciar un bróker que la posición ya tenía;
 * - `error`: cualquier otro fallo, con su mensaje.
 */
type Problem =
  | { kind: "duplicate"; existing: Position }
  | { kind: "brokerRequired" }
  | { kind: "brokerEmptied" }
  | { kind: "error"; key: PositionErrorKey };

/** Problema que deja un fallo de la API al guardar o al combinar. */
function problemFromError(error: unknown, isEditing: boolean): Problem {
  // 409: BROKER_REQUIRED y DUPLICATE (solo en alta) tienen su propia reacción; HAS_SALES y el
  // resto de fallos salen como mensaje (sesión, datos, servidor…).
  const conflict = positionConflict(error);
  if (conflict?.kind === "brokerRequired") return { kind: "brokerRequired" };
  if (conflict?.kind === "duplicate" && !isEditing) return { kind: "duplicate", existing: conflict.existing };
  return { kind: "error", key: positionErrorKey(error) };
}

type Props = {
  /** Si viene una posición, el formulario está en modo edición; si no, en modo alta. */
  editing?: Position | null;
  /** Alta correcta (201). */
  onCreated: (position: Position) => void;
  /** Edición o combinación correctas: reemplaza la posición existente en la lista. */
  onSaved: (position: Position) => void;
  /** Cancelar la edición y volver al modo alta. */
  onCancelEdit: () => void;
};

function toCurrency(value: string | undefined): SupportedCurrency {
  return SUPPORTED_CURRENCIES.includes(value as SupportedCurrency) ? (value as SupportedCurrency) : "EUR";
}

/**
 * Formulario de posición, reutilizado para alta y edición. En alta, si el símbolo ya
 * existe con el mismo bróker, la API responde 409 y mostramos un aviso con la opción de
 * combinar (media ponderada) sin perder lo escrito. El `key` del padre fuerza un remount
 * al cambiar de posición editada, así que el estado inicial siempre parte de `editing`.
 */
export default function PositionForm({ editing, onCreated, onSaved, onCancelEdit }: Props) {
  const t = useTranslations("portfolio.form");
  const isEditing = Boolean(editing);
  const { decimalSeparator } = useFormat();

  const [values, setValues] = useState<PositionFormValues>({
    ticker: editing?.ticker ?? "",
    name: editing?.name ?? "",
    // `formatDecimalInput` y no `String(n)`: este daría "1e-7", que el saneado leería como 17.
    quantity: editing ? formatDecimalInput(editing.quantity, decimalSeparator) : "",
    avgPrice: editing ? formatDecimalInput(editing.avgPrice, decimalSeparator) : "",
    broker: editing?.broker ?? "",
    currency: toCurrency(editing?.currency),
    assetClass: editing?.assetClass ?? undefined,
  });
  const { ticker, name, quantity, avgPrice, broker, currency, assetClass } = values;
  // Dos mutaciones: guardar (alta o edición) y combinar con la posición duplicada. El problema
  // se DERIVA de sus errores (no se copia a otro estado), salvo el de validación local.
  const save = useApiMutation();
  const combine = useApiMutation();
  const [brokerEmptied, setBrokerEmptied] = useState(false);
  const saveProblem = save.status === "error" ? problemFromError(save.error, isEditing) : null;
  const problem: Problem | null = brokerEmptied
    ? { kind: "brokerEmptied" }
    : combine.status === "error"
      ? { kind: "error", key: positionErrorKey(combine.error) }
      : saveProblem;
  // El aviso de duplicado sigue a la vista mientras se combina (y si combinar falla).
  const duplicate = saveProblem?.kind === "duplicate" ? saveProblem.existing : null;
  const submitting = save.status === "pending";
  const combining = combine.status === "pending";

  // El bróker es opcional al añadir; la API lo exige solo si el símbolo ya existe.
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
    // El botón está deshabilitado mientras no es válido (y sin botón activo no hay envío
    // implícito con Enter): esto solo estrecha los tipos.
    if (!amounts) return;
    // No se puede vaciar el bróker de una posición que ya lo tenía (el alta sí permite
    // crearla sin bróker; quitarlo después haría ambiguo el modelo de duplicados).
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

  /** Combina la compra actual con la posición existente que colisiona (media ponderada). */
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
        {isEditing ? t("editTitle", { ticker: editing!.ticker }) : t("title")}
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
          {t(problem.key)}
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
