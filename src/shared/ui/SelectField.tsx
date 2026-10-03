"use client";

import { useId } from "react";
import { fieldClass } from "./field-classes";
import HelpTooltip from "./HelpTooltip";

/**
 * A dropdown option. `disabled` shows options that exist but cannot be chosen (e.g.
 * unsupported foral territories, the Basque Country and Navarre), instead of silently omitting
 * them.
 */
type Option<T extends string> = { value: T; label: string; disabled?: boolean };

type Props<T extends string> = {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  help?: string;
};

/**
 * Generic labelled dropdown (frequency, CCAA — autonomous community, etc.). It is generic over
 * the value type (`T extends string`), so typed unions (`Frequency`, `ContractType`…) stay
 * type-safe end to end and callers need no casts.
 */
export default function SelectField<T extends string = string>({ label, value, options, onChange, help }: Props<T>) {
  const id = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {help && <HelpTooltip text={help} />}
      </div>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} className={fieldClass}>
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
