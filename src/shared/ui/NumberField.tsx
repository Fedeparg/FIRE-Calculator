"use client";

import { useId, useState, type KeyboardEvent } from "react";

import {
  addStep,
  clampNumber,
  formatDecimalInput,
  parseDecimalInput,
  sanitizeDecimalInput,
  stripLeadingZeros,
} from "@/shared/format/number-input";
import { useFormat } from "@/shared/format/use-format";
import { fieldClass } from "./field-classes";
import HelpTooltip from "./HelpTooltip";

type Props = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  help?: string;
  /**
   * Hides the label visually (it stays in the DOM and remains the input's accessible name).
   * For repeated rows where the label is already shown once in the header: avoids repeating it
   * on screen without leaving the field nameless for screen readers.
   */
  hideLabel?: boolean;
};

/**
 * Numeric field with a decimal keyboard on mobile.
 *
 * It is `type="text"` on purpose, not `type="number"`: a Spanish mobile decimal keyboard offers
 * a comma, and `type="number"` drops anything that is not a number with a point, so the comma
 * never reached the handler and decimals could not be typed. In exchange we lose the native
 * spinner arrows, which are reimplemented here; as there, `min`/`max` drive the arrows, not what
 * is typed.
 */
export default function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  help,
  hideLabel = false,
}: Props) {
  const id = useId();
  const { decimalSeparator } = useFormat();
  // Internal text state: allows an empty field while editing (without forcing a
  // "0" that would leave ugly leading zeros) and keeps the separator exactly as
  // the user types it.
  const [text, setText] = useState(() => formatDecimalInput(value, decimalSeparator));
  // Last `value` seen. If it changes from OUTSIDE (a shared link, a loaded scenario), the text
  // is resynced; if it is the echo of what was just typed ("3," already means 3), the typed text
  // is kept. This is React's pattern for adjusting state when a prop changes: compare during
  // render, without an effect that would paint the stale text first.
  const [syncedValue, setSyncedValue] = useState(value);
  if (!Object.is(value, syncedValue)) {
    setSyncedValue(value);
    if (!Object.is(parseDecimalInput(text) ?? 0, value)) setText(formatDecimalInput(value, decimalSeparator));
  }

  function handleChange(raw: string) {
    const next = stripLeadingZeros(sanitizeDecimalInput(raw));
    setText(next);
    onChange(parseDecimalInput(next) ?? 0);
  }

  /**
   * On blur, the text is resynced with the number ("3," → "3", "" → "0"). It is not clamped to
   * [min, max]: `type="number"` did not clamp typed input either, and some rates are legitimately
   * negative despite the default `min = 0` (a losing year, deflation). The bounds only drive
   * the arrows, like the native spinner.
   */
  function handleBlur() {
    const parsed = parseDecimalInput(text) ?? 0;
    if (parsed !== value) onChange(parsed);
    setText(formatDecimalInput(parsed, decimalSeparator));
  }

  /** Replaces the native spinner arrows, which `type="text"` lacks. */
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();

    const current = parseDecimalInput(text) ?? 0;
    const next = clampNumber(addStep(current, event.key === "ArrowUp" ? step : -step), min, max);
    setText(formatDecimalInput(next, decimalSeparator));
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <label htmlFor={id} className={hideLabel ? "sr-only" : "text-sm font-medium text-foreground"}>
          {label}
        </label>
        {help && <HelpTooltip text={help} />}
      </div>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        role="spinbutton"
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={fieldClass}
      />
    </div>
  );
}
