import type { ReactNode } from "react";

type Option<T extends string> = { value: T; label: ReactNode };

/**
 * How it takes up space:
 * - `inline`: as wide as its options (toggles in a chart or a form);
 * - `fill`: full width, with equally sized options (views of a panel);
 * - `fillOnMobile`: like `fill` on mobile and like `inline` from `sm` up (list filters).
 */
type Layout = "inline" | "fill" | "fillOnMobile";

type Props<T extends string> = {
  /** Accessible name of the group. */
  label: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
  /** Option size in `inline`; the full-width layouts have their own. */
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
 * Switch between a few mutually exclusive options. These are toggle buttons (`aria-pressed`) in
 * a `group`, not a `tablist`: there are no panels to switch with the arrow keys, only how the
 * surrounding content is shown.
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
