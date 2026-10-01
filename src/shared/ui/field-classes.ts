/**
 * Clases de los controles de formulario. Dos variantes a propósito:
 * - `fieldClass`: campos de las calculadoras (`NumberField`, `SelectField`), sobre el
 *   panel `bg-surface`, así que el fondo se funde con él.
 * - `inputClass`: inputs sueltos (cartera, escenarios), que van sobre `bg-background`
 *   o sobre una tarjeta y necesitan el contraste del fondo base. No lleva tamaño de
 *   texto: cada sitio añade `text-sm` si lo necesita.
 */
export const fieldClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20";

export const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";
