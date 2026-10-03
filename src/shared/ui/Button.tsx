import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "accent" | "warning" | "danger" | "dangerOutline" | "ghost";
type Size = "xs" | "sm" | "md" | "lg" | "cta";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-brand-fg hover:opacity-90",
  /** Neutral bordered action. */
  secondary: "border border-border text-foreground hover:bg-surface-2",
  /** Secondary action highlighted with the brand color (e.g. "Save scenario"). */
  accent: "border border-border text-brand hover:bg-brand-soft",
  /** Confirmation of a destructive action already requested (e.g. "Are you sure?"). */
  warning: "bg-warning text-brand-fg hover:opacity-90",
  /** Final destructive action. */
  danger: "bg-danger text-danger-fg hover:opacity-90",
  dangerOutline: "border border-danger-border text-danger hover:bg-danger-soft",
  ghost: "text-foreground hover:bg-surface-2",
};

const SIZES: Record<Size, string> = {
  xs: "rounded-md px-2.5 py-1 text-xs font-medium",
  sm: "rounded-lg px-3 py-1.5 text-sm font-medium",
  md: "rounded-lg px-3 py-2 text-sm font-medium",
  // No text size: inherits the form's (16 px), like submit buttons.
  lg: "rounded-lg px-4 py-2.5 font-medium",
  cta: "rounded-xl px-5 py-3 text-sm font-semibold",
};

type Props = ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
};

/**
 * Standard text button. Gathers the variants that used to be copied by hand into each
 * component. `type="button"` by default: a `<button>` inside a `<form>` submits the form unless
 * told otherwise, and almost no button in this app should (submit buttons pass
 * `type="submit"` explicitly).
 *
 * `className` is only for additions (width, alignment, margin): it does not override the
 * variant's padding or color, because there is no `tailwind-merge`.
 *
 * Icon buttons, toggles and chart controls do NOT go through here: they have their own shape
 * and a forced variant would distort them.
 */
export default function Button({ variant = "primary", size = "md", type = "button", className, ...rest }: Props) {
  return (
    <button
      type={type}
      className={`transition disabled:cursor-not-allowed disabled:opacity-50 ${SIZES[size]} ${VARIANTS[variant]}${className ? ` ${className}` : ""}`}
      {...rest}
    />
  );
}
