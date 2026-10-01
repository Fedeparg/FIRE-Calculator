"use client";

import { useLocale } from "next-intl";
import { usePathname } from "@/i18n/navigation";

const LOCALES = [
  { code: "es", label: "ES" },
  { code: "en", label: "EN" },
] as const;

export default function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname(); // ruta sin prefijo de idioma (p.ej. "/calculadoras/...")

  function switchTo(code: string) {
    if (code === locale) return;
    // Recarga completa (no navegación de cliente): mantiene el SSG y evita que el
    // <script> de tema se re-renderice en cliente (warning de React 19).
    const rest = pathname === "/" ? "" : pathname;
    const target = code === "es" ? pathname : `/en${rest}`;
    window.location.assign(target);
  }

  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-0.5 text-sm">
      {LOCALES.map(({ code, label }) => (
        <button
          key={code}
          type="button"
          aria-current={locale === code}
          onClick={() => switchTo(code)}
          className={`min-h-8 rounded-md px-2.5 py-1 font-medium transition-colors ${
            locale === code
              ? "bg-brand text-brand-fg"
              : "text-muted hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
