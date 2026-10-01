import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "accent" | "warning" | "danger" | "dangerOutline" | "ghost";
type Size = "xs" | "sm" | "md" | "lg" | "cta";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-brand-fg hover:opacity-90",
  /** Acción neutra con borde. */
  secondary: "border border-border text-foreground hover:bg-surface-2",
  /** Acción secundaria que destaca con el color de marca (p. ej. "Guardar escenario"). */
  accent: "border border-border text-brand hover:bg-brand-soft",
  /** Confirmación de una acción destructiva ya pedida (p. ej. "¿Seguro?"). */
  warning: "bg-warning text-brand-fg hover:opacity-90",
  /** Acción destructiva definitiva. */
  danger: "bg-danger text-danger-fg hover:opacity-90",
  dangerOutline: "border border-danger-border text-danger hover:bg-danger-soft",
  ghost: "text-foreground hover:bg-surface-2",
};

const SIZES: Record<Size, string> = {
  xs: "rounded-md px-2.5 py-1 text-xs font-medium",
  sm: "rounded-lg px-3 py-1.5 text-sm font-medium",
  md: "rounded-lg px-3 py-2 text-sm font-medium",
  // Sin tamaño de texto: hereda el del formulario (16 px), como los botones de envío.
  lg: "rounded-lg px-4 py-2.5 font-medium",
  cta: "rounded-xl px-5 py-3 text-sm font-semibold",
};

type Props = ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
};

/**
 * Botón de texto estándar. Reúne las variantes que antes se copiaban a mano en cada
 * componente. `type="button"` por defecto: un `<button>` dentro de un `<form>` envía el
 * formulario si no se indica otra cosa, y casi ningún botón de esta app debe hacerlo
 * (los de envío pasan `type="submit"` explícitamente).
 *
 * `className` es solo para añadir (anchura, alineación, margen): no sobrescribe el
 * padding ni el color de la variante, porque no hay `tailwind-merge`.
 *
 * Los botones de icono, los toggles y los controles de gráfica NO pasan por aquí: su
 * forma es propia y una variante forzada los deformaría.
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
