import type { ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { routing } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { getSessionUser } from "@/lib/session";
import { fetchPositions } from "@/features/portfolio/api.server";
import { ADD_POSITION_HREF } from "@/features/portfolio/add-position";
import PortfolioDataProvider from "@/features/portfolio/components/PortfolioDataProvider";
import PortfolioTabs from "@/features/portfolio/components/PortfolioTabs";

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

/**
 * Marco común de las pestañas de la cartera (Resumen, Posiciones, Plusvalías, Objetivo): la
 * cabecera con las acciones, la barra de pestañas y los datos compartidos. Un layout no se
 * vuelve a montar al cambiar de pestaña, así que posiciones, precios y divisa sobreviven a
 * la navegación. Importar y Mi cuenta quedan fuera a propósito: son tareas, no vistas.
 */
export default async function PortfolioTabsLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Protección server-side: sin sesión válida, al login (con prefijo de locale).
  const user = await getSessionUser();
  if (!user) {
    const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
    redirect(`${prefix}/entrar`);
  }

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
