import { Link } from "@/i18n/navigation";

type Props = {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/40";

const variants = {
  primary: "bg-brand text-brand-fg hover:opacity-90",
  secondary: "border border-border bg-surface text-foreground hover:border-brand",
} as const;

/** Botón-enlace reutilizable del landing (consciente del locale). */
export default function CtaLink({ href, children, variant = "primary", className = "" }: Props) {
  return (
    <Link href={href} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}
