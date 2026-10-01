"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { SUPPORTED_CURRENCIES, type SupportedCurrency } from "@sextante/core/contracts";
import { trackEvent } from "@/shared/analytics/track";
import { parseDecimalInput } from "@/shared/format/number-input";
import { Link } from "@/i18n/navigation";
import { type Position } from "@sextante/core/portfolio/types";
import {
  combinePosition,
  positionConflict,
  positionErrorKey,
  savePosition,
  type PositionErrorKey,
} from "@/features/portfolio/api";
import PositionFormFields, { type PositionFormValues } from "./PositionFormFields";
import Button from "@/shared/ui/Button";

/** Id del título: da nombre al panel que contiene el formulario. */
export const POSITION_FORM_TITLE_ID = "position-form-title";

type Status = "idle" | "submitting" | "combining";

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

  const [values, setValues] = useState<PositionFormValues>({
    ticker: editing?.ticker ?? "",
    name: editing?.name ?? "",
    quantity: editing ? String(editing.quantity) : "",
    avgPrice: editing ? String(editing.avgPrice) : "",
    broker: editing?.broker ?? "",
    currency: toCurrency(editing?.currency),
  });
  const { ticker, name, quantity, avgPrice, broker, currency } = values;
  const [status, setStatus] = useState<Status>("idle");
  const [errorKey, setErrorKey] = useState<PositionErrorKey | null>(null);
  // En alta: posición existente que colisiona (símbolo+bróker), para ofrecer combinar.
  const [duplicate, setDuplicate] = useState<Position | null>(null);
  // El símbolo ya existe y el bróker está vacío: hay que indicar uno para distinguirlo.
  const [brokerRequired, setBrokerRequired] = useState(false);
  // Al editar, intento de vaciar un bróker que la posición ya tenía (no se permite).
  const [brokerEmptied, setBrokerEmptied] = useState(false);

  const quantityNum = parseDecimalInput(quantity) ?? NaN;
  const avgPriceNum = parseDecimalInput(avgPrice) ?? NaN;
  // El bróker es opcional al añadir; la API lo exige solo si el símbolo ya existe.
  const isValid =
    ticker.trim().length > 0 &&
    Number.isFinite(quantityNum) &&
    quantityNum > 0 &&
    Number.isFinite(avgPriceNum) &&
    avgPriceNum >= 0;

  function resetForm() {
    setValues({ ticker: "", name: "", quantity: "", avgPrice: "", broker: "", currency: "EUR" });
    setDuplicate(null);
    setBrokerRequired(false);
    setBrokerEmptied(false);
    setErrorKey(null);
    setStatus("idle");
  }

  const payload = () => ({
    ticker: ticker.trim(),
    name: name.trim() || undefined,
    quantity: quantityNum,
    avgPrice: avgPriceNum,
    broker: broker.trim() || undefined,
    currency,
  });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorKey(null);
    setDuplicate(null);
    setBrokerRequired(false);
    setBrokerEmptied(false);
    if (!isValid) {
      setErrorKey("errorInvalid");
      return;
    }
    // No se puede vaciar el bróker de una posición que ya lo tenía (el alta sí permite
    // crearla sin bróker; quitarlo después haría ambiguo el modelo de duplicados).
    if (isEditing && Boolean(editing?.broker) && broker.trim() === "") {
      setBrokerEmptied(true);
      return;
    }
    setStatus("submitting");
    try {
      const saved = await savePosition(editing?.id ?? null, payload());
      if (editing) {
        onSaved(saved);
      } else {
        onCreated(saved);
        resetForm();
        trackEvent({ name: "position-added" });
      }
    } catch (error) {
      // 409: BROKER_REQUIRED y DUPLICATE (solo en alta) tienen su propia reacción; HAS_SALES
      // y el resto de fallos salen como mensaje (sesión, datos, servidor…).
      const conflict = positionConflict(error);
      if (conflict?.kind === "brokerRequired") setBrokerRequired(true);
      else if (conflict?.kind === "duplicate" && !isEditing) setDuplicate(conflict.existing);
      else setErrorKey(positionErrorKey(error));
    }
    setStatus("idle");
  }

  /** Combina la compra actual con la posición existente que colisiona (media ponderada). */
  async function handleCombine() {
    if (!duplicate) return;
    setStatus("combining");
    setErrorKey(null);
    try {
      const merged = await combinePosition(duplicate.id, { quantity: quantityNum, avgPrice: avgPriceNum, currency });
      onSaved(merged);
      resetForm();
      return;
    } catch (error) {
      setErrorKey(positionErrorKey(error));
    }
    setStatus("idle");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h2 id={POSITION_FORM_TITLE_ID} className="pr-14 text-lg font-semibold text-foreground lg:pr-12">
        {isEditing ? t("editTitle", { ticker: editing!.ticker }) : t("title")}
      </h2>

      <PositionFormFields
        values={values}
        onChange={(patch) => setValues((prev) => ({ ...prev, ...patch }))}
        brokerRequired={brokerRequired}
        brokerEmptied={brokerEmptied}
      />

      {duplicate && (
        <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
          <p className="text-sm text-foreground">
            {t("duplicate", { ticker: duplicate.ticker, broker: duplicate.broker ?? "" })}
          </p>
          <p className="text-xs text-muted">{t("duplicateHint")}</p>
          <Button size="sm" onClick={handleCombine} disabled={status === "combining"} className="self-start">
            {status === "combining" ? t("combining") : t("combine")}
          </Button>
        </div>
      )}

      {errorKey && (
        <p className="text-sm text-warning">
          {t(errorKey)}
          {errorKey === "errorSession" && (
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
        <Button size="lg" type="submit" disabled={status !== "idle" || !isValid}>
          {isEditing
            ? status === "submitting"
              ? t("saving")
              : t("save")
            : status === "submitting"
              ? t("submitting")
              : t("submit")}
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
