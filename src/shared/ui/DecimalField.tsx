"use client";

import { useState } from "react";

import { formatDecimalInput, sanitizeDecimalInput } from "@/shared/format/number-input";
import { useFormat } from "@/shared/format/use-format";
import { inputClass } from "@/shared/ui/field-classes";

import type { FormControlProps } from "@/shared/ui/FormField";

type Props = FormControlProps & {
  /** Text as typed (with the user's separator); parsed with `parseDecimalInput`. */
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  className?: string;
};

/**
 * Amount or quantity input: `type="text"` + `inputMode="decimal"` (a `type="number"` loses the
 * comma of the Spanish mobile keyboard) and sanitized on every keystroke (`sanitizeDecimalInput`).
 */
export default function DecimalField({ value, onChange, placeholder = "0", className = inputClass, ...rest }: Props) {
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value}
      onChange={(event) => onChange(sanitizeDecimalInput(event.target.value))}
      placeholder={placeholder}
      className={className}
    />
  );
}

/**
 * Text state of a `DecimalField` prefilled with a number. Uses `formatDecimalInput` rather than
 * `String(n)`: the latter would give "1e-7", which sanitizing would read as 17, and would write
 * a decimal point even when the user types with a comma. `null`/`undefined` start empty.
 */
export function useDecimalText(initial: number | null | undefined) {
  const { decimalSeparator } = useFormat();
  // The lazy initializer only runs on mount: the locale's separator does not change without a remount.
  return useState(() =>
    initial === null || initial === undefined ? "" : formatDecimalInput(initial, decimalSeparator),
  );
}
