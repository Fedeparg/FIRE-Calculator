"use client";

import { useId, type ReactNode } from "react";

/** What the field passes to its control so it is wired to the label, hint and error. */
export type FormControlProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
};

type Props = {
  label: ReactNode;
  /** Hint below the control (grey). */
  hint?: ReactNode;
  /** Error below the control (warning). Marks the control as `aria-invalid`. */
  error?: ReactNode;
  /**
   * The control, as a function: it receives the `id` and the ARIA references to set on its
   * `<input>`/`<select>`. It is a "render prop": the field does not need to know which control
   * it renders or to clone it, and the control can be anything (including a custom combobox).
   */
  children: (control: FormControlProps) => ReactNode;
};

/**
 * Form field with label, hint and error wired by id. The id comes from `useId`: unique per
 * instance and stable between server and client, so two identical forms on the same page (e.g.
 * create and edit) neither share an `id` nor steal each other's label.
 */
export default function FormField({ label, hint, error, children }: Props) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children({ id, "aria-describedby": describedBy, ...(error ? { "aria-invalid": true } : {}) })}
      {hint && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-warning">
          {error}
        </p>
      )}
    </div>
  );
}
