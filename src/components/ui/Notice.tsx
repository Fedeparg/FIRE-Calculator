type Props = {
  /** Texto del aviso. */
  children: React.ReactNode;
  /** Variante visual. Por defecto "warning" (datos orientativos). */
  variant?: "warning" | "info";
  className?: string;
};

/**
 * Aviso destacado y reutilizable. Se usa, sobre todo, para señalar de forma
 * visible que los resultados de las calculadoras fiscales son orientativos.
 */
export default function Notice({ children, variant = "warning", className = "" }: Props) {
  const styles =
    variant === "warning"
      ? "border-warning-border bg-warning-soft text-warning"
      : "border-border bg-surface-2 text-muted";

  return (
    <div
      role="note"
      className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${styles} ${className}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="mt-0.5 h-4 w-4 shrink-0 fill-current"
      >
        <path
          fillRule="evenodd"
          d="M10 1.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17zM9 6a1 1 0 112 0v5a1 1 0 11-2 0V6zm1 9.5a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5z"
          clipRule="evenodd"
        />
      </svg>
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}
