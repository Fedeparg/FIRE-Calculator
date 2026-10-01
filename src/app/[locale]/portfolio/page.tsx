import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { routing } from "@/i18n/routing";
import { getSessionUser } from "@/lib/session";
import { fetchPositions } from "@/lib/portfolio.server";
import { Link } from "@/i18n/navigation";
import LogoutButton from "@/components/auth/LogoutButton";
import PortfolioClient from "@/components/portfolio/PortfolioClient";

type Props = { params: Promise<{ locale: string }> };

export default async function PortfolioPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Protección server-side: sin sesión válida, al login (con prefijo de locale).
  const user = await getSessionUser();
  if (!user) {
    const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
    redirect(`${prefix}/entrar`);
  }

  const t = await getTranslations("auth.portfolio");
  const tAccount = await getTranslations("account");
  const tGains = await getTranslations("portfolio.realisedGains");
  const tGuide = await getTranslations("portfolio");
  const tImport = await getTranslations("portfolio.import");
  const positions = await fetchPositions();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
          <p className="text-sm text-muted">{t("greeting", { email: user.email })}</p>
          <Link
            href="/aprende/guia-de-la-cartera"
            className="text-sm font-medium text-brand underline underline-offset-2"
          >
            {tGuide("guideLink")}
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/portfolio/importar"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-surface-2"
          >
            {tImport("link")}
          </Link>
          <Link
            href="/portfolio/plusvalias"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-surface-2"
          >
            {tGains("link")}
          </Link>
          <Link
            href="/portfolio/cuenta"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-surface-2"
          >
            {tAccount("link")}
          </Link>
          <LogoutButton />
        </div>
      </div>
      <PortfolioClient initialPositions={positions} />
    </div>
  );
}
