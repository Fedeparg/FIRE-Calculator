"use client";

import { useTranslations } from "next-intl";

import NumberField from "@/shared/ui/NumberField";

import { useCalculatorSlug, type FieldBinding } from "./CalculatorState";

type Props = {
  field: FieldBinding<number>;
  min?: number;
  max?: number;
  step?: number;
  hideLabel?: boolean;
};

/**
 * `NumberField` de una calculadora a partir de su campo enlazado. Etiqueta y ayuda salen por
 * convención del namespace de la calculadora (`calc.<slug>`): `t(clave)` y `t("help." + clave)`,
 * con la clave de URL del campo. La ayuda es opcional: si la clave no existe, no se pinta.
 *
 * Si una calculadora necesita una etiqueta que no sigue la convención (otro namespace, texto con
 * argumentos), sigue usando `NumberField` directamente.
 */
export default function NumField({ field, min, max, step, hideLabel }: Props) {
  const calculatorSlug = useCalculatorSlug();
  const t = useTranslations(`calc.${calculatorSlug}`);
  const helpKey = `help.${field.key}`;

  return (
    <NumberField
      label={t(field.key)}
      value={field.value}
      onChange={field.set}
      min={min}
      max={max}
      step={step}
      help={t.has(helpKey) ? t(helpKey) : undefined}
      hideLabel={hideLabel}
    />
  );
}
