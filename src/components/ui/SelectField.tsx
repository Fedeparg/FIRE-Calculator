"use client";

import { useId } from "react";
import HelpTooltip from "./HelpTooltip";

/**
 * Una opción del desplegable. `disabled` permite mostrar opciones que existen
 * pero no se pueden elegir (p. ej. territorios forales sin soporte), en vez de
 * omitirlas en silencio.
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
 * Desplegable etiquetado genérico (frecuencia, CCAA, etc.). Es genérico en el
 * tipo del valor (`T extends string`), de modo que las uniones tipadas
 * (`Frequency`, `ContractType`…) viajan con seguridad de tipos extremo a extremo
 * y no hacen falta casts en quien lo usa.
 */
export default function SelectField<T extends string = string>({
  label,
  value,
  options,
  onChange,
  help,
}: Props<T>) {
  const id = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {help && <HelpTooltip text={help} />}
      </div>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
