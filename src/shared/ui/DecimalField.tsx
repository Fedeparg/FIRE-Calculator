"use client";

import { useState } from "react";

import { formatDecimalInput, sanitizeDecimalInput } from "@/shared/format/number-input";
import { useFormat } from "@/shared/format/use-format";
import { inputClass } from "@/shared/ui/field-classes";

import type { FormControlProps } from "@/shared/ui/FormField";

type Props = FormControlProps & {
  /** Texto tal como se teclea (con el separador del usuario); se parsea con `parseDecimalInput`. */
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  className?: string;
};

/**
 * Input de importe o cantidad: `type="text"` + `inputMode="decimal"` (un `type="number"` pierde
 * la coma del teclado móvil en español) y saneado en cada pulsación (`sanitizeDecimalInput`).
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
 * Estado del texto de un `DecimalField` precargado con un número. Usa `formatDecimalInput` y no
 * `String(n)`: este daría "1e-7", que el saneado leería como 17, y escribiría el punto decimal
 * aunque el usuario teclee con coma. `null`/`undefined` empiezan vacíos.
 */
export function useDecimalText(initial: number | null | undefined) {
  const { decimalSeparator } = useFormat();
  // El inicializador perezoso solo corre al montar: el separador del idioma no cambia sin remontar.
  return useState(() =>
    initial === null || initial === undefined ? "" : formatDecimalInput(initial, decimalSeparator),
  );
}
