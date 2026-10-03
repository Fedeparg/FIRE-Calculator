"use client";

import { useId, type ReactNode } from "react";

/** Lo que el campo le pasa a su control para quedar enlazado con la etiqueta, la ayuda y el error. */
export type FormControlProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
};

type Props = {
  label: ReactNode;
  /** Ayuda bajo el control (gris). */
  hint?: ReactNode;
  /** Error bajo el control (aviso). Marca el control como `aria-invalid`. */
  error?: ReactNode;
  /**
   * El control, como función: recibe el `id` y las referencias ARIA que debe poner en su
   * `<input>`/`<select>`. Es un "render prop": así el campo no necesita saber qué control
   * pinta ni clonarlo, y el control puede ser cualquiera (incluido un combobox propio).
   */
  children: (control: FormControlProps) => ReactNode;
};

/**
 * Campo de formulario con etiqueta, ayuda y error enlazados por id. El id sale de `useId`: es
 * único por instancia y estable entre servidor y cliente, así que dos formularios iguales en la
 * misma página (p. ej. el de alta y el de edición) no comparten `id` ni se roban la etiqueta.
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
