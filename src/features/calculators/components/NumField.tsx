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
 * A calculator's `NumberField`, built from its bound field. By convention the label and help come
 * from the calculator's namespace (`calc.<slug>`): `t(key)` and `t("help." + key)`, using the
 * field's URL key. Help is optional: if the key does not exist, nothing is rendered.
 *
 * A calculator that needs a label outside this convention (another namespace, text with
 * arguments) keeps using `NumberField` directly.
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
