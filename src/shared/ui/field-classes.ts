/**
 * Form control classes. Two variants on purpose:
 * - `fieldClass`: calculator fields (`NumberField`, `SelectField`), on the `bg-surface`
 *   panel, so the background blends into it.
 * - `inputClass`: standalone inputs (portfolio, scenarios), which sit on `bg-background`
 *   or on a card and need the contrast of the base background. It sets no text size:
 *   each call site adds `text-sm` if it needs it.
 */
export const fieldClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground outline-hidden transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20";

export const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-hidden focus:border-brand focus:ring-2 focus:ring-brand/30";
