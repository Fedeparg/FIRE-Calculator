import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { privateMetadata } from "@/shared/seo/seo";
import { requireSessionUser } from "@/shared/api/session";
import { Link } from "@/i18n/navigation";
import AccountDangerZone from "@/features/account/components/AccountDangerZone";
import AccountSessions from "@/features/account/components/AccountSessions";
import ConnectedApps from "@/features/account/components/ConnectedApps";
import NotificationSettings from "@/features/account/components/NotificationSettings";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account" });
  return privateMetadata(t("title"));
}

export default async function AccountPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Server-side guard: without a valid session, redirect to login (with the locale prefix).
  const user = await requireSessionUser(locale);

  const t = await getTranslations("account");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-1">
        <Link href="/portfolio" className="text-sm font-medium text-brand underline underline-offset-2">
          {t("back")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </div>
      <NotificationSettings />
      <ConnectedApps />
      <AccountSessions />
      <AccountDangerZone email={user.email} />
    </div>
  );
}
