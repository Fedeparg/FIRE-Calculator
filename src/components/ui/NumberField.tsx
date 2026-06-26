"use client";

import { useId, useState } from "react";
import HelpTooltip from "./HelpTooltip";

type Props = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  help?: string;
};

/**
 * Quita ceros a la izquierda al escribir ("0300" → "300"), pero conserva el
 * cero de los decimales ("0.5") y el "0" solo.
 */
function stripLeadingZeros(raw: string): string {
  return raw.replace(/^0+(?=\d)/, "");
}

export default function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  help,
}: Props) {
  const id = useId();
  // Estado de texto interno: permite el campo vacío mientras se edita (sin
  // forzar un "0" que dejaría ceros feos a la izquierda).
  const [text, setText] = useState(() => String(value));

  function handleChange(raw: string) {
    const next = stripLeadingZeros(raw);
    setText(next);
    const parsed = next === "" || next === "." ? 0 : Number(next);
    onChange(Number.isFinite(parsed) ? parsed : 0);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {help && <HelpTooltip text={help} />}
      </div>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={text}
        min={min}
        max={max}
        step={step}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => setText(String(value))}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
    </div>
  );
}
