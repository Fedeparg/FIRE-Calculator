"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { useFormat } from "@/shared/format/use-format";
import { SUPPORTED_CURRENCIES } from "@sextante/core/contracts";
import { usePortfolioData } from "./PortfolioDataProvider";

type Tab = {
  href: string;
  label: string;
  count?: number;
  /** ¿La pestaña expresa importes en la divisa elegida? Si no, se oculta el selector. */
  usesDisplay: boolean;
};

/**
 * Barra de pestañas de la cartera, con el selector de divisa a la derecha. Es navegación
 * entre páginas (cada pestaña tiene su URL, que se puede enlazar y recargar), no un `tablist`
 * de ARIA: por eso son enlaces con `aria-current`. En móvil la barra se desliza en horizontal.
 */
export default function PortfolioTabs() {
  const t = useTranslations("portfolio.tabs");
  const tSummary = useTranslations("portfolio.summary");
  const { currencyLabel } = useFormat();
  const pathname = usePathname();
  const { positions, display, setDisplay } = usePortfolioData();

  const openPositions = positions.filter((p) => p.quantity > 0).length;
  const tabs: Tab[] = [
    { href: "/portfolio", label: t("summary"), usesDisplay: true },
    { href: "/portfolio/posiciones", label: t("positions"), count: openPositions, usesDisplay: true },
    { href: "/portfolio/plusvalias", label: t("gains"), usesDisplay: false },
    { href: "/portfolio/objetivo", label: t("goal"), usesDisplay: true },
  ];
  const active = tabs.find((tab) => tab.href === pathname);
  const activeRef = useRef<HTMLAnchorElement>(null);

  // En móvil la barra se desliza: la pestaña activa se trae a la vista para que no quede cortada.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  return (
    <div className="flex flex-col-reverse gap-3 border-b border-border sm:flex-row sm:items-end sm:justify-between">
      <nav aria-label={t("label")} className="-mb-px flex overflow-x-auto sm:gap-1">
        {tabs.map((tab) => {
          const current = tab === active;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              ref={current ? activeRef : undefined}
              aria-current={current ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-2.5 py-3 text-sm whitespace-nowrap transition-colors sm:px-4 ${
                current
                  ? "border-brand font-semibold text-brand"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    current ? "bg-brand-soft text-brand" : "bg-surface-2 text-muted"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      {active?.usesDisplay !== false && (
        <label className="flex items-center gap-2 self-end text-sm text-muted sm:pb-2">
          {tSummary("displayIn")}
          <select
            value={display}
            onChange={(e) => setDisplay(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {currencyLabel(c)}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
