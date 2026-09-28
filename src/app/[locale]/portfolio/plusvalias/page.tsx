import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { routing } from "@/i18n/routing";
import { getSessionUser } from "@/lib/session";
import { fetchAllLots, fetchPositions } from "@/lib/portfolio.server";
import { Link } from "@/i18n/navigation";
import RealisedGainsReport from "@/components/portfolio/RealisedGainsReport";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "portfolio.realisedGains" });
  // Página privada: nada que indexar.
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function RealisedGainsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Protección server-side: sin sesión válida, al login (con prefijo de locale).
  const user = await getSessionUser();
  if (!user) {
    const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
    redirect(`${prefix}/entrar`);
  }

  const t = await getTranslations("portfolio.realisedGains");
  // Las dos lecturas son independientes: en paralelo.
  const [positions, lots] = await Promise.all([fetchPositions(), fetchAllLots()]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-1">
        <Link
          href="/portfolio"
          className="text-sm font-medium text-brand underline underline-offset-2"
        >
          {t("back")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </div>
      <RealisedGainsReport positions={positions} lots={lots} />
    </div>
  );
}
