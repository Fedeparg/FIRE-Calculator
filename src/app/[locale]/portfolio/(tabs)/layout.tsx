import type { ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { requireSessionUser } from "@/shared/api/session";
import { fetchPositions } from "@/features/portfolio/api.server";
import { ADD_POSITION_HREF } from "@/features/portfolio/add-position";
import PortfolioDataProvider from "@/features/portfolio/components/PortfolioDataProvider";
import PortfolioTabs from "@/features/portfolio/components/PortfolioTabs";

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

/**
 * Shared frame for the portfolio tabs (Summary, Positions, Capital gains, Goal): the header
 * with the actions, the tab bar and the shared data. A layout is not remounted when switching
 * tabs, so positions, prices and currency survive navigation. Import and My account are left
 * out on purpose: they are tasks, not views.
 */
export default async function PortfolioTabsLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Server-side guard: without a valid session, redirect to login (with the locale prefix).
  await requireSessionUser(locale);

  const t = await getTranslations("auth.portfolio");
  const tPortfolio = await getTranslations("portfolio");
  const positions = await fetchPositions();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">{t("title")}</h1>
          <Link
            href="/aprende/guia-de-la-cartera"
            className="text-sm font-medium text-brand underline underline-offset-2"
          >
            {tPortfolio("guideLink")}
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/portfolio/importar"
            className="inline-flex h-11 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-foreground transition hover:bg-surface-2"
          >
            {tPortfolio("import.link")}
          </Link>
          <Link
            href={ADD_POSITION_HREF}
            className="inline-flex h-11 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-brand-fg transition hover:opacity-90"
          >
            {tPortfolio("tabs.addPosition")}
          </Link>
        </div>
      </div>
      <PortfolioDataProvider initialPositions={positions}>
        <PortfolioTabs />
        {children}
      </PortfolioDataProvider>
    </div>
  );
}
