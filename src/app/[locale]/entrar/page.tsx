import { getTranslations, setRequestLocale } from "next-intl/server";
import LoginForm from "@/features/auth/components/LoginForm";

type Props = { params: Promise<{ locale: string }> };

export default async function LoginPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth.login");

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-16">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </div>
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <LoginForm />
      </div>
    </div>
  );
}
