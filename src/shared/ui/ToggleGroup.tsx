import type { ReactNode } from "react";

type Option<T extends string> = { value: T; label: ReactNode };

/**
 * Cómo ocupa el espacio:
 * - `inline`: tan ancho como sus opciones (conmutadores de una gráfica o un formulario);
 * - `fill`: ocupa todo el ancho, con las opciones a partes iguales (vistas de un panel);
 * - `fillOnMobile`: como `fill` en móvil y como `inline` desde `sm` (filtros de una lista).
 */
type Layout = "inline" | "fill" | "fillOnMobile";

type Props<T extends string> = {
  /** Nombre accesible del grupo. */
  label: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
  /** Tamaño de las opciones en `inline`; los diseños que llenan el ancho tienen el suyo. */
  size?: "sm" | "md";
  layout?: Layout;
};

const GROUP_CLASS: Record<Layout, string> = {
  inline: "flex w-fit rounded-lg bg-surface-2 p-0.5",
  fill: "flex rounded-xl bg-surface-2 p-1",
  fillOnMobile: "flex rounded-xl bg-surface-2 p-1",
};

const OPTION_CLASS: Record<Layout | "inlineMd", string> = {
  inline: "rounded-md px-3 py-1 leading-tight min-h-8 text-xs",
  inlineMd: "rounded-md px-3 py-1 leading-tight min-h-9 text-sm",
  fill: "h-10 flex-1 rounded-lg text-sm",
  fillOnMobile: "h-9 flex-1 whitespace-nowrap rounded-lg px-3 text-sm sm:flex-none",
};

/**
 * Conmutador de pocas opciones excluyentes. Son botones de alternancia (`aria-pressed`) en un
 * `group`, no un `tablist`: no hay paneles que cambiar con flechas, solo cómo se muestra lo de
 * alrededor.
 */
export default function ToggleGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  size = "sm",
  layout = "inline",
}: Props<T>) {
  const optionClass = OPTION_CLASS[layout === "inline" && size === "md" ? "inlineMd" : layout];
  return (
    <div role="group" aria-label={label} className={GROUP_CLASS[layout]}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`${optionClass} transition ${
            value === option.value
              ? "bg-surface font-semibold text-foreground shadow-sm"
              : "text-muted hover:text-foreground"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
