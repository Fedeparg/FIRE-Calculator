type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  /** Nombre accesible del grupo. */
  label: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
  size?: "sm" | "md";
};

/**
 * Conmutador de pocas opciones excluyentes. Son botones de alternancia (`aria-pressed`) en un
 * `group`, no un `tablist`: no hay paneles que cambiar, solo cómo se muestra lo de alrededor.
 */
export default function ToggleGroup<T extends string>({ label, value, options, onChange, size = "sm" }: Props<T>) {
  return (
    <div role="group" aria-label={label} className="flex w-fit rounded-lg bg-surface-2 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`rounded-md px-3 transition ${size === "sm" ? "h-8 text-xs" : "h-9 text-sm"} ${
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
